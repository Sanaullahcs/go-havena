<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\PropertyServiceCatalogService;
use App\Services\UnitAssignmentService;
use App\Services\UnitServiceBillService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PropertyServiceController extends Controller
{
    public function __construct(
        private PropertyServiceCatalogService $catalog,
        private UnitServiceBillService $bills,
        private UnitAssignmentService $units,
    ) {}

    /** GET /v1/admin/property-services */
    public function adminIndex(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->catalog->listAdmin($this->resolveAdminCommunityId($request)),
        ]);
    }

    /** POST /v1/admin/property-services */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request, true);

        return response()->json([
            'data' => $this->catalog->create($this->resolveAdminCommunityId($request), (int) $request->user()->id, $data),
            'message' => 'Service published.',
        ], 201);
    }

    /** PATCH /v1/admin/property-services/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $service = $this->findAdminService($request, $id);
        $data = $this->validatePayload($request, false);

        return response()->json([
            'data' => $this->catalog->update($service, $data),
            'message' => 'Service updated.',
        ]);
    }

    /** DELETE /v1/admin/property-services/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $service = $this->findAdminService($request, $id);
        $this->catalog->delete($service);

        return response()->json([
            'message' => 'Service deleted.',
        ]);
    }

    /** POST /v1/admin/property-services/{id}/generate-bills */
    public function generateBills(Request $request, int $id): JsonResponse
    {
        $service = $this->findAdminService($request, $id);
        $data = $request->validate([
            'billing_period' => 'required|string',
            'title' => 'nullable|string|max:200',
            'description' => 'nullable|string|max:2000',
            'amount' => 'nullable|numeric|min:0.01|max:999999.99',
            'due_date' => 'nullable|date',
            'file' => UnitServiceBillService::OPTIONAL_FILE_RULE,
        ]);

        $result = $this->bills->generateBills(
            $service,
            $data,
            (int) $request->user()->id,
            $request,
            $request->file('file'),
        );

        return response()->json([
            'data' => $result,
            'message' => "Generated {$result['created_count']} unit bill(s).",
        ], 201);
    }

    /** GET /v1/admin/property-services/{id}/subscriptions */
    public function adminSubscriptions(Request $request, int $id): JsonResponse
    {
        $service = $this->findAdminService($request, $id);

        return response()->json([
            'data' => $this->bills->listAdminSubscriptions((int) $service->community_id, (int) $service->id),
        ]);
    }

    /** GET /v1/admin/service-subscriptions — optional service subscription requests. */
    public function adminSubscriptionInbox(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->bills->listAdminSubscriptions(
                $this->resolveAdminCommunityId($request),
                null,
                true,
            ),
        ]);
    }

    /** PATCH /v1/admin/service-subscriptions/{id}/approve */
    public function approveSubscription(Request $request, int $id): JsonResponse
    {
        $subscription = $this->findAdminSubscription($request, $id);

        return response()->json([
            'data' => $this->bills->reviewSubscription($subscription, (int) $request->user()->id, 'approve'),
            'message' => 'Subscription approved.',
        ]);
    }

    /** PATCH /v1/admin/service-subscriptions/{id}/reject */
    public function rejectSubscription(Request $request, int $id): JsonResponse
    {
        $subscription = $this->findAdminSubscription($request, $id);
        $data = $request->validate([
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'data' => $this->bills->reviewSubscription(
                $subscription,
                (int) $request->user()->id,
                'reject',
                $data['rejection_reason'] ?? null,
            ),
            'message' => 'Subscription declined.',
        ]);
    }

    /** GET /v1/property-services */
    public function residentIndex(Request $request): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $unit = $this->units->findActiveUnitForUser((int) $request->user()->id, $communityId);

        return response()->json([
            'data' => $this->catalog->listResidentCatalog($communityId, $unit),
            'unit' => $unit ? $this->units->formatUnit($unit, (int) $request->user()->id) : null,
        ]);
    }

    /** POST /v1/property-services/{id}/subscribe */
    public function subscribe(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $service = $this->catalog->findInCommunity($communityId, $id);
        abort_if(! $service, 404, 'Service not found.');
        $unit = $this->units->findActiveUnitForUser((int) $request->user()->id, $communityId);
        abort_if(! $unit, 422, 'Join a unit before subscribing to services.');

        $data = $request->validate(['note' => 'nullable|string|max:500']);

        return response()->json([
            'data' => $this->bills->requestSubscription($service, $unit, (int) $request->user()->id, $data['note'] ?? null),
            'message' => $service->requires_admin_approval
                ? 'Subscription request submitted for admin approval.'
                : 'Your unit is now subscribed.',
        ], 201);
    }

    /** POST /v1/property-services/{id}/unsubscribe */
    public function unsubscribe(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveResidentCommunityId($request);
        $service = $this->catalog->findInCommunity($communityId, $id);
        abort_if(! $service, 404, 'Service not found.');
        $unit = $this->units->findActiveUnitForUser((int) $request->user()->id, $communityId);
        abort_if(! $unit, 422, 'Join a unit before managing services.');

        return response()->json([
            'data' => $this->bills->cancelSubscription($service, $unit, (int) $request->user()->id),
            'message' => 'Subscription cancellation saved.',
        ]);
    }

    private function validatePayload(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        $rules = [
            'name' => "$required|string|max:120",
            'category' => [$required, Rule::in(PropertyServiceCatalogService::allowedCategories())],
            'custom_category' => 'nullable|string|max:80',
            'description' => 'nullable|string|max:500',
            'icon_key' => 'nullable|string|max:40',
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'application_type' => [$required, Rule::in(['automatic', 'optional'])],
            'billing_frequency' => ['sometimes', Rule::in(['monthly', 'yearly', 'one_time'])],
            'amount_type' => ['sometimes', Rule::in(['fixed', 'variable'])],
            'amount' => ['nullable', 'numeric', 'min:0.01', 'max:999999.99', 'regex:/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/'],
            'due_day' => 'nullable|integer|min:1|max:31',
            'first_billing_month' => 'nullable|string',
            'payment_instructions' => 'nullable|string|max:2000',
            'require_payment_proof' => 'sometimes|boolean',
            'require_acknowledgement' => 'sometimes|boolean',
            'auto_generate_bills' => 'sometimes|boolean',
            'send_notice' => 'sometimes|boolean',
            'send_notification' => 'sometimes|boolean',
            'notice_title' => 'nullable|string|max:200',
            'notice_body' => 'nullable|string|max:4000',
            'requires_admin_approval' => 'sometimes|boolean',
            'max_subscribers' => 'nullable|integer|min:1|max:100000',
            'unsubscribe_mode' => ['sometimes', Rule::in(['end_of_period', 'immediate'])],
        ];

        if (($request->input('category') ?? '') === 'other') {
            $rules['custom_category'] = ($creating ? 'required' : 'sometimes').'|string|min:2|max:80';
        }

        if (($request->input('amount_type') ?? 'fixed') !== 'variable') {
            $rules['amount'] = ['required', 'numeric', 'min:0.01', 'max:999999.99', 'regex:/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/'];
        }

        return $request->validate($rules, [
            'name.max' => 'Service name must be 120 characters or fewer.',
            'description.max' => 'Description must be 500 characters or fewer.',
            'payment_instructions.max' => 'Payment instructions must be 2,000 characters or fewer.',
            'custom_category.required' => 'Custom category must be at least 2 characters.',
            'custom_category.min' => 'Custom category must be at least 2 characters.',
            'custom_category.max' => 'Custom category must be 80 characters or fewer.',
            'amount.required' => 'Enter an amount of at least 0.01.',
            'amount.numeric' => 'Enter an amount of at least 0.01.',
            'amount.min' => 'Enter an amount of at least 0.01.',
            'amount.max' => 'Enter an amount of 999,999.99 or less.',
            'amount.regex' => 'Enter an amount with up to 2 decimal places.',
            'max_subscribers.integer' => 'Enter at least 1 subscriber.',
            'max_subscribers.min' => 'Enter at least 1 subscriber.',
            'max_subscribers.max' => 'Enter 100,000 subscribers or fewer.',
        ]);
    }

    private function findAdminService(Request $request, int $id): object
    {
        $service = $this->catalog->findInCommunity($this->resolveAdminCommunityId($request), $id);
        abort_if(! $service, 404, 'Service not found.');

        return $service;
    }

    private function findAdminSubscription(Request $request, int $id): object
    {
        $communityId = $this->resolveAdminCommunityId($request);
        $subscription = DB::table('unit_service_subscriptions')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();
        abort_if(! $subscription, 404, 'Subscription not found.');

        return $subscription;
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
