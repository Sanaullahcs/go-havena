<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PlaidTransfer;
use App\Services\AdminRoleService;
use App\Services\GuestAccessService;
use App\Services\PlaidAchService;
use App\Services\PlaidResidentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlaidPaymentController extends Controller
{
    public function __construct(
        private readonly PlaidAchService $ach,
        private readonly PlaidResidentService $residents,
    ) {
    }

    public function capability(Request $request): JsonResponse
    {
        $user = $this->resident($request);

        return response()->json([
            'success' => true,
            'data' => $this->ach->capability($user, $request->integer('community_id') ?: null),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->resident($request);
        $communityId = $this->residents->resolveCommunityId($user, $request->integer('community_id') ?: null);

        return response()->json([
            'success' => true,
            'data' => $this->ach->listForResident($user, $communityId),
        ]);
    }

    public function payBooking(Request $request): JsonResponse
    {
        $user = $this->resident($request);
        $validated = $request->validate([
            'booking_id' => ['required', 'integer'],
        ]);

        $transfer = $this->ach->payBooking($user, (int) $validated['booking_id']);

        return response()->json([
            'success' => true,
            'data' => $transfer->toPublicPayload(),
            'message' => $this->messageFor($transfer),
        ], 201);
    }

    public function paySharedBill(Request $request): JsonResponse
    {
        $user = $this->resident($request);
        $validated = $request->validate([
            'amenity_id' => ['required', 'integer'],
            'resident_bill_id' => ['required', 'integer'],
        ]);

        $transfer = $this->ach->paySharedBill(
            $user,
            (int) $validated['amenity_id'],
            (int) $validated['resident_bill_id'],
        );

        return response()->json([
            'success' => true,
            'data' => $transfer->toPublicPayload(),
            'message' => $this->messageFor($transfer),
        ], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(! AdminRoleService::isCommunityAdminRole($user) && ! AdminRoleService::isSystemAdmin($user), 403);

        $communityId = AdminRoleService::resolveAdminCommunityScope($user, $request);
        abort_if(! $communityId, 422, 'No community scope available.');

        return response()->json([
            'success' => true,
            'data' => $this->ach->listForCommunity((int) $communityId),
        ]);
    }

    private function resident(Request $request): \App\Models\User
    {
        $user = $request->user();
        abort_if(! $user, 401);
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot send bank payments.');

        return $user;
    }

    private function messageFor(PlaidTransfer $transfer): string
    {
        if ($transfer->isSuccessful()) {
            return 'Bank payment sent to the community account.';
        }
        if ($transfer->isPending()) {
            return 'Bank payment submitted. ACH usually posts in 1–3 business days.';
        }

        return $transfer->failure_message ?: 'Bank payment could not be completed.';
    }
}
