<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Resident post reports stay pending until a permitted admin dismisses them,
 * marks the post sensitive, or removes the post. The post itself is unchanged
 * until one of those moderation actions.
 */
class PostReportModeration
{
    public const PENDING = 'pending_review';

    public const DISMISSED = 'dismissed';

    public const RESOLVED = 'resolved';

    public const QUEUE_COMMUNITY = 'community_admin';

    public const QUEUE_SYSTEM = 'system_admin';

    public static function routesUserToSystemAdmin(int $userId): bool
    {
        $role = DB::table('users')->where('id', $userId)->value('role');

        return in_array((string) $role, ['community_admin', 'system_admin', 'admin'], true);
    }

    public static function routesToSystemAdmin(object $post): bool
    {
        if (isset($post->author_role) && $post->author_role !== null && $post->author_role !== '') {
            return in_array((string) $post->author_role, ['community_admin', 'system_admin', 'admin'], true);
        }

        return isset($post->user_id) && self::routesUserToSystemAdmin((int) $post->user_id);
    }

    public static function reviewQueueForUser(int $userId): string
    {
        return self::routesUserToSystemAdmin($userId) ? self::QUEUE_SYSTEM : self::QUEUE_COMMUNITY;
    }

    public static function canReview(?User $viewer, object $post): bool
    {
        if (! $viewer) {
            return false;
        }

        if (AdminRoleService::isSystemAdmin($viewer)) {
            return true;
        }

        if (self::routesToSystemAdmin($post)) {
            return false;
        }

        return AdminRoleService::canManageCommunity($viewer, (int) $post->community_id);
    }

    public static function pendingCount(int $postId): int
    {
        if (! Schema::hasTable('post_reports')) {
            return 0;
        }

        $query = DB::table('post_reports')
            ->where('post_id', $postId)
            ->where('source', 'resident');

        if (Schema::hasColumn('post_reports', 'status')) {
            $query->where(function ($inner) {
                $inner->where('status', self::PENDING)->orWhereNull('status');
            });
        }

        return (int) $query->count();
    }

    /** @param  array<string, mixed>  $formatted */
    public static function presentForAdmin(array $formatted, object $post, ?User $viewer): array
    {
        $canReview = self::canReview($viewer, $post);
        $pending = (int) ($formatted['resident_reports_count'] ?? 0);
        $isAuthor = $viewer && (int) ($post->user_id ?? 0) === (int) $viewer->id;
        $isSensitive = (bool) ($formatted['is_sensitive'] ?? false);

        $formatted['reports_restricted'] = ! $canReview;
        $formatted['can_mark_sensitive'] = ! $isSensitive && ($canReview || ($isAuthor && $pending === 0));
        $formatted['can_remove_post'] = $canReview || ($isAuthor && $pending === 0);

        if (! $canReview) {
            $formatted['reports_count'] = 0;
            $formatted['resident_reports_count'] = 0;
            if (! $isSensitive) {
                $formatted['report_status'] = 'published';
            }
        }

        return $formatted;
    }

    public static function notifyReviewers(object $post, int $reporterId, ?int $reportedUserId = null): void
    {
        $communityId = (int) ($post->community_id ?? 0);
        $postId = (int) $post->id;
        $reportedUserId = $reportedUserId ?? (int) $post->user_id;
        $toSystem = self::routesUserToSystemAdmin($reportedUserId);

        $recipientIds = $toSystem
            ? self::systemAdminIds($reporterId)
            : self::communityAdminIds($communityId, $reporterId, (int) $post->user_id);

        $title = $toSystem ? 'Community admin post reported' : 'Post reported';
        $body = $toSystem
            ? 'A resident reported a community admin post. It is pending review.'
            : 'A resident reported a community post. It is pending review.';

        foreach ($recipientIds as $adminId) {
            NotificationService::send(
                $adminId,
                'warning',
                $title,
                $body,
                '/admin/feed?post='.$postId,
                [
                    'kind'         => 'post_report',
                    'post_id'      => $postId,
                    'community_id' => $communityId,
                    'review_queue' => $toSystem ? self::QUEUE_SYSTEM : self::QUEUE_COMMUNITY,
                ],
                $communityId > 0 ? $communityId : null,
            );
        }
    }

