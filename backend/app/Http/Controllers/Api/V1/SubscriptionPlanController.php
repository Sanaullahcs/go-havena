<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionPlan;
use App\Services\CommunityBillingService;
use App\Services\SubscriptionPlanAdminService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionPlanController extends Controller
{
    public function __construct(
        private readonly SubscriptionPlanAdminService $plans,
        private readonly CommunityBillingService $billing,
    ) {
    }

    /** GET /v1/billing/plans — public active plans for marketing / checkout copy */
    public function publicIndex(): JsonResponse
    {
        return response()->json([
            'data' => $this->billing->formattedPlans(),
            'currency' => config('billing.currency', 'usd'),
        ]);
    }

    /** GET /v1/admin/subscription-plans */
    public function index(Request $request): JsonResponse
    {
        $query = SubscriptionPlan::query()->orderBy('sort_order')->orderBy('name');

        $status = $request->string('status')->trim()->toString();
        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('name', 'like', '%'.$q.'%')
                    ->orWhere('slug', 'like', '%'.$q.'%')
                    ->orWhere('description', 'like', '%'.$q.'%');
            });
        }

        $plans = $query->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => collect($plans->items())->map(fn (SubscriptionPlan $plan) => $this->plans->transform($plan)),
            'meta' => [
                'current_page' => $plans->currentPage(),
                'last_page' => $plans->lastPage(),
                'total' => $plans->total(),
                'per_page' => $plans->perPage(),
                'stripe_configured' => $this->billing->stripeConfigured(),
                'currency' => config('billing.currency', 'usd'),
            ],
        ]);
    }

    /** POST /v1/admin/subscription-plans */
    public function store(Request $request): JsonResponse
    {
        $validated = $this->validated($request, creating: true);
        $plan = $this->plans->create($validated);

        return response()->json([
            'data' => $this->plans->transform($plan),
            'message' => 'Plan created.',
        ], 201);
    }

    /** PUT /v1/admin/subscription-plans/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::query()->findOrFail($id);
        $validated = $this->validated($request, creating: false);
        $plan = $this->plans->update($plan, $validated);

        return response()->json([
            'data' => $this->plans->transform($plan),
            'message' => 'Plan updated.',
        ]);
    }

    /** PATCH /v1/admin/subscription-plans/{id}/status */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $plan = SubscriptionPlan::query()->findOrFail($id);
        $plan = $this->plans->setActive($plan, (bool) $validated['is_active']);

        return response()->json([
            'data' => $this->plans->transform($plan),
            'message' => $plan->is_active ? 'Plan activated.' : 'Plan deactivated.',
        ]);
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, bool $creating): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:2', 'max:80'],
            'slug' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'description' => ['nullable', 'string', 'max:500'],
            'seat_limit' => [$creating ? 'required' : 'sometimes', 'integer', 'min:1', 'max:100000'],
            'price_monthly_cents' => [$creating ? 'required' : 'sometimes', 'integer', 'min:0', 'max:100000000'],
            'price_yearly_cents' => [$creating ? 'required' : 'sometimes', 'integer', 'min:0', 'max:100000000'],
            'trial_period_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'is_active' => ['nullable', 'boolean'],
            'is_recommended' => ['nullable', 'boolean'],
        ]);
    }
}
