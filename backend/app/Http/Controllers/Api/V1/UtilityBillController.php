<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\ResolvesPaymentCommunity;
use App\Http\Controllers\Controller;
use App\Models\UtilityBiller;
use App\Services\GuestAccessService;
use App\Services\Payments\PaymentRouting;
use App\Services\UnitAssignmentService;
use App\Services\Utilities\UtilityBillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Resident external utility bills (Pakistan, via KuickPay Bill Initiator). */
class UtilityBillController extends Controller
{
    use ResolvesPaymentCommunity;

    public function __construct(
        private readonly UtilityBillService $utilities,
        private readonly PaymentRouting $routing,
        private readonly UnitAssignmentService $units,
    ) {
    }

    /** GET /v1/utilities/billers */
    public function billers(Request $request): JsonResponse
    {
        $request->validate(['service_type' => ['nullable', Rule::in(UtilityBiller::SERVICE_TYPES)]]);

        return response()->json(['data' => $this->utilities->billers($request->query('service_type'))]);
    }

    /** GET /v1/utilities/accounts */
    public function index(Request $request): JsonResponse
    {
        $communityId = $this->paymentCommunityId($request);
        $enabled = $this->routing->utilitiesEnabled($communityId);
        $context = $this->utilities->context($request->user(), $communityId);
        $unit = $context['unit'];

        return response()->json([
            'data' => $enabled && $unit ? $this->utilities->accountsForUnit($unit) : [],
            'meta' => [
                'enabled' => $enabled,
                'can_manage' => $enabled && $context['can_manage'],
                'unit' => $unit ? $this->units->formatUnit($unit, (int) $request->user()->id) : null,
            ],
        ]);
    }

    /** POST /v1/utilities/accounts — link and verify in one step. */
    public function store(Request $request): JsonResponse
    {
        abort_if(GuestAccessService::isGuest($request->user()), 403, 'Guests cannot add utility accounts.');
        $data = $request->validate([
            'utility_biller_id' => ['required', 'integer'],
            'reference' => ['required', 'string', 'max:40'],
            'nickname' => ['nullable', 'string', 'max:60'],
        ]);

        $account = $this->utilities->link(
            $request->user(),
            $this->paymentCommunityId($request),
            (int) $data['utility_biller_id'],
            (string) $data['reference'],
            $data['nickname'] ?? null,
        );

        return response()->json(['data' => $account, 'message' => 'Account verified and added.'], 201);
    }

    /** POST /v1/utilities/accounts/{id}/refresh */
    public function refresh(Request $request, int $id): JsonResponse
    {
        $account = $this->utilities->findAccountForUser($id, $request->user(), $this->paymentCommunityId($request));

        return response()->json(['data' => $this->utilities->refresh($account)]);
    }

    /** PATCH /v1/utilities/accounts/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['nickname' => ['nullable', 'string', 'max:60']]);
        $account = $this->utilities->findAccountForUser($id, $request->user(), $this->paymentCommunityId($request));

        return response()->json(['data' => $this->utilities->updateNickname($account, $request->user(), $data['nickname'] ?? null)]);
    }

    /** DELETE /v1/utilities/accounts/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $account = $this->utilities->findAccountForUser($id, $request->user(), $this->paymentCommunityId($request));
        $this->utilities->remove($account, $request->user());

        return response()->json(['message' => 'Utility account removed.']);
    }
}
