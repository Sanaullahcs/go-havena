<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\BillingException;
use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Services\AdminRoleService;
use App\Services\CommunityBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingController extends Controller
{
    public function __construct(private readonly CommunityBillingService $billing)
    {
    }

    /** GET /v1/admin/billing */
    public function show(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $community = Community::query()->findOrFail($communityId);
        $this->billing->releaseExpiredReservations($communityId);
        $this->billing->refreshGraceIfNeeded($communityId);
        // Heal stuck "incomplete" rows after Stripe Checkout when the return confirm was missed.
        $this->billing->reconcileIncompleteCheckout($community);

        return response()->json([
            'data' => $this->billing->billingPayload($community->fresh()),
        ]);
    }

    /** POST /v1/admin/billing/checkout */
    public function checkout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'plan_slug' => ['required', 'string', 'max:50'],
            'interval' => ['nullable', 'in:month,year'],
            'estimated_residents' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'community_id' => ['nullable', 'integer'],
            // Browser origin so Stripe returns to the same host that started checkout
            // (avoids localhost vs LAN IP session loss).
            'return_origin' => ['nullable', 'string', 'max:255'],
        ]);

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $community = Community::query()->findOrFail($communityId);

        if ($community->review_status === 'pending') {
            // Allow paying while pending review — UI shows "Paid — waiting for approval".
        }

        if ($community->review_status === 'rejected') {
            throw new BillingException(
                'This community request was rejected. Contact support before purchasing a plan.',
                'COMMUNITY_REJECTED',
                422,
            );
        }

        if (isset($validated['estimated_residents'])) {
            $community->update(['estimated_residents' => (int) $validated['estimated_residents']]);
            $community->refresh();
        }

        $result = $this->billing->createCheckoutSession(
            $community,
            $request->user(),
            $validated['plan_slug'],
            $validated['interval'] ?? 'month',
            $validated['return_origin'] ?? null,
        );

        return response()->json([
            'data' => $result,
            'message' => $result['message'] ?? 'Checkout session created.',
        ]);
    }

    /** POST /v1/admin/billing/portal */
    public function portal(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $community = Community::query()->findOrFail($communityId);

        $result = $this->billing->createPortalSession($community);

        return response()->json(['data' => $result]);
    }

    /** POST /v1/admin/billing/confirm-checkout */
    public function confirmCheckout(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'session_id' => ['nullable', 'string', 'max:255'],
            'stripe_subscription_id' => ['nullable', 'string', 'max:255'],
            'stripe_setup_intent_id' => ['nullable', 'string', 'max:255'],
            'community_id' => ['nullable', 'integer'],
        ]);

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $community = Community::query()->findOrFail($communityId);

        if (filled($validated['stripe_subscription_id'] ?? null) || filled($validated['stripe_setup_intent_id'] ?? null)) {
            $this->billing->confirmElementsCheckout(
                $community,
                (string) ($validated['stripe_setup_intent_id'] ?? $validated['stripe_subscription_id']),
            );
        } elseif (filled($validated['session_id'] ?? null)) {
            $this->billing->confirmCheckoutSession($community, (string) $validated['session_id']);
        } else {
            throw new BillingException('Missing checkout confirmation id.', 'CHECKOUT_CONFIRM_MISSING', 422);
        }

        return response()->json([
            'data' => $this->billing->billingPayload($community->fresh()),
            'message' => 'Subscription confirmed.',
        ]);
    }

    /** POST /v1/admin/billing/change-plan */
    public function changePlan(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'plan_slug' => ['required', 'string', 'max:50'],
            'interval' => ['nullable', 'in:month,year'],
            'community_id' => ['nullable', 'integer'],
        ]);

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $community = Community::query()->findOrFail($communityId);

        $subscription = $this->billing->changePlan(
            $community,
            $validated['plan_slug'],
            $validated['interval'] ?? 'month',
        );

        return response()->json([
            'data' => $this->billing->billingPayload($community->fresh()),
            'message' => 'Plan updated.',
            'subscription_id' => $subscription->id,
        ]);
    }

    /** POST /v1/admin/billing/grant — system admin only (manual/comp plans) */
    public function grant(Request $request): JsonResponse
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Only system administrators can grant subscriptions.'], 403);
        }

        $validated = $request->validate([
            'community_id' => ['required', 'integer', 'exists:communities,id'],
            'plan_slug' => ['required', 'string', 'max:50'],
            'interval' => ['nullable', 'in:month,year'],
            'extra_seats' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);

        $community = Community::query()->findOrFail($validated['community_id']);
        $subscription = $this->billing->activateManualSubscription(
            $community,
            $validated['plan_slug'],
            $validated['interval'] ?? 'month',
            $request->user(),
        );

        if (isset($validated['extra_seats'])) {
            $subscription->update(['extra_seats' => (int) $validated['extra_seats']]);
        }

        return response()->json([
            'data' => $this->billing->billingPayload($community->fresh()),
            'message' => 'Subscription granted.',
        ]);
    }
}
