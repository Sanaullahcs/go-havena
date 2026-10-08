<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityPlaidConnection;
use App\Models\PlaidTransfer;
use App\Models\PlaidTransferEvent;
use App\Services\ActivityLogService;
use App\Services\PlaidAchService;
use App\Services\PlaidEligibilityService;
use App\Services\PlaidService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * System Admin Plaid operations. Read-mostly: every write either asks Plaid for
 * the truth (refresh, sync) or records an operational decision (pause, exception
 * note). Nothing here can mark a payment settled, refunded or delete history.
 */
class AdminPlaidController extends Controller
{
    private const STATUS_FILTERS = ['all', 'pending', 'paid', 'failed', 'returned', 'cancelled', 'refunds', 'exceptions', 'stale'];

    public function __construct(
        private readonly PlaidAchService $ach,
        private readonly PlaidService $plaid,
        private readonly PlaidEligibilityService $eligibility,
    ) {
    }

    /** GET /v1/admin/plaid/overview */
    public function overview(): JsonResponse
    {
        $staleBefore = now()->subMinutes((int) config('plaid.transfer.stale_after_minutes', 5760));
        $since = now()->subDays(30);

        $connections = CommunityPlaidConnection::query()->get()->keyBy('community_id');
        $pendingByCommunity = PlaidTransfer::query()
            ->whereIn('status', [PlaidTransfer::STATUS_AUTHORIZING, PlaidTransfer::STATUS_AUTHORIZED, PlaidTransfer::STATUS_PROCESSING, PlaidTransfer::STATUS_POSTED])
            ->selectRaw('community_id, COUNT(*) as total')
            ->groupBy('community_id')
            ->pluck('total', 'community_id');

        $communities = Community::query()
            ->whereIn('review_status', ['approved'])
            ->orderBy('name')
            ->limit(500)
            ->get(['id', 'name', 'status'])
            ->filter(fn (Community $c) => $this->eligibility->isCommunityEligible((int) $c->id) || $connections->has($c->id))
            ->map(function (Community $community) use ($connections, $pendingByCommunity) {
                /** @var CommunityPlaidConnection|null $bank */
                $bank = $connections->get($community->id);
                $readiness = $this->ach->readiness((int) $community->id);

                return [
                    'id' => $community->id,
                    'name' => $community->name,
                    'status' => $community->status,
                    'country_code' => $this->eligibility->countryCodeForCommunity((int) $community->id),
                    'eligible' => $this->eligibility->isCommunityEligible((int) $community->id),
                    'bank' => $this->plaid->publicStatusForCommunity($bank),
                    'payments_paused' => $bank?->paymentsPaused() ?? false,
                    'payments_pause_reason' => $bank?->payments_pause_reason,
                    'payments_paused_at' => $bank?->payments_paused_at?->toIso8601String(),
                    'ready' => $readiness['ready'],
                    'readiness_reason' => $readiness['reason'],
                    'readiness_message' => $readiness['message'],
                    'open_payments' => (int) ($pendingByCommunity[$community->id] ?? 0),
                ];
            })
            ->values();

        return response()->json(['data' => [
            'config' => [
                'environment' => $this->plaid->environment(),
                'app_environment' => app()->environment(),
                'configured' => $this->plaid->configured(),
                'client_id_set' => filled(config('plaid.client_id')),
                'secret_set' => filled(config('plaid.secret')),
                'transfers_enabled' => (bool) config('plaid.transfer.enabled', true),
                'simulated' => $this->ach->forceSimulate(),
                'sandbox_blocked_in_production' => $this->ach->sandboxBlockedInProduction(),
                'webhook_url_set' => filled(config('plaid.webhook_url')),
                'verify_webhooks' => (bool) config('plaid.verify_webhooks', false),
                'supported_country_codes' => $this->eligibility->supportedCountryCodes(),
                'link_products' => config('plaid.link.products'),
                'resident_link_products' => config('plaid.link.resident_products'),
            ],
            'health' => [
                'last_webhook_received_at' => Cache::get('plaid:webhook:last_received'),
                'last_webhook_processed_at' => Cache::get('plaid:webhook:last_processed'),
                'last_webhook_failed_at' => Cache::get('plaid:webhook:last_failed'),
                'last_event_sync_at' => Cache::get('plaid:transfer-event-sync:last_run'),
                'event_cursor' => (int) (PlaidTransferEvent::query()->max('event_id') ?? 0),
                'unmatched_events' => PlaidTransferEvent::query()->where('matched', false)->where('outcome', 'unmatched')->count(),
            ],
            'counts' => [
                'pending' => PlaidTransfer::query()->whereIn('status', [PlaidTransfer::STATUS_AUTHORIZING, PlaidTransfer::STATUS_AUTHORIZED, PlaidTransfer::STATUS_PROCESSING])->count(),
                'stale' => $this->staleQuery($staleBefore)->count(),
                'failed_30d' => PlaidTransfer::query()->where('status', PlaidTransfer::STATUS_FAILED)->where('created_at', '>=', $since)->count(),
                'returned_30d' => PlaidTransfer::query()->where('status', PlaidTransfer::STATUS_RETURNED)->where('updated_at', '>=', $since)->count(),
                'refunds_pending' => PlaidTransfer::query()->whereIn('refund_status', [PlaidTransfer::REFUND_PENDING, PlaidTransfer::REFUND_POSTED])->count(),
                'open_exceptions' => PlaidTransfer::query()->whereNotNull('exception_code')->whereNull('exception_resolved_at')->count(),
            ],
            'communities' => $communities,
        ]]);
    }

