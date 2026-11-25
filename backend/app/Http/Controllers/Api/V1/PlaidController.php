<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\PlaidEligibilityService;
use App\Services\PlaidService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlaidController extends Controller
{
    public function __construct(
        private readonly PlaidService $plaid,
        private readonly PlaidEligibilityService $eligibility,
    ) {
    }

    /** GET /v1/plaid/connection */
    public function showConnection(Request $request): JsonResponse
    {
        $user = $this->communityAdmin($request);
        $this->assertEligible($user);

        return response()->json([
            'success' => true,
            'data' => $this->plaid->getCommunityConnection($user),
        ]);
    }

    /** POST /v1/plaid/link-token */
    public function createLinkToken(Request $request): JsonResponse
    {
        $user = $this->communityAdmin($request);
        $this->assertEligible($user);
        $this->assertCanManagePayoutAccount($user);

        $mode = $request->string('mode')->toString();
        if (! in_array($mode, ['create', 'update', 'replace'], true)) {
            $mode = 'create';
        }

        $payload = $mode === 'update'
            ? $this->plaid->createLinkToken($user, 'update')
            : $this->plaid->createLinkToken($user);

        return response()->json([
            'success' => true,
            'data' => $payload,
        ]);
    }

    /** POST /v1/plaid/exchange-token */
    public function exchangeToken(Request $request): JsonResponse
    {
        $user = $this->communityAdmin($request);
        $this->assertEligible($user);
        $this->assertCanManagePayoutAccount($user);

        $validated = $request->validate([
            'public_token' => ['required', 'string', 'max:512'],
            'account_id' => ['nullable', 'string', 'max:128'],
            'account' => ['nullable', 'array'],
            'account.name' => ['nullable', 'string', 'max:120'],
            'account.official_name' => ['nullable', 'string', 'max:160'],
            'account.type' => ['nullable', 'string', 'max:40'],
            'account.subtype' => ['nullable', 'string', 'max:40'],
            'account.mask' => ['nullable', 'string', 'max:16'],
            'institution_id' => ['nullable', 'string', 'max:64'],
            'institution_name' => ['nullable', 'string', 'max:160'],
            'replace' => ['sometimes', 'boolean'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $options = array_filter([
            'account_id' => $validated['account_id'] ?? null,
            'account' => $validated['account'] ?? null,
            'institution_id' => $validated['institution_id'] ?? null,
            'institution_name' => $validated['institution_name'] ?? null,
            'replace' => (bool) ($validated['replace'] ?? false),
            'reason' => $validated['reason'] ?? null,
        ], static fn ($value) => $value !== null && $value !== false && $value !== []);

        $payload = $options === []
            ? $this->plaid->connectCommunityAccount($user, $validated['public_token'])
            : $this->plaid->connectCommunityAccount($user, $validated['public_token'], $options);

        return response()->json([
            'success' => true,
            'data' => $payload,
        ]);
    }

    /** POST /v1/plaid/reconnect */
    public function reconnect(Request $request): JsonResponse
    {
        $user = $this->communityAdmin($request);
        $this->assertEligible($user);
        $this->assertCanManagePayoutAccount($user);

        return response()->json([
            'success' => true,
            'data' => $this->plaid->completeReconnect($user),
        ]);
    }

    /** POST /v1/plaid/disconnect */
    public function disconnect(Request $request): JsonResponse
    {
        $user = $this->communityAdmin($request);
        $this->assertEligible($user);
        $this->assertCanManagePayoutAccount($user);
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:255']])['reason'] ?? null;

        return response()->json([
            'success' => true,
            'data' => $this->plaid->disconnectCommunityAccount($user, $reason),
        ]);
    }

    private function communityAdmin(Request $request): \App\Models\User
    {
        $user = $request->user();

        if (! AdminRoleService::isActiveCommunityAdmin($user)) {
            abort(403, 'Community admin access required');
        }

        return $user;
    }

    /** Only the community's admin (not moderators) may change where community money is paid. */
    private function assertCanManagePayoutAccount(\App\Models\User $user): void
    {
        $membership = AdminRoleService::getApprovedAdminMembership($user);
        $role = (string) ($membership->role ?? '');
        $allowed = $membership && ($role === 'admin'
            || (AdminRoleService::isCommunityAdminApproved($user) && $role !== 'moderator'));
        if (! $allowed) {
            abort(403, 'Only the community admin can change the community bank account.');
        }
    }

    private function assertEligible(\App\Models\User $user): void
    {
        $membership = AdminRoleService::getApprovedAdminMembership($user)
            ?? AdminRoleService::getAdminMembershipIncludingPending($user);

        if (! $membership) {
            throw \App\Exceptions\PlaidException::noManagedCommunity();
        }

        $this->eligibility->assertCommunityEligible((int) $membership->community_id);
    }
}
