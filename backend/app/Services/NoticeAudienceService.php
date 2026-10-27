<?php

namespace App\Services;

use App\Support\NotificationText;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class NoticeAudienceService
{
    public const TYPE_ALL = 'all';

    public const TYPE_SELECTED = 'selected';

    /** @var string[] */
    public const TARGETABLE_CATEGORIES = ['general', 'maintenance', 'security', 'finance'];

    public static function normalizeAudienceType(?string $value): string
    {
        return $value === self::TYPE_SELECTED ? self::TYPE_SELECTED : self::TYPE_ALL;
    }

    public static function categorySupportsAudienceTargeting(string $category): bool
    {
        return in_array($category, self::TARGETABLE_CATEGORIES, true);
    }

    /**
     * @param  array<int|string>|null  $recipientUserIds
     * @return int[]
     */
    public static function validateRecipientIds(int $communityId, string $audienceType, ?array $recipientUserIds): array
    {
        if ($audienceType !== self::TYPE_SELECTED) {
            return [];
        }

        $ids = collect($recipientUserIds ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            throw ValidationException::withMessages([
                'recipient_user_ids' => ['Select at least one resident.'],
            ]);
        }

        $validIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('user_id', $ids)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if (count($validIds) !== count($ids)) {
            throw ValidationException::withMessages([
                'recipient_user_ids' => ['One or more selected residents are not valid community members.'],
            ]);
        }

        return $validIds;
    }

    /** @param  int[]  $userIds */
    public static function syncRecipients(int $noticeId, array $userIds): void
    {
        DB::table('notice_recipients')->where('notice_id', $noticeId)->delete();

        if ($userIds === []) {
            return;
        }

        $now = now();

        DB::table('notice_recipients')->insert(
            collect($userIds)->map(fn ($uid) => [
                'notice_id'  => $noticeId,
                'user_id'    => $uid,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all(),
        );
    }

    public static function applyResidentVisibilityFilter($query, int $userId): void
    {
        $query->where(function ($q) use ($userId) {
            $q->where(function ($q2) {
                $q2->where('notices.audience_type', self::TYPE_ALL)
                    ->orWhereNull('notices.audience_type');
            })->orWhere(function ($q2) use ($userId) {
                $q2->where('notices.audience_type', self::TYPE_SELECTED)
                    ->whereExists(function ($sub) use ($userId) {
                        $sub->select(DB::raw(1))
                            ->from('notice_recipients')
                            ->whereColumn('notice_recipients.notice_id', 'notices.id')
                            ->where('notice_recipients.user_id', $userId);
                    });
            });
        });
    }

    public static function canUserViewNotice(object $notice, int $userId): bool
    {
        $type = $notice->audience_type ?? self::TYPE_ALL;

        if ($type !== self::TYPE_SELECTED) {
            return true;
        }

        return DB::table('notice_recipients')
            ->where('notice_id', (int) $notice->id)
            ->where('user_id', $userId)
            ->exists();
    }

    /** @return int[] */
    public static function recipientUserIds(int $noticeId): array
    {
        return array_map(
            fn (array $recipient) => (int) $recipient['id'],
            self::recipients($noticeId),
        );
    }

    /**
     * @return array<int, array{id: int, name: string, unit_number: ?string, units: list<string>}>
     */
    public static function recipients(int $noticeId): array
    {
        $notice = DB::table('notices')->where('id', $noticeId)->first(['id', 'community_id']);
        $communityId = $notice ? (int) ($notice->community_id ?? 0) : 0;

        $rows = DB::table('notice_recipients')
            ->join('users', 'users.id', '=', 'notice_recipients.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('notice_recipients.notice_id', $noticeId)
            ->orderByRaw('COALESCE(NULLIF(profiles.display_name, ""), users.name)')
            ->get([
                'users.id',
                'users.name',
                'profiles.display_name',
                'profiles.unit_number',
            ]);

        $unitsMap = $communityId > 0
            ? app(\App\Services\UnitAssignmentService::class)->unitsBriefMapForUsers(
                $communityId,
                $rows->pluck('id')->map(fn ($id) => (int) $id)->all(),
            )
            : [];

        return $rows
            ->map(function ($row) use ($unitsMap) {
                $uid = (int) $row->id;
                $unitNumbers = array_values(array_map(
                    static fn (array $u) => (string) $u['unit_number'],
                    $unitsMap[$uid] ?? [],
                ));
                if ($unitNumbers === [] && $row->unit_number) {
                    $unitNumbers = [(string) $row->unit_number];
                }

                return [
                    'id'          => $uid,
                    'name'        => trim((string) ($row->display_name ?: $row->name)) ?: 'Resident',
                    'unit_number' => $unitNumbers[0] ?? null,
                    'units'       => $unitNumbers,
                ];
            })
            ->all();
    }

    public static function resolveNotificationUserIds(object $notice): Collection
    {
        if (($notice->audience_type ?? self::TYPE_ALL) === self::TYPE_SELECTED) {
            return DB::table('notice_recipients')
                ->where('notice_id', (int) $notice->id)
                ->pluck('user_id');
        }

        if ($notice->is_global ?? false) {
            return DB::table('community_memberships')
                ->where('status', 'approved')
                ->pluck('user_id');
        }

        return DB::table('community_memberships')
            ->where('community_id', (int) $notice->community_id)
            ->where('status', 'approved')
            ->pluck('user_id');
    }

    public static function notifyForNotice(object $notice, ?string $titleOverride = null, ?int $excludeUserId = null): void
    {
        if ($notice->is_global ?? false) {
            $communityIds = DB::table('communities')->where('status', 'active')->pluck('id');
            foreach ($communityIds as $communityId) {
                self::insertNotifications(
                    self::resolveNotificationUserIdsForCommunity($notice, (int) $communityId),
                    $titleOverride ?? $notice->title,
                    (int) $notice->id,
                    $notice->category ?? 'general',
                    $notice->body ?? null,
                    (int) $communityId,
                    $excludeUserId,
                );
            }

            return;
        }

        self::insertNotifications(
            self::resolveNotificationUserIds($notice),
            $titleOverride ?? $notice->title,
            (int) $notice->id,
            $notice->category ?? 'general',
            $notice->body ?? null,
            (int) ($notice->community_id ?? 0),
            $excludeUserId,
        );
    }

    private static function resolveNotificationUserIdsForCommunity(object $notice, int $communityId): Collection
    {
        if (($notice->audience_type ?? self::TYPE_ALL) === self::TYPE_SELECTED) {
            return DB::table('notice_recipients')
                ->join('community_memberships', function ($join) use ($communityId) {
                    $join->on('community_memberships.user_id', '=', 'notice_recipients.user_id')
                        ->where('community_memberships.community_id', $communityId)
                        ->where('community_memberships.status', 'approved');
                })
                ->where('notice_recipients.notice_id', (int) $notice->id)
                ->pluck('notice_recipients.user_id');
        }

        return DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->pluck('user_id');
    }

    private static function insertNotifications(
        Collection $userIds,
        string $noticeTitle,
        int $noticeId,
        string $category,
        ?string $noticeBody = null,
        int $communityId = 0,
        ?int $excludeUserId = null,
    ): void {
        $userIds = self::exceptActor($userIds, $excludeUserId);
        if ($userIds->isEmpty()) {
            return;
        }

        $label = match ($category) {
            'event'     => 'New Event',
            'emergency' => 'New Alert',
            default     => 'New Notice',
        };

        $summary = trim((string) ($noticeBody ?: $noticeTitle));
        if ($summary === '') {
            $summary = $noticeTitle;
        }

        $now  = now();
        $rows = $userIds->unique()->map(fn ($uid) => [
            'user_id'    => (int) $uid,
            'type'       => $category === 'emergency' ? 'warning' : 'info',
            'title'      => NotificationText::title($label),
            'body'       => NotificationText::body($summary),
            'action_url' => "/notices/{$noticeId}",
            'read_at'    => null,
            'created_at' => $now,
            'updated_at' => $now,
        ])->values()->all();

        if ($rows === []) {
            return;
        }

        try {
            DB::table('app_notifications')->insert($rows);
        } catch (\Throwable $e) {
            Log::warning('Notice audience notifications failed', [
                'notice_id' => $noticeId,
                'error'     => $e->getMessage(),
            ]);

            return;
        }

        $kind = match ($category) {
            'event'     => 'event',
            'emergency' => 'alert',
            default     => 'notice',
        };
        $pushData = array_filter([
            'category'     => $category,
            'notice_id'    => $noticeId,
            'kind'         => $kind,
            'community_id' => $communityId > 0 ? $communityId : null,
        ], static fn ($value) => $value !== null);

        foreach ($userIds->unique() as $userId) {
            NotificationService::deliverPush(
                (int) $userId,
                $category === 'emergency' ? 'warning' : 'info',
                NotificationText::title($label),
                NotificationText::body($summary),
                "/notices/{$noticeId}",
                $pushData,
            );
        }
    }

    /**
     * Notify the original audience that a published event was cancelled/deleted.
     * Uses a safe action URL because the event detail is no longer available.
     */
    public static function notifyEventCancelled(object $notice, ?int $excludeUserId = null): void
    {
        if (($notice->category ?? '') !== 'event') {
            return;
        }

        $wasVisible = ($notice->status ?? '') === 'published' || ! empty($notice->published_at);
        if (! $wasVisible) {
            return;
        }

        $userIds = self::exceptActor(self::resolveNotificationUserIds($notice), $excludeUserId);
        if ($userIds->isEmpty()) {
            return;
        }

        $eventTitle = trim((string) ($notice->title ?? 'Event')) ?: 'Event';
        $title = 'Event Cancelled';
        $body = "The event \"{$eventTitle}\" has been cancelled.";

        foreach ($userIds as $userId) {
            NotificationService::send(
                (int) $userId,
                'warning',
                $title,
                $body,
                '/screens/notices',
                [
                    'category'  => 'event',
                    'notice_id' => (int) $notice->id,
                    'kind'      => 'event_cancelled',
                ],
            );
        }
    }

    /** Drop the person who performed the action before any inbox row or push is created. */
    private static function exceptActor(Collection $userIds, ?int $excludeUserId): Collection
    {
        $ids = $userIds
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values();

        if ($excludeUserId === null || $excludeUserId < 1) {
            return $ids;
        }

        return $ids->reject(fn (int $id) => $id === $excludeUserId)->values();
    }
}
