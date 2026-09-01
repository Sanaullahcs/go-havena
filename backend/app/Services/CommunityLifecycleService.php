<?php

namespace App\Services;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CommunityLifecycleService
{
    public const COMMUNITY_DEACTIVATED_MESSAGE = 'Your community has been deactivated. Please contact the System Administrator.';

    public const REASON_COMMUNITY_DEACTIVATED = 'community_deactivated';

    public const REASON_ADMIN_SUSPENDED = 'admin_suspended';

    public const REASON_MEMBER_SUSPENDED = 'member_suspended';

    public const ACCOUNT_SUSPENDED_MESSAGE = 'Your account has been suspended. Please contact your community administrator or support.';

    public const SINGLE_COMMUNITY_ADMIN_MESSAGE = 'This phone number is already linked to another community. One phone can only manage one community.';

    public const SINGLE_COMMUNITY_REQUEST_MESSAGE = 'One phone number can only request one community at a time.';

    /** User ids that share the same normalized phone (including legacy variants). */
    public function userIdsForPhone(User $user): array
    {
        if (! filled($user->phone)) {
            return [$user->id];
        }

        $normalized = PhoneNormalizer::normalize($user->phone);
        $variants = array_values(array_unique(array_filter([
            $user->phone,
            $normalized,
            ...($normalized ? PhoneNormalizer::alternatesForLookup($normalized) : []),
        ])));

        $ids = User::query()->whereIn('phone', $variants)->pluck('id')->all();

        return $ids !== [] ? $ids : [$user->id];
    }

    /** Another active/pending admin membership for a different community, if any. */
    public function otherAdminMembership(User $user, ?int $exceptCommunityId = null): ?CommunityMembership
    {
        return CommunityMembership::query()
            ->whereIn('user_id', $this->userIdsForPhone($user))
            ->where('role', 'admin')
            ->whereIn('status', ['approved', 'pending'])
            ->when($exceptCommunityId, fn ($q) => $q->where('community_id', '!=', $exceptCommunityId))
            ->with('community')
            ->first();
    }

    /** Pending new-community request already submitted for this phone number. */
    public function pendingCommunityRequestForPhone(User $user, ?int $exceptCommunityId = null): ?Community
    {
        return Community::query()
            ->where('review_status', 'pending')
            ->whereIn('requested_by_user_id', $this->userIdsForPhone($user))
            ->when($exceptCommunityId, fn ($q) => $q->where('id', '!=', $exceptCommunityId))
            ->orderBy('created_at')
            ->first();
    }

    /** Reject duplicate pending community requests, keeping the earliest per phone. */
    public function dedupePendingCommunityRequests(): int
    {
        $pending = Community::query()
            ->where('review_status', 'pending')
            ->whereNotNull('requested_by_user_id')
            ->with('requester')
            ->orderBy('created_at')
            ->get();

        $seenPhones = [];
        $rejected = 0;

        foreach ($pending as $community) {
            $phone = PhoneNormalizer::normalize($community->requester?->phone ?? '');
            if (! $phone) {
                continue;
            }

            if (isset($seenPhones[$phone])) {
                $community->update([
                    'review_status'      => 'rejected',
                    'rejection_reason'   => 'Duplicate request — '.self::SINGLE_COMMUNITY_REQUEST_MESSAGE,
                    'reviewed_at'        => now(),
                    'requested_by_user_id' => null,
                ]);
                $rejected++;
            } else {
                $seenPhones[$phone] = true;
            }
        }

        return $rejected;
    }

    /** Ensure a user is not already admin of a different community. */
    public function assertCanAdminCommunity(User $user, Community $community): void
    {
        $other = $this->otherAdminMembership($user, $community->id);
        if ($other) {
            $name = $other->community?->name ?? 'another community';

            throw ValidationException::withMessages([
                'phone' => ["This phone number is already linked to {$name}. One phone can only manage one community."],
            ]);
        }

        $pending = $this->pendingCommunityRequestForPhone($user, $community->id);
        if ($pending) {
            throw ValidationException::withMessages([
                'community_id' => ["You already have a community request under review for {$pending->name}. ".self::SINGLE_COMMUNITY_REQUEST_MESSAGE],
            ]);
        }
    }

