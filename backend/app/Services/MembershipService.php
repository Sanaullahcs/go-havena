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
        if (! $profile || ! filled($profile->display_name)) {
            return false;
        }

        if (AdminRoleService::isCommunityAdminRole($user)) {
            return filled($profile->office_address);
        }

        return filled($profile->unit_number) && filled($profile->residence_type);
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
        if (! self::hasCompleteProfile($user)) {
            return;
        }

        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'pending')
            ->whereNotNull('invite_code_used')
            ->update([
                'status' => 'approved',
                'updated_at' => now(),
            ]);
    }

    public static function residentProfileFieldsComplete(
        ?string $displayName,
        ?string $unitNumber,
        ?string $residenceType,
    ): bool {
        return filled($displayName) && filled($unitNumber) && filled($residenceType);
    }
}
