<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminRoleService
{
    public static function isGuest(?User $user): bool
    {
        return $user && ($user->role ?? '') === 'guest';
    }

    /** Platform / system administrator (web portal). */
    public static function isSystemAdmin(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return in_array($user->role ?? '', ['system_admin', 'admin'], true);
    }

    /** User signed up as community admin (may still be pending approval). */
    public static function isCommunityAdminRole(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        return ($user->role ?? '') === 'community_admin';
    }

    public static function isCommunityAdminApproved(?User $user): bool
    {
        if (! self::isCommunityAdminRole($user)) {
            return false;
        }

        return ($user->community_admin_status ?? '') === 'approved';
    }

    public static function isCommunityAdminPending(?User $user): bool
    {
        return self::isCommunityAdminRole($user)
            && ($user->community_admin_status ?? 'pending') === 'pending';
    }

    public static function isCommunityAdminRejected(?User $user): bool
    {
        return self::isCommunityAdminRole($user)
            && ($user->community_admin_status ?? '') === 'rejected';
    }

    /** Approved community admin with an active community membership. */
    public static function isActiveCommunityAdmin(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if (self::isSystemAdmin($user)) {
            return false;
        }

        if (self::isCommunityAdminRole($user) && ! self::isCommunityAdminApproved($user)) {
            return false;
        }

        if (self::isCommunityAdminApproved($user)) {
            return (bool) self::getApprovedAdminMembership($user);
        }

        return (bool) self::getApprovedAdminMembership($user);
    }

    public static function getApprovedAdminMembership(User $user): ?object
    {
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator'])
            ->orderBy('id')
            ->first();

        if ($membership) {
            return $membership;
        }

        if (self::isCommunityAdminApproved($user)) {
            return DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->where('status', 'approved')
                ->orderBy('id')
                ->first();
        }

        return null;
    }

    public static function resolveCommunityId(User $user, ?int $requested = null): ?int
    {
        if ($requested) {
            return $requested;
        }

        $membership = self::getApprovedAdminMembership($user);

        return $membership ? (int) $membership->community_id : null;
    }

    /**
     * Admin API community scope.
     * System admin: null = all communities, or a specific id when requested.
     * Community admin: always their managed community; 403 if another is requested.
     */
    public static function resolveAdminCommunityScope(User $user, Request $request): ?int
    {
        $requested = null;

        if ($request->filled('community_id') && $request->input('community_id') !== 'all') {
            $requested = (int) $request->community_id;
        } elseif ($request->header('X-Community-Id')) {
            $requested = (int) $request->header('X-Community-Id');
        }

        if (self::isSystemAdmin($user)) {
            return $requested;
        }

        $membership = self::getApprovedAdminMembership($user);
        if (! $membership) {
            abort(403, 'No managed community assigned to your account.');
        }

        $ownedId = (int) $membership->community_id;

        if ($requested && $requested !== $ownedId) {
            abort(403, 'You cannot access data for another community.');
        }

        return $ownedId;
    }

    /** Community admins must operate within one community; system admins must pick one. */
    public static function requireManagedCommunityId(User $user, Request $request): int
    {
        $scope = self::resolveAdminCommunityScope($user, $request);

        if ($scope === null) {
            abort(422, 'Select a community before performing this action.');
        }

        return $scope;
    }

    public static function assertCanManageCommunity(User $user, int $communityId): void
    {
        if (! self::canManageCommunity($user, $communityId)) {
            abort(403, 'You cannot manage this community.');
        }
    }

    public static function canManageCommunity(User $user, int $communityId): bool
    {
        if (self::isSystemAdmin($user)) {
            return true;
        }

        $membership = self::getApprovedAdminMembership($user);

        return $membership && (int) $membership->community_id === $communityId;
    }
}
