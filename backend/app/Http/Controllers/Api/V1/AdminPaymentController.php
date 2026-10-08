<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentAttempt;
use App\Models\UtilityAccount;
use App\Services\AdminRoleService;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\PaymentOrchestrator;
use App\Services\Payments\PaymentRouting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Community admin KuickPay ledger, exceptions and settings. */
class AdminPaymentController extends Controller
{
    public function __construct(
        private readonly PaymentOrchestrator $orchestrator,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly PaymentRouting $routing,
        private readonly KuickpayGateway $gateway,
    ) {
    }

    /** GET /v1/admin/payments */
    public function index(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $request->validate([
            'status' => ['nullable', Rule::in(['all', 'succeeded', 'processing', 'unsuccessful', 'attention'])],
            'type' => ['nullable', Rule::in(array_merge(['all'], PaymentAttempt::PAYABLE_TYPES))],
        ]);

        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');
        $type = (string) $request->query('type', 'all');

        $query = PaymentAttempt::query()
            ->with(['user:id,name', 'community:id,name'])
            ->where('community_id', $communityId)
            ->where('status', '!=', PaymentAttempt::STATUS_CREATED)
            ->when($type !== 'all', fn ($q) => $q->where('payable_type', $type))
            ->when($status === 'succeeded', fn ($q) => $q->where('status', PaymentAttempt::STATUS_SUCCEEDED))
            ->when($status === 'processing', fn ($q) => $q->whereIn('status', PaymentAttempt::ACTIVE_STATUSES))
            ->when($status === 'unsuccessful', fn ($q) => $q->whereIn('status', [
                PaymentAttempt::STATUS_FAILED,
                PaymentAttempt::STATUS_CANCELLED,
                PaymentAttempt::STATUS_EXPIRED,
            ]))
            ->when($status === 'attention', fn ($q) => $q->where(function ($inner) {
                $inner->where('needs_attention', true)->orWhere('status', PaymentAttempt::STATUS_REFUND_PENDING);
            }))
            ->when($search !== '', function ($q) use ($search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('reference', 'like', '%'.$search.'%')
                        ->orWhere('title', 'like', '%'.$search.'%')
                        ->orWhere('provider_transaction_id', 'like', '%'.$search.'%')
                        ->orWhereHas('user', fn ($u) => $u->where('name', 'like', '%'.$search.'%'));
                });
            })
            ->latest('id');

        $page = $query->paginate(min(100, max(10, (int) $request->query('per_page', 25))));

        return response()->json([
            'data' => collect($page->items())->map(fn (PaymentAttempt $attempt) => $this->presenter->attempt($attempt, true))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /** GET /v1/admin/payments/summary */
    public function summary(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $base = PaymentAttempt::query()->where('community_id', $communityId);
        $monthStart = now()->startOfMonth();

        $collected = (int) (clone $base)->where('status', PaymentAttempt::STATUS_SUCCEEDED)->where('confirmed_at', '>=', $monthStart)->sum('amount_paisa');
        $collectedCount = (clone $base)->where('status', PaymentAttempt::STATUS_SUCCEEDED)->where('confirmed_at', '>=', $monthStart)->count();
        $byType = (clone $base)->where('status', PaymentAttempt::STATUS_SUCCEEDED)->where('confirmed_at', '>=', $monthStart)
            ->selectRaw('payable_type, SUM(amount_paisa) as total, COUNT(*) as count')
            ->groupBy('payable_type')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->payable_type => ['amount' => round(((int) $row->total) / 100, 2), 'count' => (int) $row->count]]);

        $profile = $this->routing->profile($communityId);

        return response()->json(['data' => [
            'provider' => $this->routing->provider($communityId),
            'enabled' => $this->routing->kuickpayEnabled($communityId),
            'test_mode' => $this->gateway->isSimulated(),
            'collected_this_month' => round($collected / 100, 2),
            'collected_count_this_month' => $collectedCount,
            'by_type' => $byType,
            'processing' => (clone $base)->whereIn('status', PaymentAttempt::IN_FLIGHT_STATUSES)->count(),
            'needs_attention' => (clone $base)->where(function ($q) {
                $q->where('needs_attention', true)->orWhere('status', PaymentAttempt::STATUS_REFUND_PENDING);
            })->count(),
            'linked_utility_accounts' => UtilityAccount::query()->where('community_id', $communityId)->whereNull('disabled_at')->count(),
            'profile' => $profile->toPayload(),
        ]]);
    }

    /** GET /v1/admin/payments/{id} */
    public function show(Request $request, string $id): JsonResponse
    {
        $attempt = $this->find($request, $id)->load(['user:id,name', 'community:id,name', 'events']);

        return response()->json(['data' => $this->presenter->attempt($attempt, true) + [
            'events' => $attempt->events->map(fn ($event) => [
                'event' => $event->event,
                'status_from' => $event->status_from,
                'status_to' => $event->status_to,
                'actor_type' => $event->actor_type,
                'created_at' => $event->created_at?->toIso8601String(),
            ])->all(),
        ]]);
    }

    /** POST /v1/admin/payments/{id}/reconcile */
    public function reconcile(Request $request, string $id): JsonResponse
    {
        $attempt = $this->orchestrator->reconcile($this->find($request, $id));

        return response()->json([
            'data' => $this->presenter->attempt($attempt->load(['user:id,name', 'community:id,name']), true),
            'message' => $attempt->isActive() ? 'KuickPay has not confirmed this payment yet.' : 'Payment status updated.',
        ]);
    }

    /** POST /v1/admin/payments/{id}/refunded */
    public function markRefunded(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:300']]);
        $attempt = $this->orchestrator->markRefunded($this->find($request, $id), $request->user(), $data['note'] ?? null);

        return response()->json([
            'data' => $this->presenter->attempt($attempt->load(['user:id,name', 'community:id,name']), true),
            'message' => 'Refund recorded and the resident was notified.',
        ]);
    }

    /** PATCH /v1/admin/payments/settings */
    public function updateSettings(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        if ($this->routing->provider($communityId) !== PaymentRouting::KUICKPAY) {
            throw new KuickpayException('wrong_region', 'KuickPay settings are only available for communities in Pakistan.');
        }

        $data = $request->validate([
            'payments_enabled' => ['sometimes', 'boolean'],
            'utilities_enabled' => ['sometimes', 'boolean'],
            'residents_can_link_utilities' => ['sometimes', 'boolean'],
            'settlement_account_title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'settlement_bank' => ['sometimes', 'nullable', 'string', 'max:80'],
            'settlement_account_last4' => ['sometimes', 'nullable', 'digits:4'],
        ]);

        $profile = $this->routing->profile($communityId);
        $profile->fill($data)->save();
        $this->routing->forgetProfile($communityId);

        return response()->json(['data' => $profile->fresh()->toPayload(), 'message' => 'Payment settings saved.']);
    }

    private function find(Request $request, string $id): PaymentAttempt
    {
        $attempt = PaymentAttempt::query()
            ->where('public_id', $id)
            ->where('community_id', $this->communityId($request))
            ->first();
        if (! $attempt) {
            throw new KuickpayException('payment_not_found', 'Payment not found.', 404);
        }

        return $attempt;
    }

    private function communityId(Request $request): int
    {
        $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return (int) $scope;
    }
}
