<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\User;

/**
 * Single source of truth for Community Admin platform access.
 *
 * Access requires BOTH:
 * 1. Billing complete (subscription trialing|active with card on file via Stripe)
 * 2. Platform approval (admin status + community review + membership approved)
 */
class CommunityAdminAccessService
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    public function managedCommunityId(User $user): ?int
    {
        $user->loadMissing('memberships.community');

        $membership = $user->memberships
            ->first(fn ($m) => $m->role === 'admin')
            ?? $user->memberships->first();

        return $membership?->community_id ? (int) $membership->community_id : null;
    }

    public function managedMembership(User $user): ?CommunityMembership
    {
        $user->loadMissing('memberships.community');

        return $user->memberships->first(fn ($m) => $m->role === 'admin')
            ?? $user->memberships->first();
    }

    public function isBillingComplete(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        if (! $this->billing->enforce()) {
            // Emergency bypass — still require a subscription row when billing is enabled.
            if (! $this->billing->enabled()) {
                return true;
            }
        }

        $subscription = $this->billing->getSubscription($communityId);
        if (! $subscription) {
            return false;
        }

        return in_array($subscription->status, [
            CommunitySubscription::STATUS_TRIALING,
            CommunitySubscription::STATUS_ACTIVE,
        ], true);
    }

    public function isPlatformApproved(User $user): bool
    {
        if (! AdminRoleService::isCommunityAdminRole($user)) {
            return false;
        }

        if (($user->community_admin_status ?? '') !== 'approved') {
            return false;
        }

        if (($user->status ?? '') === 'suspended') {
            return false;
        }

        $membership = $this->managedMembership($user);
        if (! $membership || $membership->status !== 'approved' || $membership->role !== 'admin') {
            return false;
        }

        $community = $membership->community;
        if (! $community) {
            return false;
        }

        if (in_array($community->review_status, ['pending', 'rejected'], true)) {
            return false;
        }

        if ($community->status && $community->status !== 'active') {
            return false;
        }

        return true;
    }

    public function hasLinkedCommunity(User $user): bool
    {
        return $this->managedCommunityId($user) !== null;
    }

    public function isProfileComplete(User $user): bool
    {
        $user->loadMissing('profile');
        $profile = $user->profile;
        $name = trim((string) ($profile?->display_name ?: $user->name ?: ''));

        return $name !== '';
    }

    /**
     * @return array{
     *   platform_approved: bool,
     *   billing_complete: bool,
     *   can_use_dashboard: bool,
     *   can_use_mobile_app: bool,
     *   has_linked_community: bool,
     *   profile_complete: bool,
     *   community_id: ?int,
     *   subscription_status: ?string,
     *   plan_slug: ?string,
     *   card_on_file: bool,
     *   trial_ends_at: ?string,
     *   next_step: string,
     *   billing_url: string,
     *   blocking_reasons: string[]
     * }
     */
    public function accessPayload(User $user): array
    {
        $communityId = $this->managedCommunityId($user);
        $subscription = $communityId ? $this->billing->getSubscription($communityId) : null;
        $platformApproved = $this->isPlatformApproved($user);
        $billingComplete = $this->isBillingComplete($communityId);
        $profileComplete = $this->isProfileComplete($user);
        $hasCommunity = $communityId !== null;
        $canUse = $platformApproved && $billingComplete;

        $blocking = [];
        if (! $profileComplete) {
            $blocking[] = 'profile_incomplete';
        }
        if (! $hasCommunity) {
            $blocking[] = 'community_missing';
        }
        if ($hasCommunity && ! $billingComplete) {
            $blocking[] = 'billing_incomplete';
        }
        if (! $platformApproved) {
            if (AdminRoleService::isCommunityAdminRejected($user)) {
                $blocking[] = 'admin_rejected';
            } elseif (($user->community_admin_status ?? 'pending') === 'pending') {
                $blocking[] = 'admin_pending';
            } else {
                $membership = $this->managedMembership($user);
                $review = $membership?->community?->review_status;
                if ($review === 'rejected') {
                    $blocking[] = 'community_rejected';
                } elseif ($review === 'pending') {
                    $blocking[] = 'community_pending';
                } elseif ($membership && $membership->status !== 'approved') {
                    $blocking[] = 'membership_pending';
                } else {
                    $blocking[] = 'platform_not_approved';
                }
            }
        }

        $nextStep = $this->resolveNextStep(
            $user,
            $profileComplete,
            $hasCommunity,
            $billingComplete,
            $platformApproved,
            $blocking,
        );

        $adminUrl = rtrim((string) env('FRONTEND_ADMIN_URL', 'http://localhost:3000'), '/');

        return [
            'platform_approved' => $platformApproved,
            'billing_complete' => $billingComplete,
            'can_use_dashboard' => $canUse,
            'can_use_mobile_app' => $canUse,
            'has_linked_community' => $hasCommunity,
            'profile_complete' => $profileComplete,
            'community_id' => $communityId,
            'subscription_status' => $subscription?->status,
            'plan_slug' => $subscription?->plan_slug,
            'card_on_file' => filled($subscription?->stripe_customer_id)
                && in_array($subscription?->status, [
                    CommunitySubscription::STATUS_TRIALING,
                    CommunitySubscription::STATUS_ACTIVE,
                    CommunitySubscription::STATUS_INCOMPLETE,
                ], true),
            'trial_ends_at' => $subscription?->status === CommunitySubscription::STATUS_TRIALING
                ? $subscription->current_period_end?->toIso8601String()
                : null,
            'next_step' => $nextStep,
            'billing_url' => $adminUrl.'/admin/billing',
            'blocking_reasons' => $blocking,
        ];
    }

    /** Compact billing summary for system-admin tables. */
    public function billingSummaryForCommunity(?int $communityId): array
    {
        if (! $communityId) {
            return [
                'subscription_status' => null,
                'plan_slug' => null,
                'card_on_file' => false,
                'billing_complete' => false,
                'trial_ends_at' => null,
            ];
        }

        $subscription = $this->billing->getSubscription($communityId);
        // Heal stale incomplete rows so system-admin UI doesn't stay on "Checkout incomplete"
        // after a successful Stripe Checkout that missed the return confirm.
        if ($subscription?->status === CommunitySubscription::STATUS_INCOMPLETE) {
            $community = \App\Models\Community::query()->find($communityId);
            if ($community) {
                $this->billing->reconcileIncompleteCheckout($community);
                $subscription = $this->billing->getSubscription($communityId);
            }
        }

        return [
            'subscription_status' => $subscription?->status,
            'plan_slug' => $subscription?->plan_slug,
            'card_on_file' => filled($subscription?->stripe_customer_id)
                && in_array($subscription?->status, [
                    CommunitySubscription::STATUS_TRIALING,
                    CommunitySubscription::STATUS_ACTIVE,
                    CommunitySubscription::STATUS_INCOMPLETE,
                ], true),
            'billing_complete' => $this->isBillingComplete($communityId),
            'trial_ends_at' => $subscription?->status === CommunitySubscription::STATUS_TRIALING
                ? $subscription->current_period_end?->toIso8601String()
                : null,
        ];
    }

    /**
     * Cancel Stripe + local subscription when a community/admin is rejected.
     * Trial/active → cancel immediately so no future charge occurs.
     */
    public function cancelBillingOnRejection(int $communityId, string $reason = 'platform_rejected'): void
    {
        $this->billing->cancelSubscriptionImmediately($communityId, $reason);
    }

    /** @param string[] $blocking */
    private function resolveNextStep(
        User $user,
        bool $profileComplete,
        bool $hasCommunity,
        bool $billingComplete,
        bool $platformApproved,
        array $blocking,
    ): string {
        if (in_array('admin_rejected', $blocking, true) || in_array('community_rejected', $blocking, true)) {
            return 'rejected';
        }

        if (! $hasCommunity) {
            return 'link_community';
        }

        if (! $profileComplete) {
            return 'complete_profile';
        }

        if (! $billingComplete) {
            return 'complete_billing_web';
        }

        if (! $platformApproved) {
            return 'await_approval';
        }

        return 'ready';
    }
}
