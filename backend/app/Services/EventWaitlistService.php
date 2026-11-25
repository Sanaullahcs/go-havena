<?php

namespace App\Services;

use App\Support\MediaUrl;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EventWaitlistService
{
    /** @return array<int> Promoted user IDs in promotion order. */
    public static function promoteFromWaitlist(int $noticeId, ?int $capacity): array
    {
        if ($capacity === null) {
            return [];
        }

        $promoted = [];

        while (true) {
            $goingCount = (int) DB::table('event_rsvps')
                ->where('notice_id', $noticeId)
                ->where('status', 'going')
                ->count();

            if ($goingCount >= $capacity) {
                break;
            }

            $next = DB::table('event_rsvps')
                ->where('notice_id', $noticeId)
                ->where('status', 'waiting')
                ->orderBy('created_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if (! $next) {
                break;
            }

            DB::table('event_rsvps')
                ->where('id', $next->id)
                ->update([
                    'status'     => 'going',
                    'updated_at' => now(),
                ]);

            $promoted[] = (int) $next->user_id;
        }

        return $promoted;
    }

    public static function notifyPromotedUsers(object $notice, array $userIds): void
    {
        if ($userIds === []) {
            return;
        }

        $title = trim((string) ($notice->title ?? 'Event'));
        if ($title === '') {
            $title = 'Event';
        }

        $body = "A seat opened up for \"{$title}\". You've been added to the confirmed attendee list.";
        $actionUrl = "/notices/{$notice->id}";

        foreach ($userIds as $userId) {
            NotificationService::send(
                $userId,
                'success',
                'Seat Available',
                $body,
                $actionUrl,
                ['notice_id' => (int) $notice->id, 'type' => 'event_waitlist_promoted', 'category' => 'event'],
            );
        }
    }

    public static function waitlistCount(int $noticeId): int
    {
        return (int) DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('status', 'waiting')
            ->count();
    }

    public static function isUserWaitlisted(int $noticeId, ?int $userId): bool
    {
        if (! $userId) {
            return false;
        }

        return DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('user_id', $userId)
            ->where('status', 'waiting')
            ->exists();
    }

    public static function waitlistPosition(int $noticeId, ?int $userId): ?int
    {
        if (! $userId) {
            return null;
        }

        $row = DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('user_id', $userId)
            ->where('status', 'waiting')
            ->first(['created_at', 'id']);

        if (! $row) {
            return null;
        }

        $ahead = (int) DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('status', 'waiting')
            ->where(function ($query) use ($row) {
                $query->where('created_at', '<', $row->created_at)
                    ->orWhere(function ($inner) use ($row) {
                        $inner->where('created_at', '=', $row->created_at)
                            ->where('id', '<', $row->id);
                    });
            })
            ->count();

        return $ahead + 1;
    }

    /** @return list<array<string, mixed>> */
    public static function waitlistEntries(int $noticeId): array
    {
        return DB::table('event_rsvps')
            ->join('users', 'users.id', '=', 'event_rsvps.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'event_rsvps.user_id')
            ->where('event_rsvps.notice_id', $noticeId)
            ->where('event_rsvps.status', 'waiting')
            ->orderBy('event_rsvps.created_at')
            ->orderBy('event_rsvps.id')
            ->select(
                'users.id',
                'users.name',
                'profiles.avatar_url',
                'event_rsvps.created_at',
            )
            ->get()
            ->values()
            ->map(function ($row, int $index) {
                return [
                    'id'         => (int) $row->id,
                    'name'       => $row->name,
                    'avatar_url' => MediaUrl::toPublic($row->avatar_url ?? null, request()),
                    'joined_at'  => (string) $row->created_at,
                    'position'   => $index + 1,
                ];
            })
            ->all();
    }

    public static function batchWaitlistCounts(array $noticeIds): Collection
    {
        if ($noticeIds === []) {
            return collect();
        }

        return DB::table('event_rsvps')
            ->whereIn('notice_id', $noticeIds)
            ->where('status', 'waiting')
            ->groupBy('notice_id')
            ->selectRaw('notice_id, COUNT(*) as cnt')
            ->pluck('cnt', 'notice_id');
    }
}
