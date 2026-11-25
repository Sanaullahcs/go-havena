<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Exceptions\BillingException;
use App\Models\SubscriptionCoupon;
use App\Services\CommunityBillingService;
use App\Services\SubscriptionCouponAdminService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SubscriptionCouponController extends Controller
{
    public function __construct(
        private readonly SubscriptionCouponAdminService $coupons,
        private readonly CommunityBillingService $billing,
    ) {
    }

    /** GET /v1/admin/subscription-coupons */
    public function index(Request $request): JsonResponse
    {
        $query = SubscriptionCoupon::query()->orderByDesc('id');

        $status = $request->string('status')->trim()->toString();
        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('code', 'like', '%'.$q.'%')
                    ->orWhere('name', 'like', '%'.$q.'%')
                    ->orWhere('description', 'like', '%'.$q.'%');
            });
        }

        $coupons = $query->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => collect($coupons->items())->map(fn (SubscriptionCoupon $coupon) => $this->coupons->transform($coupon)),
            'meta' => [
                'current_page' => $coupons->currentPage(),
                'last_page' => $coupons->lastPage(),
                'total' => $coupons->total(),
                'per_page' => $coupons->perPage(),
                'stripe_configured' => $this->billing->stripeConfigured(),
                'currency' => config('billing.currency', 'usd'),
            ],
        ]);
    }

    /** POST /v1/admin/subscription-coupons */
    public function store(Request $request): JsonResponse
    {
        $validated = $this->validated($request, creating: true);
        $coupon = $this->coupons->create($validated, $request->user());

        return response()->json([
            'data' => $this->coupons->transform($coupon),
            'message' => 'Coupon created.',
        ], 201);
    }

    /** PUT /v1/admin/subscription-coupons/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $coupon = SubscriptionCoupon::query()->findOrFail($id);
        $validated = $this->validated($request, creating: false);
        $coupon = $this->coupons->update($coupon, $validated);

        return response()->json([
            'data' => $this->coupons->transform($coupon),
            'message' => 'Coupon updated. Existing redemptions keep their original terms.',
        ]);
    }

    /** PATCH /v1/admin/subscription-coupons/{id}/status */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $coupon = SubscriptionCoupon::query()->findOrFail($id);
        $coupon = $this->coupons->setActive($coupon, (bool) $validated['is_active']);

        return response()->json([
            'data' => $this->coupons->transform($coupon),
            'message' => $coupon->is_active ? 'Coupon activated.' : 'Coupon deactivated.',
        ]);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, bool $creating): array
    {
        if ($request->has('code')) {
            $request->merge([
                'code' => strtoupper(trim((string) $request->input('code'))),
            ]);
        }

        $couponId = $request->route('id');
        $validated = $request->validate([
            'code' => [
                $creating ? 'required' : 'sometimes',
                'string',
                'max:40',
                'regex:/^[A-Z0-9_-]{3,40}$/',
                Rule::unique('subscription_coupons', 'code')->ignore($couponId),
            ],
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:2', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'discount_type' => [$creating ? 'required' : 'sometimes', 'in:percent,fixed'],
            'percent_off' => ['nullable', 'integer', 'min:1', 'max:100'],
            'amount_off_cents' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'discount_duration' => [$creating ? 'required' : 'sometimes', 'in:once,repeating,forever'],
            'discount_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'max_redemptions' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'applicable_plan_slugs' => ['nullable', 'array'],
            'applicable_plan_slugs.*' => ['string', 'max:50'],
            'is_active' => ['nullable', 'boolean'],
        ], [
            'code.required' => 'Coupon code is required.',
            'code.regex' => 'Use 3–40 characters: letters, numbers, underscores, or hyphens.',
            'code.unique' => 'This coupon code is already in use. Choose a different code.',
        ]);

        if (($validated['discount_duration'] ?? null) === 'repeating' && empty($validated['discount_months'])) {
            throw new BillingException(
                'Repeating coupons require discount_months.',
                'COUPON_INVALID',
            );
        }

        return $validated;
    }
}
