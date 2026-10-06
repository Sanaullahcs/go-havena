<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\CommunityFeatureService;
use App\Support\CommunityFeatureCatalog;
use App\Support\NotificationModule;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    /** GET /notifications */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = DB::table('app_notifications')->where('user_id', $user->id);
        $this->applyFeatureVisibility($base, $user);

        $unread = (clone $base)->whereNull('read_at')->count();
        $totalAll = (clone $base)->count();

        $query = clone $base;

        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }

        if ($request->filled('type')) {
            $query->where('type', $request->string('type')->toString());
        }

        if ($request->filled('module')) {
            NotificationModule::applyFilter($query, $request->string('module')->toString());
        }

        $perPage = min(max((int) $request->get('per_page', 10), 1), 50);
        $page = max((int) $request->get('page', 1), 1);

        $paginator = $query
            ->orderByRaw('CASE WHEN read_at IS NULL THEN 0 ELSE 1 END')
            ->orderByDesc('created_at')
            ->paginate($perPage, ['*'], 'page', $page);

        $items = $this->enrichNoticeNotifications(collect($paginator->items()))
            ->map(function ($row) {
                foreach (['created_at', 'updated_at', 'read_at'] as $column) {
                    if (! isset($row->{$column}) || $row->{$column} === null || $row->{$column} === '') {
                        continue;
                    }
                    $row->{$column} = \Carbon\Carbon::parse($row->{$column})->utc()->toIso8601String();
                }

                return $row;
            });

        return response()->json([
            'data'   => $items->values(),
            'unread' => $unread,
            'meta'   => [
                'total'        => $paginator->total(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'total_all'    => $totalAll,
                'warning'      => (clone $base)->where('type', 'warning')->count(),
                'message'      => (clone $base)->where('type', 'message')->count(),
                'system'       => (clone $base)->where('type', 'system')->count(),
                ...NotificationModule::countAllModules($base),
            ],
        ]);
    }

    /** POST /notifications/{id}/read */
    public function markRead(Request $request, int $id): JsonResponse
    {
        DB::table('app_notifications')
            ->where('id', $id)
            ->where('user_id', $request->user()->id)
            ->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }

    /** POST /notifications/read-all */
    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = DB::table('app_notifications')
            ->where('user_id', $user->id)
            ->whereNull('read_at');
        $this->applyFeatureVisibility($query, $user);
        $query->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }

    /**
     * Hide notifications whose feature is off for this user right now.
     * Rows stay stored, so turning the feature back on shows them again.
     */
    private function applyFeatureVisibility(Builder $query, mixed $user): void
    {
        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        $service = app(CommunityFeatureService::class);
        $flags = $service->flagsForCommunity($service->communityIdForUser($user));
        $disabled = array_keys(array_filter(
            $flags,
            static fn (bool $enabled): bool => ! $enabled,
        ));
        if ($disabled === []) {
            return;
        }

        $rows = (clone $query)->get(['id', 'title', 'body', 'action_url', 'data']);
        $noticeIds = [];
        foreach ($rows as $row) {
            $noticeId = CommunityFeatureCatalog::noticeIdFromActionUrl($row->action_url ?? null);
            if ($noticeId) {
                $noticeIds[] = $noticeId;
            }
        }

        $noticeCategories = $noticeIds === []
            ? []
            : DB::table('notices')->whereIn('id', array_values(array_unique($noticeIds)))->pluck('category', 'id')->all();

        $hiddenIds = [];
        foreach ($rows as $row) {
            $keys = CommunityFeatureCatalog::featureKeysForNotification(
                $row->action_url ?? null,
                $row->title ?? null,
                $row->body ?? null,
                $row->data ?? null,
                $noticeCategories,
            );
            if ($keys === []) {
                continue;
            }

            $allowed = false;
            foreach ($keys as $key) {
                if ($flags[$key] ?? true) {
                    $allowed = true;
                    break;
                }
            }

            if (! $allowed) {
                $hiddenIds[] = (int) $row->id;
            }
        }

        if ($hiddenIds !== []) {
            $query->whereNotIn('id', $hiddenIds);
        }
    }

    private function enrichNoticeNotifications(Collection $notifications): Collection
    {
        $noticeIds = $notifications
            ->map(fn ($row) => $this->extractNoticeId($row->action_url ?? null))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($noticeIds === []) {
            return $notifications;
        }

        $notices = DB::table('notices')
            ->whereIn('id', $noticeIds)
            ->whereNull('deleted_at')
            ->get(['id', 'title', 'body', 'category', 'status'])
            ->keyBy('id');

        return $notifications->map(function ($row) use ($notices) {
            $noticeId = $this->extractNoticeId($row->action_url ?? null);
            if (! $noticeId) {
                return $row;
            }

            $notice = $notices->get($noticeId);
            if (! $notice) {
                return $row;
            }

            $row->notice_category = $notice->category ?? null;
            $row->notice_id = (int) $notice->id;

            // Only sync live notice content for standard notice broadcasts.
            // Custom alerts (e.g. event join/leave) keep their stored title/body.
            if (($notice->status ?? '') !== 'published') {
                return $row;
            }

            $expectedLabel = $this->noticeNotificationLabel($notice->category ?? 'general');
            if (($row->title ?? '') !== $expectedLabel) {
                return $row;
            }

            $row->title = $expectedLabel;
            $row->body  = $this->noticeNotificationSummary($notice);
            $row->type  = ($notice->category ?? '') === 'emergency' ? 'warning' : 'info';

            return $row;
        });
    }

    private function extractNoticeId(?string $actionUrl): ?int
    {
        if (! $actionUrl || ! preg_match('#/notices/(\d+)#', $actionUrl, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }

    private function noticeNotificationLabel(string $category): string
    {
        return match ($category) {
            'event'     => 'New Event',
            'emergency' => 'New Alert',
            default     => 'New Notice',
        };
    }

    private function noticeNotificationSummary(object $notice): string
    {
        $summary = trim((string) ($notice->body ?: $notice->title));
        if ($summary === '') {
            $summary = (string) $notice->title;
        }

        return $summary;
    }
}