    /** Block a second community request/join while already linked to another community. */
    public function assertCanRequestCommunityAdmin(User $user, ?int $exceptCommunityId = null): void
    {
        $other = $this->otherAdminMembership($user, $exceptCommunityId);
        if ($other) {
            $name = $other->community?->name ?? 'another community';

            throw ValidationException::withMessages([
                'community_name' => ["You already manage {$name}. ".self::SINGLE_COMMUNITY_REQUEST_MESSAGE],
            ]);
        }

        $pending = $this->pendingCommunityRequestForPhone($user, $exceptCommunityId);
        if ($pending) {
            throw ValidationException::withMessages([
                'community_name' => ["You already have a community request under review for {$pending->name}. ".self::SINGLE_COMMUNITY_REQUEST_MESSAGE],
            ]);
        }
    }

    public function revokeOtherAdminMemberships(User $user, int $forCommunityId): void
    {
        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->where('community_id', '!=', $forCommunityId)
            ->whereIn('status', ['approved', 'pending'])
            ->update(['status' => 'banned']);
    }

    public function deactivateCommunity(Community $community): void
    {
        if ($community->status === 'inactive') {
            return;
        }

        DB::transaction(function () use ($community) {
            $community->update(['status' => 'inactive']);

            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->whereIn('status', ['approved', 'pending'])
                ->each(function (CommunityMembership $membership) {
                    $membership->update([
                        'status_before_deactivation' => $membership->status,
                        'deactivation_source'        => 'community',
                        'status'                     => 'banned',
                    ]);

                    $user = User::query()->find($membership->user_id);
                    if (! $user || $user->status === 'deleted') {
                        return;
                    }

                    if ($user->suspension_reason === self::REASON_ADMIN_SUSPENDED) {
                        return;
                    }

                    $user->update([
                        'status'            => 'suspended',
                        'suspension_reason' => self::REASON_COMMUNITY_DEACTIVATED,
                    ]);
                });
        });
    }

    public function activateCommunity(Community $community): void
    {
        if ($community->status === 'active') {
            return;
        }

        if ($community->review_status !== 'approved' && $community->review_status !== null) {
            abort(422, 'Only approved communities can be activated.');
        }

        DB::transaction(function () use ($community) {
            $community->update(['status' => 'active']);

            $membershipUserIds = CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('deactivation_source', 'community')
                ->pluck('user_id');

            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('deactivation_source', 'community')
                ->each(function (CommunityMembership $membership) {
                    $restoreStatus = $membership->status_before_deactivation ?? 'approved';
                    $membership->update([
                        'status'                     => $restoreStatus,
                        'status_before_deactivation' => null,
                        'deactivation_source'        => null,
                    ]);
                });

            User::query()
                ->whereIn('id', $membershipUserIds)
                ->where('suspension_reason', self::REASON_COMMUNITY_DEACTIVATED)
                ->update([
                    'status'            => 'active',
                    'suspension_reason' => null,
                ]);
        });
    }

    public function suspendCommunityAdmin(User $admin): void
    {
        if ($admin->role !== 'community_admin') {
            abort(422, 'User is not a community admin.');
        }

        $admin->update([
            'status'            => 'suspended',
            'suspension_reason' => self::REASON_ADMIN_SUSPENDED,
        ]);

        $admin->loadMissing('memberships');
        $billing = app(CommunityBillingService::class);
        foreach ($admin->memberships as $membership) {
            if ($membership->role === 'admin' && $membership->community_id) {
                $billing->pauseForAdminTransition((int) $membership->community_id);
            }
        }
    }

    public function assignCommunityAdmin(Community $community, User $newAdmin, bool $keepSystemAdminRole = false): User
    {
        if (! $community->isActiveForResidents()) {
            $this->reactivateCommunityForAdminAssignment($community);
            $community->refresh();
        }

        $this->assertCanAdminCommunity($newAdmin, $community);

        DB::transaction(function () use ($community, $newAdmin, $keepSystemAdminRole) {
            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('role', 'admin')
                ->where('user_id', '!=', $newAdmin->id)
                ->where('status', 'approved')
                ->update(['status' => 'banned']);

            if (! $keepSystemAdminRole) {
                $newAdmin->update([
                    'role'                   => 'community_admin',
                    'community_admin_status' => 'approved',
                    'status'                 => 'active',
                    'suspension_reason'      => null,
                ]);
            } elseif ($newAdmin->status === 'suspended') {
                $newAdmin->update([
                    'status'            => 'active',
                    'suspension_reason' => null,
                ]);
            }

            CommunityMembership::query()->updateOrCreate(
                [
                    'user_id'      => $newAdmin->id,
                    'community_id' => $community->id,
                ],
                [
                    'role'   => 'admin',
                    'status' => 'approved',
                ],
            );

            $this->revokeOtherAdminMemberships($newAdmin, $community->id);
        });

        app(CommunityBillingService::class)->onCommunityAdminReassigned($community, $newAdmin);

        return $newAdmin->fresh(['profile', 'memberships.community']);
    }

