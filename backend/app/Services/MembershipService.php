<?php

namespace App\Services;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;

class MembershipService
{
    /** Role stored on community_memberships when joining or requesting a community. */
    public static function membershipRoleFor(User $user): string
    {
        return AdminRoleService::isCommunityAdminRole($user) ? 'admin' : 'member';
    }

    /** Profile fields required before a resident can join a community. */
    public static function hasCompleteProfile(User $user): bool
    {
        $profile = $user->profile;

        return $profile
            && filled($profile->display_name)
            && filled($profile->unit_number)
            && filled($profile->residence_type);
    }

    /**
     * Invite codes auto-approve. All other joins stay pending for community admin review.
     */
    public static function joinStatusFor(Community $community, User $user, bool $viaValidInvite = false): string
    {
        if ($viaValidInvite) {
            return 'approved';
        }

        return 'pending';
    }

    /** Upgrade pending memberships when the resident finishes onboarding profile. */
    public static function approvePendingForActiveCommunities(User $user): void
    {
        // Join requests remain pending until a community admin approves them.
    }
}
