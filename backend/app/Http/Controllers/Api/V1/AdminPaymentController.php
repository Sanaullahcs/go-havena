<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentAttempt;
use App\Models\PaymentCase;
use App\Models\UtilityAccount;
use App\Services\AdminRoleService;
use App\Services\Kuickpay\KuickpayException;
use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Services\Payments\PaymentCaseService;
use App\Services\Payments\PaymentOrchestrator;
use App\Services\Payments\PaymentRouting;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Community admin KuickPay ledger, exceptions and settings. */
class AdminPaymentController extends Controller
{
    public function __construct(
        private readonly PaymentOrchestrator $orchestrator,
        private readonly OnlinePaymentPresenter $presenter,
        private readonly PaymentRouting $routing,
        private readonly KuickpayGateway $gateway,
        private readonly PaymentCaseService $cases,
    ) {
    }

    /** GET /v1/admin/payments */
    public function index(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $query = $this->filtered($request, $communityId)->with(['user:id,name', 'community:id,name'])->latest('id');

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
            'outstanding' => $this->outstandingTotals($communityId),
            'open_cases' => PaymentCase::query()->where('community_id', $communityId)->whereIn('status', PaymentCase::OPEN_STATUSES)->count(),
            'fees' => [
                'resident_fee' => null,
                'community_fee' => null,
                'note' => 'KuickPay does not return a processing-fee breakdown. Totals are the bill amount.',
            ],
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
            'message' => $this->reconcileMessage($attempt),
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

    /** GET /v1/admin/payments/export */
    public function export(Request $request): StreamedResponse
    {
        $communityId = $this->communityId($request);
        $rows = $this->filtered($request, $communityId)->with(['user:id,name'])->latest('id')->limit(5000)->get();

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Reference', 'Resident', 'Unit', 'Bill', 'Type', 'Amount', 'Currency', 'Status', 'Method', 'KuickPay transaction']);
            foreach ($rows as $attempt) {
                fputcsv($out, [
                    $this->csvCell(optional($attempt->confirmed_at ?? $attempt->created_at)->toDateTimeString()),
                    $this->csvCell($attempt->reference),
                    $this->csvCell($attempt->user?->name),
                    $this->csvCell($this->unitNumber($attempt->unit_id)),
                    $this->csvCell($attempt->title),
                    $this->csvCell($attempt->payable_type),
                    number_format($attempt->amount_paisa / 100, 2, '.', ''),
                    $this->csvCell($attempt->currency),
                    $this->csvCell($attempt->status),
                    $this->csvCell($attempt->method),
                    $this->csvCell($attempt->provider_transaction_id),
                ]);
            }
            fclose($out);
        }, 'kuickpay-payments.csv', ['Content-Type' => 'text/csv']);
    }

    /** GET /v1/admin/payments/outstanding */
    public function outstanding(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $totals = $this->outstandingTotals($communityId);
        $service = DB::table('unit_service_bills as b')
            ->leftJoin('users', 'users.id', '=', 'b.billing_contact_user_id')
            ->leftJoin('units', 'units.id', '=', 'b.unit_id')
            ->where('b.community_id', $communityId)
            ->whereIn('b.status', ['unpaid', 'overdue', 'acknowledged', 'rejected', 'pending_verification'])
            ->orderBy('b.due_date')
            ->limit(100)
            ->get(['b.id', 'b.title', 'b.amount', 'b.due_date', 'b.status', 'users.name as resident', 'units.unit_number'])
            ->map(fn ($row) => [
                'type' => 'unit_service_bill',
                'id' => (int) $row->id,
                'title' => $row->title,
                'amount' => (float) $row->amount,
                'due_date' => $row->due_date,
                'status' => $row->status,
                'resident' => $row->resident,
                'unit' => $row->unit_number,
            ]);
        $amenity = DB::table('amenity_resident_bills as b')
            ->leftJoin('users', 'users.id', '=', 'b.user_id')
            ->leftJoin('amenities', 'amenities.id', '=', 'b.amenity_id')
            ->leftJoin('amenity_monthly_bills as mb', 'mb.id', '=', 'b.monthly_bill_id')
            ->where('b.community_id', $communityId)
            ->whereIn('b.status', ['unpaid', 'overdue', 'rejected', 'pending_verification'])
            ->orderBy('mb.due_date')
            ->limit(100)
            ->get([
                'b.id', 'b.amount', 'b.status', 'b.user_id',
                'users.name as resident',
                'amenities.name as amenity_name',
                'mb.title as bill_title',
                'mb.due_date',
            ]);
        $units = $amenity->isEmpty() ? collect() : DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.status', 'active')
            ->where('units.community_id', $communityId)
            ->whereIn('ur.user_id', $amenity->pluck('user_id')->filter()->unique()->all())
            ->get(['ur.user_id', 'units.unit_number'])
            ->unique('user_id')
            ->pluck('unit_number', 'user_id');

        return response()->json(['data' => [
            'totals' => $totals,
            'bills' => $service->concat($amenity->map(fn ($row) => [
                'type' => 'amenity_resident_bill',
                'id' => (int) $row->id,
                'title' => trim((string) ($row->bill_title ?: $row->amenity_name ?: 'Amenity bill')),
                'amount' => (float) $row->amount,
                'due_date' => $row->due_date,
                'status' => $row->status,
                'resident' => $row->resident,
                'unit' => $units[$row->user_id] ?? null,
            ]))->values()->all(),
        ]]);
    }

    /** GET /v1/admin/payments/cases */
    public function cases(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $status = (string) $request->query('status', 'open');
        $rows = PaymentCase::query()
            ->where('community_id', $communityId)
            ->when($status === 'open', fn ($q) => $q->whereIn('status', PaymentCase::OPEN_STATUSES))
            ->when($status === 'closed', fn ($q) => $q->whereNotIn('status', PaymentCase::OPEN_STATUSES))
            ->latest('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows->map(fn (PaymentCase $case) => $this->cases->payload($case))->all()]);
    }

    /** POST /v1/admin/payments/{id}/cases */
    public function openCase(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(PaymentCase::KINDS)],
            'reason' => ['required', 'string', 'max:120'],
            'details' => ['nullable', 'string', 'max:2000'],
        ]);
        $case = $this->cases->open($request->user(), $this->find($request, $id), $data['kind'], $data['reason'], $data['details'] ?? null);

        return response()->json(['data' => $this->cases->payload($case)], 201);
    }

    /** POST /v1/admin/payments/cases/{case}/resolve */
    public function resolveCase(Request $request, string $case): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', Rule::in(['needs_information', 'rejected', 'recorded'])],
            'note' => ['nullable', 'string', 'max:2000'],
            'reopen_bill' => ['sometimes', 'boolean'],
        ]);
        $row = PaymentCase::query()->where('public_id', $case)->where('community_id', $this->communityId($request))->first();
        if (! $row) {
            throw new KuickpayException('case_not_found', 'Case not found.', 404);
        }
        $result = $this->cases->resolve($request->user(), $row, $data['decision'], $data['note'] ?? null, (bool) ($data['reopen_bill'] ?? false));

        return response()->json([
            'data' => $this->cases->payload($result['case']),
            'message' => 'Case updated. No money was sent to KuickPay.',
        ]);
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

    private function filtered(Request $request, int $communityId): Builder
    {
        $request->validate([
            'status' => ['nullable', Rule::in(['all', 'succeeded', 'processing', 'unsuccessful', 'attention', 'disputed'])],
            'type' => ['nullable', Rule::in(array_merge(['all'], PaymentAttempt::PAYABLE_TYPES))],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');
        $type = (string) $request->query('type', 'all');

        return PaymentAttempt::query()
            ->where('community_id', $communityId)
            ->where('status', '!=', PaymentAttempt::STATUS_CREATED)
            ->when($type !== 'all' && $type !== '', fn ($q) => $q->where('payable_type', $type))
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
            ->when($status === 'disputed', function ($q) {
                $q->whereExists(function ($inner) {
                    $inner->selectRaw('1')
                        ->from('payment_cases')
                        ->whereColumn('payment_cases.payment_attempt_id', 'payment_attempts.id')
                        ->where('payment_cases.kind', PaymentCase::KIND_DISPUTE)
                        ->whereIn('payment_cases.status', PaymentCase::OPEN_STATUSES);
                });
            })
            ->when($request->filled('from'), fn ($q) => $q->where('created_at', '>=', $request->date('from')->startOfDay()))
            ->when($request->filled('to'), fn ($q) => $q->where('created_at', '<=', $request->date('to')->endOfDay()))
            ->when($search !== '', function ($q) use ($search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('reference', 'like', '%'.$search.'%')
                        ->orWhere('title', 'like', '%'.$search.'%')
                        ->orWhere('provider_transaction_id', 'like', '%'.$search.'%')
                        ->orWhereHas('user', fn ($u) => $u->where('name', 'like', '%'.$search.'%'))
                        ->orWhereIn('unit_id', function ($units) use ($search) {
                            $units->select('id')->from('units')->where('unit_number', 'like', '%'.$search.'%');
                        });
                });
            });
    }

    /** @return array{count: int, amount: float} */
    private function outstandingTotals(int $communityId): array
    {
        $service = DB::table('unit_service_bills')
            ->where('community_id', $communityId)
            ->whereIn('status', ['unpaid', 'overdue', 'acknowledged', 'rejected', 'pending_verification'])
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->first();
        $amenity = DB::table('amenity_resident_bills')
            ->where('community_id', $communityId)
            ->whereIn('status', ['unpaid', 'overdue', 'rejected', 'pending_verification'])
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->first();

        return [
            'count' => (int) ($service->count ?? 0) + (int) ($amenity->count ?? 0),
            'amount' => round((float) ($service->amount ?? 0) + (float) ($amenity->amount ?? 0), 2),
        ];
    }

    private function csvCell(mixed $value): string
    {
        $text = (string) ($value ?? '');
        if ($text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'".$text;
        }

        return $text;
    }

    private function unitNumber(?int $unitId): ?string
    {
        if (! $unitId) {
            return null;
        }

        return DB::table('units')->where('id', $unitId)->value('unit_number');
    }

    private function reconcileMessage(PaymentAttempt $attempt): string
    {
        if (! $attempt->isActive()) {
            return 'Payment status updated.';
        }
        if ((string) config('kuickpay.checkout.status_path', '') === '') {
            return 'KuickPay has not published a checkout status API. This payment stays unpaid until a signed return or an institution payment arrives.';
        }

        return 'KuickPay has not confirmed this payment yet.';
    }
}