    public static function notifyReporter(int $reporterId, int $postId, int $communityId, string $resolution): void
    {
        $body = match ($resolution) {
            'marked_sensitive' => 'Your report was reviewed. The post was marked as sensitive.',
            'removed' => 'Your report was reviewed. The post was removed from the community feed.',
            default => 'Your report was reviewed. No change was made to the post.',
        };

        NotificationService::send(
            $reporterId,
            $resolution === 'dismissed' ? 'info' : 'success',
            'Report reviewed',
            $body,
            '/screens/community-feed/comments?postId='.$postId,
            [
                'kind'         => 'post_report_resolved',
                'post_id'      => $postId,
                'community_id' => $communityId,
                'resolution'   => $resolution,
            ],
            $communityId > 0 ? $communityId : null,
        );
    }

    public static function notifyAuthorOfModeration(object $post, int $actorId, string $resolution): void
    {
        $authorId = (int) $post->user_id;
        if ($authorId === $actorId) {
            return;
        }

        $postId = (int) $post->id;
        $communityId = (int) ($post->community_id ?? 0);
        $sensitive = $resolution === 'marked_sensitive';

        NotificationService::send(
            $authorId,
            'warning',
            $sensitive ? 'Post marked as sensitive' : 'Post removed from feed',
            $sensitive
                ? 'A moderator marked your post as sensitive. It stays in the feed behind a sensitive-content warning.'
                : 'Your post was removed from the community feed by a moderator.',
            '/screens/community-feed/comments?postId='.$postId,
            [
                'kind'         => 'post_moderation',
                'post_id'      => $postId,
                'community_id' => $communityId,
                'resolution'   => $resolution,
            ],
            $communityId > 0 ? $communityId : null,
        );
    }

    /** @return array<int, int> reporter ids that were updated */
    public static function resolveOpenReports(int $postId, string $resolution, int $actorId, bool $includeComments = false): array
    {
        if (! Schema::hasTable('post_reports') || ! Schema::hasColumn('post_reports', 'status')) {
            return [];
        }

        $query = DB::table('post_reports')
            ->where('post_id', $postId)
            ->where('source', 'resident')
            ->where(function ($inner) {
                $inner->where('status', self::PENDING)->orWhereNull('status');
            });

        if (! $includeComments && Schema::hasColumn('post_reports', 'comment_id')) {
            $query->whereNull('comment_id');
        }

        $reports = $query->get(['id', 'reporter_id']);
        if ($reports->isEmpty()) {
            return [];
        }

        DB::table('post_reports')
            ->whereIn('id', $reports->pluck('id')->all())
            ->update([
                'status'      => self::RESOLVED,
                'resolution'  => $resolution,
                'resolved_by' => $actorId,
                'resolved_at' => now(),
                'updated_at'  => now(),
            ]);

        ActivityLogService::user(
            'post_report_resolved',
            'Resolved '.$reports->count().' report(s) on post #'.$postId,
            'Post',
            $postId,
            'warning',
            null,
            [
                'resolution' => $resolution,
                'report_ids' => $reports->pluck('id')->map(fn ($id) => (int) $id)->all(),
            ],
        );

        return $reports->pluck('reporter_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
    }

    /** @return array<int, int> */
    private static function communityAdminIds(int $communityId, int $exceptUserId, int $authorId): array
    {
        if ($communityId < 1 || ! Schema::hasTable('community_memberships')) {
            return [];
        }

        return DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator', 'community_admin'])
            ->whereNotIn('user_id', array_values(array_unique([$exceptUserId, $authorId])))
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<int, int> */
    private static function systemAdminIds(int $exceptUserId): array
    {
        return DB::table('users')
            ->whereIn('role', ['system_admin', 'admin'])
            ->where('status', 'active')
            ->where('id', '!=', $exceptUserId)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