    public function userBlockedByInactiveCommunity(User $user): bool
    {
        return $this->inactiveCommunityForUser($user) !== null;
    }

    public function inactiveCommunityForUser(User $user): ?Community
    {
        if (AdminRoleService::isSystemAdmin($user)) {
            return null;
        }

        $memberships = $user->memberships()
            ->with('community')
            ->whereIn('status', ['approved', 'banned', 'pending'])
            ->get();

        foreach ($memberships as $membership) {
            $community = $membership->community;
            if (! $community) {
                continue;
            }

            if ($membership->role === 'admin' || AdminRoleService::isCommunityAdminRole($user)) {
                if ($community->review_status === 'approved' && $community->status === 'inactive') {
                    return $community;
                }
            }
        }

        if (($user->role ?? '') === 'resident') {
            $approved = $memberships->where('status', 'approved');
            foreach ($approved as $membership) {
                $community = $membership->community;
                if ($community && $community->review_status === 'approved' && $community->status === 'inactive') {
                    return $community;
                }
            }

            if ($approved->isEmpty()) {
                foreach ($memberships as $membership) {
                    $community = $membership->community;
                    if ($community && $community->review_status === 'approved' && $community->status === 'inactive') {
                        return $community;
                    }
                }
            }
        }

        return null;
    }

    public function suspendMember(User $user): void
    {
        if (($user->role ?? '') !== 'resident') {
            abort(422, 'Only resident accounts can be suspended from the members list.');
        }

        $user->update([
            'status'            => 'suspended',
            'suspension_reason' => self::REASON_MEMBER_SUSPENDED,
        ]);
    }

    public function restoreSuspendedMember(User $user): void
    {
        if ($user->status === 'suspended' && $user->suspension_reason === self::REASON_MEMBER_SUSPENDED) {
            $user->update([
                'status'            => 'active',
                'suspension_reason' => null,
            ]);
        }
    }

    /** Communities approved (active or inactive) with no active community admin assigned. */
    public function communityIdsNeedingAdminReassignment(): array
    {
        return Community::query()
            ->whereIn('status', ['active', 'inactive'])
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->get()
            ->filter(fn (Community $community) => ! $this->hasCommunityAdminAssigned($community))
            ->pluck('id')
            ->all();
    }

    public function resolveReassignReason(Community $community, ?User $previousAdmin): string
    {
        if ($community->status === 'inactive') {
            return 'community_inactive';
        }

        if ($previousAdmin && $previousAdmin->suspension_reason === self::REASON_ADMIN_SUSPENDED) {
            return 'previous_admin_suspended';
        }

        if ($previousAdmin) {
            return 'previous_admin_removed';
        }

        return 'missing_admin';
    }

    public function reassignSummaryFor(Community $community, ?User $previousAdmin): string
    {
        $reason = $this->resolveReassignReason($community, $previousAdmin);

        return match ($reason) {
            'community_inactive' => 'Community is inactive. Assigning a new admin will reactivate it for residents.',
            'previous_admin_suspended' => ($previousAdmin?->name ?? 'The previous admin').' was suspended — assign a replacement to restore management.',
            'previous_admin_removed' => ($previousAdmin?->name ?? 'The previous admin').' is no longer active — assign a new administrator.',
            default => 'No administrator is assigned yet. Invite someone to manage this community.',
        };
    }

