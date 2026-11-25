<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class UserBlockService
{
    public static function tableReady(): bool
    {
        return Schema::hasTable('user_blocks');
    }

    /** User ids this viewer has blocked (their content is hidden from the viewer). */
    public static function hiddenAuthorIdsFor(int $viewerId): array
    {
        if (! self::tableReady() || $viewerId < 1) {
            return [];
        }

        return DB::table('user_blocks')
            ->where('blocker_id', $viewerId)
            ->pluck('blocked_user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** User ids blocked in either direction (no messaging or interaction). */
    public static function blockedEitherWayIdsFor(int $viewerId): array
    {
        if (! self::tableReady() || $viewerId < 1) {
            return [];
        }

        $blockedByMe = DB::table('user_blocks')
            ->where('blocker_id', $viewerId)
            ->pluck('blocked_user_id');

        $blockedMe = DB::table('user_blocks')
            ->where('blocked_user_id', $viewerId)
            ->pluck('blocker_id');

        return $blockedByMe->merge($blockedMe)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    public static function viewerHasBlocked(int $viewerId, int $otherId): bool
    {
        if (! self::tableReady() || $viewerId < 1 || $otherId < 1 || $viewerId === $otherId) {
            return false;
        }

        return DB::table('user_blocks')
            ->where('blocker_id', $viewerId)
            ->where('blocked_user_id', $otherId)
            ->exists();
    }

    public static function isBlockedEitherWay(int $userA, int $userB): bool
    {
        if (! self::tableReady() || $userA < 1 || $userB < 1 || $userA === $userB) {
            return false;
        }

        return DB::table('user_blocks')
            ->where(function ($q) use ($userA, $userB) {
                $q->where('blocker_id', $userA)->where('blocked_user_id', $userB);
            })
            ->orWhere(function ($q) use ($userA, $userB) {
                $q->where('blocker_id', $userB)->where('blocked_user_id', $userA);
            })
            ->exists();
    }

    public static function assertCanInteract(int $userA, int $userB): void
    {
        if (self::isBlockedEitherWay($userA, $userB)) {
            abort(422, 'You cannot interact with this user.');
        }
    }

    public static function isSystemLevelUser(?object $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array((string) ($user->role ?? ''), ['system_admin', 'admin'], true);
    }

    /** Block is only for another resident — not admins, system accounts, or communities. */
    public static function isBlockableResident(?object $user, ?int $communityId = null): bool
    {
        if (! $user) {
            return false;
        }

        $accountRole = strtolower((string) ($user->role ?? ''));
        if ($accountRole !== 'resident') {
            return false;
        }

        if (! Schema::hasTable('community_memberships')) {
            return true;
        }

        $membershipQuery = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved');

        if ($communityId) {
            $membershipQuery->where('community_id', $communityId);
        }

        $membershipRoles = $membershipQuery->pluck('role');
        foreach ($membershipRoles as $membershipRole) {
            if (in_array(strtolower((string) $membershipRole), ['admin', 'moderator', 'community_admin'], true)) {
                return false;
            }
        }

        return true;
    }

    public static function canBlock(int $blockerId, int $targetId, ?int $communityId = null): bool
    {
        if ($blockerId < 1 || $targetId < 1 || $blockerId === $targetId) {
            return false;
        }

        $target = DB::table('users')->where('id', $targetId)->where('status', '!=', 'deleted')->first();

        return self::isBlockableResident($target, $communityId);
    }

    /** Residents may report posts/comments only from other residents (not community admins). */
    public static function canReportContentAuthor(int $authorId, ?int $communityId = null): bool
    {
        if ($authorId < 1) {
            return false;
        }

        $author = DB::table('users')->where('id', $authorId)->where('status', '!=', 'deleted')->first();

        return self::isBlockableResident($author, $communityId);
    }

    public static function assertBlockableUser(int $blockerId, int $targetId, ?int $communityId = null): void
    {
        if ($blockerId === $targetId) {
            abort(422, 'You cannot block yourself.');
        }

        $target = DB::table('users')->where('id', $targetId)->where('status', '!=', 'deleted')->first();
        if (! $target) {
            if (Schema::hasTable('communities') && DB::table('communities')->where('id', $targetId)->exists()) {
                abort(422, 'You can only block another user.');
            }
            abort(404, 'User not found.');
        }

        if (! self::isBlockableResident($target, $communityId)) {
            abort(422, 'You can only block another resident.');
        }
    }

    public static function block(int $blockerId, int $blockedUserId, ?int $communityId = null): void
    {
        if (! self::tableReady()) {
            abort(503, 'Blocking is temporarily unavailable.');
        }

        self::assertBlockableUser($blockerId, $blockedUserId, $communityId);

        $already = self::viewerHasBlocked($blockerId, $blockedUserId);
        if ($already) {
            return;
        }

        DB::table('user_blocks')->insert([
            'blocker_id'      => $blockerId,
            'blocked_user_id' => $blockedUserId,
            'community_id'    => $communityId,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $blockerName = self::displayName($blockerId);
        $blockedName = self::displayName($blockedUserId);
        $reportCommunityId = $communityId ?: self::sharedCommunityId($blockerId, $blockedUserId);

        if ($reportCommunityId && Schema::hasTable('reports')) {
            DB::table('reports')->insert([
                'community_id'     => $reportCommunityId,
                'reporter_id'      => $blockerId,
                'reported_user_id' => $blockedUserId,
                'type'             => 'other',
                'title'            => 'User blocked',
                'description'      => "{$blockerName} blocked {$blockedName}. Review this account for objectionable or abusive behavior.",
                'severity'         => 'medium',
                'status'           => 'open',
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
        }

        ActivityLogService::user(
            'user_blocked',
            "Blocked user #{$blockedUserId} ({$blockedName})",
            'User',
            $blockedUserId,
            'warning',
            $blockerId,
            ['blocked_user_id' => $blockedUserId, 'community_id' => $reportCommunityId],
        );

        self::notifyCommunityAdmins(
            $reportCommunityId,
            $blockerId,
            "{$blockerName} blocked {$blockedName}",
            'A resident blocked another user. Review the moderation queue.',
        );
    }

    public static function unblock(int $blockerId, int $blockedUserId): void
    {
        if (! self::tableReady()) {
            return;
        }

        DB::table('user_blocks')
            ->where('blocker_id', $blockerId)
            ->where('blocked_user_id', $blockedUserId)
            ->delete();
    }

    /** @return list<array{id:int,name:string,avatar_url:?string,blocked_at:?string}> */
    public static function listBlocked(int $blockerId): array
    {
        if (! self::tableReady()) {
            return [];
        }

        return DB::table('user_blocks')
            ->join('users', 'users.id', '=', 'user_blocks.blocked_user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('user_blocks.blocker_id', $blockerId)
            ->orderByDesc('user_blocks.created_at')
            ->get([
                'users.id',
                'users.name',
                'profiles.display_name',
                'profiles.avatar_url',
                'user_blocks.created_at',
            ])
            ->map(fn ($row) => [
                'id'         => (int) $row->id,
                'name'       => $row->display_name ?: $row->name,
                'avatar_url' => $row->avatar_url,
                'blocked_at' => $row->created_at,
            ])
            ->all();
    }

    private static function displayName(int $userId): string
    {
        $row = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.id', $userId)
            ->selectRaw('COALESCE(profiles.display_name, users.name) as display_name')
            ->first();

        return (string) ($row->display_name ?? 'User #'.$userId);
    }

    private static function sharedCommunityId(int $userA, int $userB): ?int
    {
        if (! Schema::hasTable('community_memberships')) {
            return null;
        }

        $id = DB::table('community_memberships as a')
            ->join('community_memberships as b', function ($join) {
                $join->on('a.community_id', '=', 'b.community_id')
                    ->where('b.status', 'approved');
            })
            ->where('a.user_id', $userA)
            ->where('a.status', 'approved')
            ->where('b.user_id', $userB)
            ->value('a.community_id');

        return $id ? (int) $id : null;
    }

    private static function notifyCommunityAdmins(?int $communityId, int $exceptUserId, string $title, string $body): void
    {
        if (! $communityId || ! Schema::hasTable('community_memberships')) {
            return;
        }

        $adminIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator', 'community_admin'])
            ->where('user_id', '!=', $exceptUserId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                $adminId,
                'warning',
                $title,
                $body,
                '/admin/moderation',
                ['kind' => 'user_blocked', 'community_id' => $communityId],
            );
        }
    }
}
