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

    /**
     * Upgrade pending invite memberships when the resident has earned access
     * (first-home profile completion, or at least one linked unit in that community).
     */
    public static function approvePendingForActiveCommunities(User $user, bool $afterProfileSave = false): void
    {
        if (! self::hasCompleteProfile($user)) {
            return;
        }

        $pending = CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'pending')
            ->whereNotNull('invite_code_used')
            ->get();

        if ($pending->isEmpty()) {
            return;
        }

        if (! $afterProfileSave) {
            // GET /me must not auto-approve a second-community invite just because
            // the resident already completed profile in another community.
            $hasApproved = CommunityMembership::query()
                ->where('user_id', $user->id)
                ->where('status', 'approved')
                ->exists();
            if ($hasApproved) {
                return;
            }
        }

        $hasOtherApproved = CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->exists();

        $packages = app(UnitRegistrationPackageService::class);

        foreach ($pending as $membership) {
            $communityId = (int) $membership->community_id;
            if ($packages->hasApprovedInitialOrActiveUnit((int) $user->id, $communityId)) {
                self::approvePendingInviteForCommunity((int) $user->id, $communityId);

                continue;
            }

            // First home: profile save is followed by unit sync for the sole pending invite.
            if ($afterProfileSave && ! $hasOtherApproved) {
                self::approvePendingInviteForCommunity((int) $user->id, $communityId);
            }
        }
    }

    /** Approve a pending invite membership once unit enrollment is complete for that community. */
    public static function approvePendingInviteForCommunity(int $userId, int $communityId): void
    {
        CommunityMembership::query()
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
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