    /** GET /v1/admin/plaid/transfers */
    public function transfers(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['nullable', Rule::in(self::STATUS_FILTERS)],
            'community_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'payable_type' => ['nullable', Rule::in([PlaidTransfer::PAYABLE_BOOKING, PlaidTransfer::PAYABLE_SHARED_BILL])],
            'payable_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $status = (string) $request->query('status', 'all');
        $search = trim((string) $request->query('search', ''));
        $staleBefore = now()->subMinutes((int) config('plaid.transfer.stale_after_minutes', 5760));

        $query = PlaidTransfer::query()
            ->with(['user:id,name,email', 'community:id,name'])
            ->when($request->filled('community_id'), fn (Builder $q) => $q->where('community_id', $request->integer('community_id')))
            ->when($request->filled('user_id'), fn (Builder $q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('payable_type'), fn (Builder $q) => $q->where('payable_type', $request->query('payable_type')))
            ->when($request->filled('payable_id'), fn (Builder $q) => $q->where('payable_id', $request->integer('payable_id')))
            ->when($request->filled('from'), fn (Builder $q) => $q->where('created_at', '>=', $request->date('from')->startOfDay()))
            ->when($request->filled('to'), fn (Builder $q) => $q->where('created_at', '<=', $request->date('to')->endOfDay()))
            ->when($status === 'pending', fn (Builder $q) => $q->whereIn('status', [PlaidTransfer::STATUS_AUTHORIZING, PlaidTransfer::STATUS_AUTHORIZED, PlaidTransfer::STATUS_PROCESSING]))
            ->when($status === 'paid', fn (Builder $q) => $q->whereIn('status', [PlaidTransfer::STATUS_POSTED, PlaidTransfer::STATUS_SETTLED])->whereNull('refund_status'))
            ->when($status === 'failed', fn (Builder $q) => $q->where('status', PlaidTransfer::STATUS_FAILED))
            ->when($status === 'returned', fn (Builder $q) => $q->where('status', PlaidTransfer::STATUS_RETURNED))
            ->when($status === 'cancelled', fn (Builder $q) => $q->where('status', PlaidTransfer::STATUS_CANCELLED))
            ->when($status === 'refunds', fn (Builder $q) => $q->whereNotNull('refund_status'))
            ->when($status === 'exceptions', fn (Builder $q) => $q->whereNotNull('exception_code')->whereNull('exception_resolved_at'))
            ->when($status === 'stale', fn (Builder $q) => $q->whereIn('id', $this->staleQuery($staleBefore)->select('id')))
            ->when($search !== '', function (Builder $q) use ($search) {
                $q->where(function (Builder $inner) use ($search) {
                    $inner->where('public_id', $search)
                        ->orWhere('debit_transfer_id', $search)
                        ->orWhere('credit_transfer_id', $search)
                        ->orWhere('refund_transfer_id', $search)
                        ->orWhere('debit_authorization_id', $search)
                        ->orWhereHas('user', fn (Builder $u) => $u->where('name', 'like', '%'.$search.'%')->orWhere('email', 'like', '%'.$search.'%'));
                });
            })
            ->latest('id');

        $page = $query->paginate((int) $request->query('per_page', 25));

        return response()->json([
            'data' => collect($page->items())->map(fn (PlaidTransfer $t) => $t->toAdminPayload())->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /** GET /v1/admin/plaid/transfers/{id} */
    public function show(string $id): JsonResponse
    {
        $transfer = $this->find($id)->load(['user:id,name,email', 'community:id,name', 'events']);

        return response()->json(['data' => $transfer->toAdminPayload() + [
            'events' => $transfer->events->map(fn (PlaidTransferEvent $e) => $e->toAdminPayload())->all(),
        ]]);
    }

    /** POST /v1/admin/plaid/transfers/{id}/refresh — read-only provider lookup. */
    public function refresh(Request $request, string $id): JsonResponse
    {
        $transfer = $this->ach->refreshFromProvider($this->find($id));
        $this->audit($request, 'plaid_admin_transfer_refreshed', $transfer, []);

        return response()->json([
            'data' => $transfer->load(['user:id,name,email', 'community:id,name'])->toAdminPayload(),
            'message' => $transfer->simulated
                ? 'This is a simulated sandbox payment; there is nothing to refresh at Plaid.'
                : 'Status refreshed from Plaid.',
        ]);
    }

    /** POST /v1/admin/plaid/transfers/{id}/resolve-exception — investigation note only. */
    public function resolveException(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'min:5', 'max:500']]);
        $transfer = $this->find($id);
        abort_unless($transfer->hasOpenException(), 422, 'This payment has no open exception.');

        $meta = (array) ($transfer->meta ?? []);
        $meta['exception_resolutions'][] = [
            'code' => $transfer->exception_code,
            'note' => $data['note'],
            'by' => $request->user()->id,
            'at' => now()->toIso8601String(),
        ];
        $transfer->forceFill(['exception_resolved_at' => now(), 'meta' => $meta])->save();
        $this->audit($request, 'plaid_admin_exception_resolved', $transfer, ['note' => $data['note'], 'exception_code' => $transfer->exception_code]);

        return response()->json([
            'data' => $transfer->fresh(['user:id,name,email', 'community:id,name'])->toAdminPayload(),
            'message' => 'Exception marked as reviewed. The payment status was not changed.',
        ]);
    }

    /** POST /v1/admin/plaid/sync-events */
    public function syncEvents(Request $request): JsonResponse
    {
        $result = $this->ach->syncEvents();
        ActivityLogService::user('plaid_admin_event_sync', 'Ran Plaid transfer event sync', 'Plaid', null, 'info', $request->user()->id, $result);

        return response()->json([
            'data' => $result,
            'message' => $result['skipped'] ? 'Event sync skipped (already running, simulated, or not configured).' : 'Transfer events synced.',
        ]);
    }

    /** GET /v1/admin/plaid/events */
    public function events(Request $request): JsonResponse
    {
        $page = PlaidTransferEvent::query()
            ->when($request->boolean('unmatched'), fn (Builder $q) => $q->where('outcome', 'unmatched'))
            ->latest('event_id')
            ->paginate(50);

        return response()->json([
            'data' => collect($page->items())->map(fn (PlaidTransferEvent $e) => $e->toAdminPayload())->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /** PATCH /v1/admin/plaid/communities/{id}/payments — pause/resume new payments only. */
    public function updateCommunityPayments(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:255'],
        ]);

        $community = Community::query()->findOrFail($id);
        $bank = CommunityPlaidConnection::query()->where('community_id', $community->id)->first();
        abort_if(! $bank, 422, 'This community has never connected a bank. There is nothing to pause yet.');

        $bank->forceFill($data['enabled']
            ? ['payments_paused_at' => null, 'payments_paused_by' => null, 'payments_pause_reason' => null]
            : ['payments_paused_at' => now(), 'payments_paused_by' => $request->user()->id, 'payments_pause_reason' => $data['reason']]
        )->save();

        ActivityLogService::user(
            $data['enabled'] ? 'plaid_admin_payments_resumed' : 'plaid_admin_payments_paused',
            ($data['enabled'] ? 'Resumed' : 'Paused').' US bank payments for '.$community->name.': '.$data['reason'],
            Community::class,
            $community->id,
            'warning',
            $request->user()->id,
            ['community_id' => $community->id, 'reason' => $data['reason'], 'related_item' => $community->name],
        );

        return response()->json([
            'data' => ['community_id' => $community->id, 'readiness' => $this->ach->readiness($community->id)],
            'message' => $data['enabled']
                ? 'Bank payments resumed for this community.'
                : 'New bank payments are paused. Existing payments keep updating from Plaid.',
        ]);
    }

    private function staleQuery(\DateTimeInterface $before): Builder
    {
        return PlaidTransfer::query()
            ->where('created_at', '<', $before)
            ->where(fn (Builder $q) => $q
                ->whereIn('status', [PlaidTransfer::STATUS_AUTHORIZING, PlaidTransfer::STATUS_AUTHORIZED, PlaidTransfer::STATUS_PROCESSING])
                ->orWhereIn('refund_status', [PlaidTransfer::REFUND_PENDING, PlaidTransfer::REFUND_POSTED]));
    }

    private function find(string $id): PlaidTransfer
    {
        $transfer = PlaidTransfer::query()->where('public_id', $id)->first();
        abort_if(! $transfer, 404, 'Payment not found.');

        return $transfer;
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function audit(Request $request, string $action, PlaidTransfer $transfer, array $extra): void
    {
        ActivityLogService::user(
            $action,
            'System admin action on bank payment '.$transfer->public_id,
            Community::class,
            (int) $transfer->community_id,
            'info',
            $request->user()->id,
            array_merge([
                'community_id' => $transfer->community_id,
                'status' => $transfer->status,
                'related_item' => $transfer->public_id,
            ], $extra),
        );
    }
}
