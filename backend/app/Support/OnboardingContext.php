<?php

namespace App\Support;

use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\InviteCodeService;

class OnboardingContext
{
    /** User was invited or provisioned by a community/system admin — not self-serve signup. */
    public static function invitedByAdmin(User $user): bool
    {
        if (InviteCodeService::userNeedsInviteCode($user)) {
            return true;
        }

        $user->loadMissing('memberships');

        foreach ($user->memberships as $membership) {
            if (filled($membership->invite_code_used)) {
                return true;
            }
        }

        if (AdminRoleService::isCommunityAdminRole($user) && $user->community_admin_status === 'approved') {
            return $user->memberships->contains(
                fn ($membership) => $membership->role === 'admin' && $membership->status === 'approved',
            );
        }

        if ($user->role !== 'resident') {
            return false;
        }

        $membership = $user->memberships
            ->first(fn ($row) => $row->role === 'member' && $row->status === 'approved');

        if (! $membership || filled($membership->invite_code_used)) {
            return false;
        }

        if (! $user->created_at || ! $membership->created_at) {
            return false;
        }

        return abs($user->created_at->diffInSeconds($membership->created_at)) <= 10;
    }
}