    /** Reactivate an inactive community for reassignment without restoring the previous admin. */
    public function reactivateCommunityForAdminAssignment(Community $community): void
    {
        if ($community->status === 'active') {
            return;
        }

        if ($community->review_status !== 'approved' && $community->review_status !== null) {
            abort(422, 'Only approved communities can be reactivated for admin assignment.');
        }

        DB::transaction(function () use ($community) {
            $community->update(['status' => 'active']);

            $residentUserIds = CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('role', '!=', 'admin')
                ->where('deactivation_source', 'community')
                ->pluck('user_id');

            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('role', '!=', 'admin')
                ->where('deactivation_source', 'community')
                ->each(function (CommunityMembership $membership) {
                    $restoreStatus = $membership->status_before_deactivation ?? 'approved';
                    $membership->update([
                        'status'                     => $restoreStatus,
                        'status_before_deactivation' => null,
                        'deactivation_source'        => null,
                    ]);
                });

            if ($residentUserIds->isNotEmpty()) {
                User::query()
                    ->whereIn('id', $residentUserIds)
                    ->where('suspension_reason', self::REASON_COMMUNITY_DEACTIVATED)
                    ->update([
                        'status'            => 'active',
                        'suspension_reason' => null,
                    ]);
            }
        });
    }

    public function authenticationBlock(User $user, ?string $portal = null, bool $includeRejections = true): ?array
    {
        if ($user->status === 'suspended') {
            return $this->withBlockDetails([
                'message' => $user->suspension_reason === self::REASON_COMMUNITY_DEACTIVATED
                    ? self::COMMUNITY_DEACTIVATED_MESSAGE
                    : self::ACCOUNT_SUSPENDED_MESSAGE,
                'code' => $user->suspension_reason === self::REASON_COMMUNITY_DEACTIVATED
                    ? 'COMMUNITY_DEACTIVATED'
                    : 'ACCOUNT_SUSPENDED',
                'status' => 'suspended',
                'reason' => null,
                'rejected_by' => $this->suspensionRejectedBy($user->suspension_reason),
            ]);
        }

        if (($user->role ?? '') === 'resident') {
            $hasBannedMembership = $user->memberships()
                ->where('status', 'banned')
                ->exists();

            if ($hasBannedMembership) {
                return $this->withBlockDetails([
                    'message' => self::ACCOUNT_SUSPENDED_MESSAGE,
                    'code'    => 'ACCOUNT_SUSPENDED',
                    'status'  => 'suspended',
                    'reason'  => null,
                    'rejected_by' => 'community_admin',
                ]);
            }
        }

        $rejection = $includeRejections ? $this->rejectionBlockDetails($user, $portal) : null;
        if ($rejection) {
            return $this->withBlockDetails($rejection);
        }

        // Pending community admins may authenticate to complete onboarding (profile/community/billing).
        // Dashboard/app access itself is gated by CommunityAdminAccessService.

        if ($portal === 'community_admin_dashboard'
            && AdminRoleService::isCommunityAdminRole($user)
            && $user->suspension_reason === self::REASON_ADMIN_SUSPENDED) {
            return $this->withBlockDetails([
                'message' => 'This account has been suspended. Contact support for help.',
                'code'    => 'ACCOUNT_SUSPENDED',
                'status'  => 'suspended',
                'reason'  => null,
                'rejected_by' => 'system_admin',
            ]);
        }

        $inactiveCommunity = $this->inactiveCommunityForUser($user);
        if ($inactiveCommunity) {
            return $this->withBlockDetails([
                'message' => self::COMMUNITY_DEACTIVATED_MESSAGE,
                'code'    => 'COMMUNITY_DEACTIVATED',
                'status'  => 'suspended',
                'reason'  => null,
                'rejected_by' => 'system_admin',
            ]);
        }

        return null;
    }

    /** @return array{message: string, code: string, status: string, reason: ?string, rejected_by: ?string}|null */
    public function rejectionBlockDetails(User $user, ?string $portal = null): ?array
    {
        if (AdminRoleService::isCommunityAdminRejected($user)) {
            $revoked = $this->wasApprovedThenRejected($user);

            return [
                'message'     => $revoked
                    ? 'Your community admin access was revoked. Your subscription has been canceled and you will not be charged again. Contact support if you have questions.'
                    : 'Your community admin application was not approved. Contact support for help.',
                'code'        => $revoked ? 'COMMUNITY_ADMIN_REVOKED' : 'COMMUNITY_ADMIN_REJECTED',
                'status'      => 'rejected',
                'reason'      => $user->community_admin_rejection_reason,
                'rejected_by' => 'system_admin',
            ];
        }

        $user->loadMissing('memberships.community');

        if ($this->hasPendingCommunityRequest($user)) {
            return null;
        }

        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if (! $community) {
                continue;
            }

            if ($community->review_status === 'rejected') {
                // Stay signed in so the user can submit a new community request.
                continue;
            }

            if ($membership->status === 'rejected' && $community->review_status !== 'rejected') {
                return [
                    'message'     => 'Your membership request was not approved.',
                    'code'        => 'MEMBERSHIP_REJECTED',
                    'status'      => 'rejected',
                    'reason'      => $membership->rejection_reason,
                    'rejected_by' => $membership->rejected_by ?? 'community_admin',
                ];
            }
        }

