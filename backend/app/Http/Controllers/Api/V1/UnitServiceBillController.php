<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\GuestAccessService;
use App\Services\UnitServiceBillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UnitServiceBillController extends Controller
{
    public function __construct(private UnitServiceBillService $bills) {}

    /** GET /v1/admin/service-bills */
    public function adminIndex(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->bills->listAdminBills($this->resolveAdminCommunityId($request), $request),
        ]);
    }

    /** GET /v1/admin/service-bills/{id} */
    public function adminShow(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $bill = $this->bills->findAdminBill($id, $communityId);
        abort_if(! $bill, 404, 'Bill not found.');
        $formatted = collect($this->bills->listAdminBills($communityId, $request))->firstWhere('id', $id);
        abort_if(! $formatted, 404, 'Bill not found.');

        return response()->json([
            'data' => array_merge($formatted, [
                'reviews' => $this->bills->listReviews($id, $communityId, $request),
            ]),
        ]);
    }

    /** GET /v1/admin/service-bills/{id}/reviews */
    public function adminReviews(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->bills->listReviews($id, $this->resolveAdminCommunityId($request), $request),
        ]);
    }

    /** PATCH /v1/admin/service-bills/{id}/approve */
    public function adminApprove(Request $request, int $id): JsonResponse
    {
        $bill = $this->bills->findAdminBill($id, $this->resolveAdminCommunityId($request));
        abort_if(! $bill, 404, 'Bill not found.');

        return response()->json([
            'data' => $this->bills->approvePayment($bill, (int) $request->user()->id, $request),
            'message' => 'Payment approved successfully.',
        ]);
    }

    /** PATCH /v1/admin/service-bills/{id}/reject */
    public function adminReject(Request $request, int $id): JsonResponse
    {
        $bill = $this->bills->findAdminBill($id, $this->resolveAdminCommunityId($request));
        abort_if(! $bill, 404, 'Bill not found.');
        $data = $request->validate([
            'rejection_code' => ['required', Rule::in(array_keys(UnitServiceBillService::REJECTION_REASONS))],
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'data' => $this->bills->rejectPayment(
                $bill,
                (int) $request->user()->id,
                $this->bills->resolveRejectionReason($data['rejection_code'], $data['rejection_reason'] ?? null),
                $request,
            ),
            'message' => 'Payment rejected.',
        ]);
    }

    /** GET /v1/service-bills */
    public function residentIndex(Request $request): JsonResponse
    {
        if (GuestAccessService::isGuest($request->user())) {
            return response()->json(['data' => []]);
        }

        return response()->json([
            'data' => $this->bills->listResidentBills($this->resolveResidentCommunityId($request), (int) $request->user()->id, $request),
        ]);
    }

    /** POST /v1/service-bills/{id}/acknowledge */
    public function residentAcknowledge(Request $request, int $id): JsonResponse
    {
        $bill = $this->bills->findOwnedBill($id, (int) $request->user()->id, $this->resolveResidentCommunityId($request));
        abort_if(! $bill, 404, 'Bill not found.');

        return response()->json([
            'data' => $this->bills->acknowledge($bill, (int) $request->user()->id),
            'message' => 'Bill acknowledged.',
        ]);
    }

    /** POST /v1/service-bills/{id}/proof */
    public function residentSubmitProof(Request $request, int $id): JsonResponse
    {
        $bill = $this->bills->findOwnedBill($id, (int) $request->user()->id, $this->resolveResidentCommunityId($request));
        abort_if(! $bill, 404, 'Bill not found.');
        $data = $request->validate([
            'file' => UnitServiceBillService::FILE_RULE,
            'payment_date' => 'required|date|before_or_equal:today',
            'payment_reference' => 'nullable|string|max:100',
            'payment_note' => 'nullable|string|max:1000',
        ]);

        return response()->json([
            'data' => $this->bills->submitPaymentProof($bill, $request->file('file'), $data, $request),
            'message' => UnitServiceBillService::PROOF_SUBMITTED_MESSAGE ?? 'Payment proof submitted. Your Community Admin will review it.',
        ]);
    }

    private function resolveResidentCommunityId(Request $request): int
    {
        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $request->user()->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        abort_if(! $membership, 422, 'No approved community membership found.');

        return (int) $membership->community_id;
    }

    private function resolveAdminCommunityId(Request $request): int
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return (int) $scope;
    }
}
