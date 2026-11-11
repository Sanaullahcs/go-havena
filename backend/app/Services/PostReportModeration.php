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
    /** Pending resident post reports (not comments) needed before auto-marking sensitive. */
    public const RESIDENT_REPORTS_TO_SENSITIVE = 3;

    public const SENSITIVE_SOURCE_ADMIN = 'admin';

    public const SENSITIVE_SOURCE_RESIDENTS = 'residents';

    public static function isPollContent(object $post): bool
    {
        return ($post->category ?? '') === 'poll';
    }

    /** @return 'post'|'poll' */
    public static function contentKind(object $post): string
    {
        return self::isPollContent($post) ? 'poll' : 'post';
    }

    /** @return 'Post'|'Poll' */
    public static function contentTitle(object $post): string
    {
        return self::isPollContent($post) ? 'Poll' : 'Post';
    }

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
        return self::pendingPostReportsCount($postId);
    }

    /** Pending resident reports on the post itself (excludes comment reports). */
    public static function pendingPostReportsCount(int $postId): int
    {
        if (! Schema::hasTable('post_reports')) {
            return 0;
        }

        $query = DB::table('post_reports')
            ->where('post_id', $postId)
            ->where('source', 'resident');

        if (Schema::hasColumn('post_reports', 'comment_id')) {
            $query->whereNull('comment_id');
        }

        if (Schema::hasColumn('post_reports', 'status')) {
            $query->where(function ($inner) {
                $inner->where('status', self::PENDING)->orWhereNull('status');
            });
        }

        return (int) $query->count();
    }

    /**
     * When enough distinct pending resident post reports exist, mark the post sensitive
     * (same outcome as an admin report). Polls use the same posts row and rules.
     */
    public static function maybeMarkSensitiveFromResidentReports(int $postId, int $actingReporterId): bool
    {
        if (! Schema::hasTable('posts') || ! Schema::hasColumn('posts', 'is_sensitive')) {
            return false;
        }

        $post = DB::table('posts')->where('id', $postId)->whereNull('deleted_at')->first();
        if (! $post || (bool) ($post->is_sensitive ?? false)) {
            return false;
        }

        if (self::pendingPostReportsCount($postId) < self::RESIDENT_REPORTS_TO_SENSITIVE) {
            return false;
        }

        $update = [
            'is_sensitive' => true,
            'updated_at'   => now(),
        ];
        if (Schema::hasColumn('posts', 'sensitive_source')) {
            $update['sensitive_source'] = self::SENSITIVE_SOURCE_RESIDENTS;
        }
        if (Schema::hasColumn('posts', 'sensitive_reason')) {
            $update['sensitive_reason'] = null;
        }
        DB::table('posts')->where('id', $postId)->update($update);

        $reporterIds = DB::table('post_reports')
            ->where('post_id', $postId)
            ->where('source', 'resident')
            ->when(Schema::hasColumn('post_reports', 'comment_id'), fn ($q) => $q->whereNull('comment_id'))
            ->when(Schema::hasColumn('post_reports', 'status'), function ($q) {
                $q->where(function ($inner) {
                    $inner->where('status', self::PENDING)->orWhereNull('status');
                });
            })
            ->pluck('reporter_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        self::notifyAuthorOfModeration($post, $actingReporterId, 'marked_sensitive');

        foreach ($reporterIds as $residentReporterId) {
            self::notifyReporter(
                $residentReporterId,
                $postId,
                (int) ($post->community_id ?? 0),
                'marked_sensitive',
                $post,
            );
        }

        $label = self::contentTitle($post);
        ActivityLogService::user(
            'post_marked_sensitive_auto',
            $label.' #'.$postId.' marked sensitive after '.self::RESIDENT_REPORTS_TO_SENSITIVE.' resident reports',
            'Post',
            $postId,
            'warning',
            null,
            ['threshold' => self::RESIDENT_REPORTS_TO_SENSITIVE],
        );

        return true;
    }

    /**
     * Unmarks resident-driven sensitivity when valid pending reports fall below the threshold.
     * Admin-marked sensitive posts are not changed.
     */
    public static function syncResidentSensitivityState(int $postId): void
    {
        if (! Schema::hasTable('posts') || ! Schema::hasColumn('posts', 'is_sensitive')) {
            return;
        }

        $post = DB::table('posts')->where('id', $postId)->whereNull('deleted_at')->first();
        if (! $post || ! (bool) ($post->is_sensitive ?? false)) {
            return;
        }

        $source = $post->sensitive_source ?? null;
        if ($source !== self::SENSITIVE_SOURCE_RESIDENTS) {
            return;
        }

        if (self::pendingPostReportsCount($postId) >= self::RESIDENT_REPORTS_TO_SENSITIVE) {
            return;
        }

        $update = [
            'is_sensitive' => false,
            'updated_at'   => now(),
        ];
        if (Schema::hasColumn('posts', 'sensitive_source')) {
            $update['sensitive_source'] = null;
        }
        if (Schema::hasColumn('posts', 'sensitive_reason')) {
            $update['sensitive_reason'] = null;
        }

        DB::table('posts')->where('id', $postId)->update($update);
    }

    /** @return array{sensitive_label: string, sensitive_message: string, sensitive_reason: ?string, sensitive_source: ?string} */
    public static function sensitivePresentation(object $post): array
    {
        $isPoll = self::isPollContent($post);
        $kind = $isPoll ? 'poll' : 'post';
        $isSensitive = (bool) ($post->is_sensitive ?? false);

        if (! $isSensitive) {
            return [
                'sensitive_source'  => null,
                'sensitive_label'   => null,
                'sensitive_message' => null,
                'sensitive_reason'  => null,
            ];
        }

        $source = $post->sensitive_source ?? null;
        $reason = isset($post->sensitive_reason) ? trim((string) $post->sensitive_reason) : null;
        if ($reason === '') {
            $reason = null;
        }

        if ($source === self::SENSITIVE_SOURCE_ADMIN) {
            return [
                'sensitive_source'  => self::SENSITIVE_SOURCE_ADMIN,
                'sensitive_label'   => 'Marked as Sensitive by Community Admin',
                'sensitive_message' => $isPoll
                    ? 'Your community admin reviewed this poll and marked it as sensitive.'
                    : 'Your community admin reviewed this post and marked it as sensitive.',
                'sensitive_reason'  => $reason,
            ];
        }

        if ($source === self::SENSITIVE_SOURCE_RESIDENTS) {
            return [
                'sensitive_source'  => self::SENSITIVE_SOURCE_RESIDENTS,
                'sensitive_label'   => 'Reported by Residents',
                'sensitive_message' => $isPoll
                    ? 'This poll received multiple resident reports. Community admins may review it. Reporter identities are not shown.'
                    : 'This post received multiple resident reports. Community admins may review it. Reporter identities are not shown.',
                'sensitive_reason'  => null,
            ];
        }

        return [
            'sensitive_source'  => null,
            'sensitive_label'   => 'Sensitive content',
            'sensitive_message' => $isPoll
                ? 'This poll has been marked as sensitive due to community guidelines.'
                : 'This post has been marked as sensitive due to community guidelines.',
            'sensitive_reason'  => $reason,
        ];
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
        $formatted['sensitive_report_threshold'] = self::RESIDENT_REPORTS_TO_SENSITIVE;
        if (! $isSensitive) {
            $formatted['reports_until_sensitive'] = max(0, self::RESIDENT_REPORTS_TO_SENSITIVE - $pending);
        }

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

        $contentTitle = self::contentTitle($post);
        $contentKind = self::contentKind($post);
        $title = $toSystem
            ? "Community admin {$contentKind} reported"
            : "{$contentTitle} reported";
        $body = $toSystem
            ? "A resident reported a community admin {$contentKind}. It is pending review."
            : "A resident reported a community {$contentKind}. It is pending review.";

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

    public static function notifyReporter(int $reporterId, int $postId, int $communityId, string $resolution, ?object $post = null): void
    {
        $kind = $post ? self::contentKind($post) : 'post';
        $body = match ($resolution) {
            'marked_sensitive' => "Your report was reviewed. The {$kind} was marked as sensitive.",
            'removed' => "Your report was reviewed. The {$kind} was removed from the community feed.",
            default => "Your report was reviewed. No change was made to the {$kind}.",
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
        $released = $resolution === 'sensitive_released';
        $contentTitle = self::contentTitle($post);
        $contentKind = self::contentKind($post);

        $title = $released
            ? "{$contentTitle} released by admin"
            : ($sensitive ? "{$contentTitle} marked as sensitive" : "{$contentTitle} removed from feed");
        $body = $released
            ? (self::isPollContent($post)
                ? 'A community admin released your poll. Residents can vote again.'
                : 'A community admin released your post from sensitive status.')
            : ($sensitive
                ? "A moderator marked your {$contentKind} as sensitive. It stays in the feed behind a sensitive-content warning."
                : "Your {$contentKind} was removed from the community feed by a moderator.");

        NotificationService::send(
            $authorId,
            $released ? 'info' : 'warning',
            $title,
            $body,
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