        return null;
    }

    /** Approved admin/community later rejected (revoke), not an initial application decline. */
    public function wasApprovedThenRejected(User $user): bool
    {
        if (! AdminRoleService::isCommunityAdminRejected($user)) {
            return false;
        }

        $user->loadMissing('memberships.community');
        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if (! $community) {
                continue;
            }

            $communityApproved = in_array($community->review_status, [null, 'approved'], true)
                && ($community->status === null || $community->status === 'active' || $community->status === 'inactive');
            $hadAdminSeat = $membership->role === 'admin'
                && in_array($membership->status, ['approved', 'banned'], true);

            if ($communityApproved && $hadAdminSeat) {
                return true;
            }
        }

        return false;
    }

    private function hasPendingCommunityRequest(User $user): bool
    {
        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if (! $community || $community->review_status !== 'pending') {
                continue;
            }
            if ($membership->status === 'rejected') {
                continue;
            }

            return true;
        }

        return false;
    }

    /** @param array{message: string, code: string, status?: string, reason?: ?string, rejected_by?: ?string} $block */
    public function enrichBlockResponse(array $block, User $user): array
    {
        $payload = $this->withBlockDetails($block);

        $suspendedAt = null;
        if (($user->status ?? '') === 'suspended' && $user->updated_at) {
            $suspendedAt = $user->updated_at->toIso8601String();
        } else {
            $membershipUpdated = $user->memberships()
                ->where('status', 'banned')
                ->orderByDesc('updated_at')
                ->value('updated_at');
            if ($membershipUpdated) {
                $suspendedAt = \Illuminate\Support\Carbon::parse($membershipUpdated)->toIso8601String();
            }
        }

        if ($suspendedAt) {
            $payload['suspended_at'] = $suspendedAt;
        }

        return $payload;
    }

    /** @param array{message: string, code: string, status?: string, reason?: ?string, rejected_by?: ?string} $block */
    private function withBlockDetails(array $block): array
    {
        return [
            'message'     => $block['message'],
            'code'        => $block['code'],
            'status'      => $block['status'] ?? 'suspended',
            'reason'      => filled($block['reason'] ?? null) ? (string) $block['reason'] : null,
            'rejected_by' => filled($block['rejected_by'] ?? null) ? (string) $block['rejected_by'] : null,
        ];
    }

    private function suspensionRejectedBy(?string $suspensionReason): ?string
    {
        return match ($suspensionReason) {
            self::REASON_ADMIN_SUSPENDED, self::REASON_COMMUNITY_DEACTIVATED => 'system_admin',
            self::REASON_MEMBER_SUSPENDED => 'community_admin',
            default => null,
        };
    }

    public function getCommunityAdmin(Community $community): ?User
    {
        $membership = CommunityMembership::query()
            ->where('community_id', $community->id)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->orderByDesc('updated_at')
            ->first();

        if (! $membership) {
            return null;
        }

        return User::query()
            ->where('id', $membership->user_id)
            ->where('status', 'active')
            ->where(function ($roleQuery) {
                $roleQuery
                    ->where(function ($communityAdmin) {
                        $communityAdmin->where('role', 'community_admin')
                            ->where('community_admin_status', 'approved');
                    })
                    ->orWhereIn('role', ['system_admin', 'admin']);
            })
            ->first();
    }

    public function hasCommunityAdminAssigned(Community $community): bool
    {
        return CommunityMembership::query()
            ->where('community_id', $community->id)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->whereHas('user', function ($user) {
                $user->where('status', 'active')
                    ->where(function ($roleQuery) {
                        $roleQuery
                            ->where(function ($communityAdmin) {
                                $communityAdmin->where('role', 'community_admin')
                                    ->where('community_admin_status', 'approved');
                            })
                            ->orWhereIn('role', ['system_admin', 'admin']);
                    });
            })
            ->exists();
    }
}
