<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\ResolvesPaymentCommunity;
use App\Http\Controllers\Controller;
use App\Models\PaymentAttempt;
use App\Services\GuestAccessService;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\PaymentOrchestrator;
use App\Services\Payments\PaymentRouting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Resident KuickPay payments (Pakistan communities). */
class PaymentController extends Controller
{
    use ResolvesPaymentCommunity;

    public function __construct(
        private readonly PaymentOrchestrator $orchestrator,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly PaymentRouting $routing,
        private readonly KuickpayGateway $gateway,
    ) {
    }

    /** GET /v1/payments/capability */
    public function capability(Request $request): JsonResponse
    {
        $communityId = $this->paymentCommunityId($request);
        $provider = $this->routing->provider($communityId);
        $enabled = $this->routing->kuickpayEnabled($communityId);
        $profile = $provider === PaymentRouting::KUICKPAY ? $this->routing->profile($communityId) : null;

        return response()->json(['data' => [
            'provider' => $provider,
            'kuickpay' => [
                'enabled' => $enabled,
                'test_mode' => $enabled && $this->gateway->isSimulated(),
                'currency' => 'PKR',
                'methods' => $enabled ? array_values((array) config('kuickpay.methods', [])) : [],
                'utilities_enabled' => $enabled && (bool) $profile?->utilities_enabled,
                'residents_can_link_utilities' => (bool) $profile?->residents_can_link_utilities,
            ],
        ]]);
    }

    /** POST /v1/payments — Pay Now. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot make payments.');

        $data = $request->validate([
            'payable_type' => ['required', 'string', Rule::in(PaymentAttempt::PAYABLE_TYPES)],
            'payable_id' => ['required', 'integer', 'min:1'],
            'channel' => ['nullable', 'string', Rule::in([PaymentAttempt::CHANNEL_MOBILE, PaymentAttempt::CHANNEL_WEB])],
            'app_return_url' => ['nullable', 'string', 'max:500'],
            'expected_amount_paisa' => ['nullable', 'integer', 'min:0'],
        ]);

        $result = $this->orchestrator->pay($user, $data['payable_type'], (int) $data['payable_id'], [
            'channel' => $data['channel'] ?? PaymentAttempt::CHANNEL_MOBILE,
            'app_return_url' => $data['app_return_url'] ?? null,
            'expected_amount_paisa' => $data['expected_amount_paisa'] ?? null,
        ]);

        return response()->json(['data' => $result], $result['outcome'] === 'redirect' ? 201 : 200);
    }

    /** GET /v1/payments — the resident's payment history. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->paymentCommunityId($request);
        $status = (string) $request->query('status', 'all');

        $query = PaymentAttempt::query()
            ->with(['community:id,name', 'user:id,name'])
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->whereNotIn('status', [PaymentAttempt::STATUS_CREATED])
            ->when($status === 'succeeded', fn ($q) => $q->where('status', PaymentAttempt::STATUS_SUCCEEDED))
            ->when($status === 'pending', fn ($q) => $q->whereIn('status', PaymentAttempt::ACTIVE_STATUSES))
            ->when($status === 'unsuccessful', fn ($q) => $q->whereIn('status', [
                PaymentAttempt::STATUS_FAILED,
                PaymentAttempt::STATUS_CANCELLED,
                PaymentAttempt::STATUS_EXPIRED,
                PaymentAttempt::STATUS_REFUND_PENDING,
                PaymentAttempt::STATUS_REFUNDED,
            ]))
            ->latest('id');

        $page = $query->paginate(min(50, max(5, (int) $request->query('per_page', 20))));
        $paidThisMonth = (int) PaymentAttempt::query()
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', PaymentAttempt::STATUS_SUCCEEDED)
            ->where('confirmed_at', '>=', now()->startOfMonth())
            ->sum('amount_paisa');

        return response()->json([
            'data' => collect($page->items())->map(fn (PaymentAttempt $attempt) => $this->presenter->attempt($attempt))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'paid_this_month' => round($paidThisMonth / 100, 2),
            ],
        ]);
    }

    /** GET /v1/payments/{id} — authoritative status the app polls after checkout. */
    public function show(Request $request, string $id): JsonResponse
    {
        $attempt = $this->findOwned($request, $id);
        $attempt = $this->orchestrator->refresh($attempt, $request->boolean('sync'));

        return response()->json(['data' => $this->presenter->attempt($attempt->load(['community:id,name', 'user:id,name']))]);
    }

    /** POST /v1/payments/{id}/cancel */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $attempt = $this->orchestrator->cancel($this->findOwned($request, $id), $request->user());

        return response()->json(['data' => $this->presenter->attempt($attempt->load(['community:id,name', 'user:id,name']))]);
    }

    private function findOwned(Request $request, string $id): PaymentAttempt
    {
        $attempt = PaymentAttempt::query()
            ->where('public_id', $id)
            ->where('user_id', $request->user()->id)
            ->first();
        if (! $attempt) {
            throw new KuickpayException('payment_not_found', 'We could not find this payment.', 404);
        }

        return $attempt;
    }
}
