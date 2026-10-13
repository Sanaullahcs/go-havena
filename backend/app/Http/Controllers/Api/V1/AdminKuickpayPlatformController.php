<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\PaymentAttempt;
use App\Models\PaymentCase;
use App\Services\Payments\PaymentRouting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * System-admin view of KuickPay. Shows whether credentials are present, never their values.
 */
class AdminKuickpayPlatformController extends Controller
{
    public function __construct(private readonly PaymentRouting $routing)
    {
    }

    /** GET /v1/admin/kuickpay/overview */
    public function overview(): JsonResponse
    {
        $attempts = PaymentAttempt::query()->where('provider', PaymentAttempt::PROVIDER_KUICKPAY);

        return response()->json(['data' => [
            'mode' => (string) config('kuickpay.mode', 'sandbox'),
            'operational' => $this->routing->kuickpayOperational(),
            'checkout_status_api' => (string) config('kuickpay.checkout.status_path', '') !== '' ? 'configured' : 'not_published',
            'method_selection' => 'hosted_page',
            'credentials' => [
                'company_id' => $this->set(config('kuickpay.checkout.company_id')),
                'secured_key' => $this->set(config('kuickpay.checkout.secured_key')),
                'bill_initiator_key' => $this->set(config('kuickpay.bill_initiator.api_key')),
                'initiator_id' => $this->set(config('kuickpay.bill_initiator.initiator_id')),
                'institution_id' => $this->set(config('kuickpay.institution.id')),
                'institution_username' => $this->set(config('kuickpay.institution.username')),
                'institution_password' => $this->set(config('kuickpay.institution.password')),
            ],
            'counts' => [
                'succeeded' => (clone $attempts)->where('status', PaymentAttempt::STATUS_SUCCEEDED)->count(),
                'processing' => (clone $attempts)->whereIn('status', PaymentAttempt::ACTIVE_STATUSES)->count(),
                'failed' => (clone $attempts)->where('status', PaymentAttempt::STATUS_FAILED)->count(),
                'needs_attention' => (clone $attempts)->where(function ($q) {
                    $q->where('needs_attention', true)->orWhere('status', PaymentAttempt::STATUS_REFUND_PENDING);
                })->count(),
                'open_cases' => PaymentCase::query()->whereIn('status', PaymentCase::OPEN_STATUSES)->count(),
            ],
            'communities' => $this->communities(),
            'note' => 'Checkout status inquiry is not documented by KuickPay. Reconciliation uses the signed return and the institution bill-payment callback.',
        ]]);
    }

    /** GET /v1/admin/kuickpay/payments */
    public function payments(Request $request): JsonResponse
    {
        $page = $this->paymentQuery($request)->latest('id')->paginate(min(100, max(10, (int) $request->query('per_page', 25))));

        return response()->json([
            'data' => collect($page->items())->map(fn (PaymentAttempt $attempt) => $this->row($attempt))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /** GET /v1/admin/kuickpay/payments/export */
    public function export(Request $request): StreamedResponse
    {
        $rows = $this->paymentQuery($request)->latest('id')->limit(5000)->get();

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Community', 'Reference', 'Resident', 'Bill', 'Amount', 'Currency', 'Status', 'Method', 'KuickPay transaction']);
            foreach ($rows as $attempt) {
                fputcsv($out, [
                    $this->csvCell(optional($attempt->confirmed_at ?? $attempt->created_at)->toDateTimeString()),
                    $this->csvCell($attempt->community?->name),
                    $this->csvCell($attempt->reference),
                    $this->csvCell($attempt->user?->name),
                    $this->csvCell($attempt->title),
                    number_format($attempt->amount_paisa / 100, 2, '.', ''),
                    $this->csvCell($attempt->currency),
                    $this->csvCell($attempt->status),
                    $this->csvCell($attempt->method),
                    $this->csvCell($attempt->provider_transaction_id),
                ]);
            }
            fclose($out);
        }, 'kuickpay-platform.csv', ['Content-Type' => 'text/csv']);
    }

    /** @return list<array<string, mixed>> */
    private function communities(): array
    {
        return Community::query()
            ->where('status', 'active')
            ->orderBy('name')
            ->get(['id', 'name'])
            ->filter(fn (Community $community) => $this->routing->isKuickpayCountry((int) $community->id))
            ->map(function (Community $community) {
                $profile = $this->routing->profile((int) $community->id);

                return [
                    'id' => (int) $community->id,
                    'name' => $community->name,
                    'payments_enabled' => (bool) $profile->payments_enabled,
                    'utilities_enabled' => (bool) $profile->utilities_enabled,
                    'rail' => $this->routing->provider((int) $community->id),
                ];
            })
            ->values()
            ->all();
    }

    private function paymentQuery(Request $request)
    {
        $status = (string) $request->query('status', 'attention');

        return PaymentAttempt::query()
            ->with(['user:id,name', 'community:id,name'])
            ->where('provider', PaymentAttempt::PROVIDER_KUICKPAY)
            ->when($request->filled('community_id'), fn ($q) => $q->where('community_id', (int) $request->query('community_id')))
            ->when($status === 'attention', fn ($q) => $q->where(function ($inner) {
                $inner->where('needs_attention', true)
                    ->orWhere('status', PaymentAttempt::STATUS_REFUND_PENDING)
                    ->orWhere('status', PaymentAttempt::STATUS_PENDING_CONFIRMATION);
            }))
            ->when($status === 'succeeded', fn ($q) => $q->where('status', PaymentAttempt::STATUS_SUCCEEDED))
            ->when($status === 'failed', fn ($q) => $q->where('status', PaymentAttempt::STATUS_FAILED))
            ->when($status === 'all', fn ($q) => $q->where('status', '!=', PaymentAttempt::STATUS_CREATED));
    }

    /** @return array<string, mixed> */
    private function row(PaymentAttempt $attempt): array
    {
        return [
            'id' => $attempt->public_id,
            'community' => $attempt->community?->name,
            'community_id' => (int) $attempt->community_id,
            'resident' => $attempt->user?->name,
            'title' => $attempt->title,
            'reference' => $attempt->reference,
            'amount' => round($attempt->amount_paisa / 100, 2),
            'currency' => $attempt->currency,
            'status' => $attempt->status,
            'method' => $attempt->method,
            'needs_attention' => (bool) $attempt->needs_attention,
            'transaction_id' => $attempt->provider_transaction_id,
            'created_at' => $attempt->created_at?->toIso8601String(),
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

    private function set(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }
}
