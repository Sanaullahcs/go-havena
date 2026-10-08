<?php

namespace App\Services;

use App\Mail\HavenaTransactionalMail;
use App\Models\PaymentAttempt;
use App\Models\PlaidTransfer;
use App\Models\User;
use App\Services\Payments\OnlinePaymentPresenter;
use App\Support\AppUrls;
use App\Support\Currency;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Payment emails that mirror the in-app bill notifications: bill issued, due
 * reminders, proof received, payment confirmed (with receipt), proof rejected,
 * online refunds and bank returns. Each email is sent once per event
 * (LifecycleMailService::sendOnce), and a mail failure never breaks a payment flow.
 */
class PaymentMailService
{
    public const UNIT = 'unit';

    public const AMENITY = 'amenity';

    public function __construct(
        private readonly LifecycleMailService $mailer,
        private readonly CommunityCurrencyService $currency,
    ) {
    }

    public function unitBill(int $billId, string $kind): void
    {
        $this->guard(fn () => $this->sendBillMail(self::UNIT, $this->loadUnitBill($billId), $kind), ['unit_bill' => $billId, 'kind' => $kind]);
    }

    public function amenityBill(int $residentBillId, string $kind): void
    {
        $this->guard(fn () => $this->sendBillMail(self::AMENITY, $this->loadAmenityBill($residentBillId), $kind), ['amenity_bill' => $residentBillId, 'kind' => $kind]);
    }

    /** KuickPay outcomes: succeeded, refund_pending, refunded. */
    public function onlinePayment(PaymentAttempt $attempt, string $kind): void
    {
        $this->guard(fn () => $this->sendOnlineMail($attempt, $kind), ['payment' => $attempt->public_id, 'kind' => $kind]);
    }

    /** Plaid ACH outcomes keyed like PlaidAchService::notifyResident: paid, returned, failed, cancelled, refunded. */
    public function bankPayment(PlaidTransfer $transfer, string $kind): void
    {
        $this->guard(fn () => $this->sendBankMail($transfer, $kind), ['transfer' => $transfer->public_id, 'kind' => $kind]);
    }

    // ── Bills ────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>|null  $bill
     */
    private function sendBillMail(string $type, ?array $bill, string $kind): void
    {
        if (! $bill || ! $bill['user']) {
            return;
        }

        $user = $bill['user'];
        $hello = $this->greeting($user);
        $amount = $bill['amount_label'];
        $due = $bill['due_label'];
        $what = $bill['service'];
        $billDetails = $this->billDetails($bill);
        $cta = $type === self::UNIT ? 'Open unit bills' : 'Open amenity bills';
        $payHint = $bill['online']
            ? 'Pay securely in the Havena app with KuickPay (Easypaisa, JazzCash, card, bank or Raast), or upload proof if you paid another way.'
            : 'Open the Havena app to see payment instructions and upload proof once you have paid.';

        $mail = match ($kind) {
            'created' => new HavenaTransactionalMail(
                subjectLine: "New bill: {$what} · {$amount} due {$due}",
                preheader: "{$amount} for {$what} is due on {$due}.",
                eyebrow: 'New bill',
                heading: "{$amount} due {$due}",
                intro: "{$hello} your {$bill['period_phrase']}bill for {$what} at {$bill['community']} is ready.",
                paragraphs: [$payHint],
                details: array_merge([['label' => 'Invoice', 'value' => $bill['invoice_number']]], $billDetails),
                ctaLabel: 'View & pay',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: 'You receive this because you are the billing contact for this bill in Havena.',
            ),
            'due_soon' => new HavenaTransactionalMail(
                subjectLine: "Reminder: {$what} is due {$due}",
                preheader: "{$amount} is due on {$due}. Paying early keeps everything on track.",
                eyebrow: 'Payment reminder',
                heading: "Due {$due}",
                intro: "{$hello} a friendly reminder that {$amount} for {$what} is due soon.",
                paragraphs: [$payHint],
                details: array_merge([['label' => 'Invoice', 'value' => $bill['invoice_number']]], $billDetails),
                ctaLabel: 'Pay now',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'due_date' => new HavenaTransactionalMail(
                subjectLine: "Due today: {$what} · {$amount}",
                preheader: "Today is the due date for {$what}.",
                eyebrow: 'Due today',
                heading: 'Your bill is due today',
                intro: "{$hello} {$amount} for {$what} is due today.",
                paragraphs: [$payHint, 'Already paid? Upload your proof in the app so the admin can mark it as paid.'],
                details: array_merge([['label' => 'Invoice', 'value' => $bill['invoice_number']]], $billDetails),
                ctaLabel: 'Pay now',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'overdue' => new HavenaTransactionalMail(
                subjectLine: "Overdue: {$what} · {$amount}",
                preheader: "{$what} was due on {$due} and is still unpaid.",
                eyebrow: 'Payment overdue',
                heading: 'This bill is overdue',
                intro: "{$hello} {$amount} for {$what} was due on {$due} and is still unpaid.",
                paragraphs: array_values(array_filter([
                    $type === self::AMENITY ? 'Bookings for this amenity stay paused until the bill is paid.' : null,
                    $payHint,
                    'If you have already paid, upload your proof in the app and we will take it from there.',
                ])),
                details: array_merge([['label' => 'Invoice', 'value' => $bill['invoice_number']]], $billDetails),
                ctaLabel: 'Pay now',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'proof_submitted' => new HavenaTransactionalMail(
                subjectLine: "We received your payment proof for {$what}",
                preheader: 'Your proof is with the admin for review.',
                eyebrow: 'Proof received',
                heading: 'Thanks, it is under review',
                intro: "{$hello} we received your payment proof for {$what}. The admin will review it and you will get an email as soon as it is checked.",
                details: array_values(array_filter(array_merge($billDetails, [
                    $bill['payment_date'] ? ['label' => 'Paid on', 'value' => $bill['payment_date']] : null,
                    $bill['reference'] ? ['label' => 'Your reference', 'value' => $bill['reference']] : null,
                ]))),
                ctaLabel: $cta,
                ctaUrl: AppUrls::residentLogin(),
            ),
            'approved' => new HavenaTransactionalMail(
                subjectLine: "Payment confirmed · Receipt {$bill['receipt_number']}",
                preheader: "{$amount} for {$what} is paid in full.",
                eyebrow: 'Payment confirmed',
                heading: 'Paid in full',
                intro: "{$hello} your payment of {$amount} for {$what} has been confirmed. Thank you!",
                paragraphs: ['Your receipt is below. You can also save or share it from the bill in the Havena app.'],
                details: array_values(array_filter(array_merge(
                    [['label' => 'Receipt', 'value' => $bill['receipt_number']]],
                    $billDetails,
                    [
                        ['label' => 'Amount paid', 'value' => $amount],
                        $bill['payment_date'] ? ['label' => 'Paid on', 'value' => $bill['payment_date']] : null,
                        ['label' => 'Method', 'value' => $bill['method_label']],
                        $bill['reference'] ? ['label' => 'Reference', 'value' => $bill['reference']] : null,
                    ],
                ))),
                ctaLabel: 'View receipt',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: "Keep this email as your receipt {$bill['receipt_number']}.",
            ),
            'rejected' => new HavenaTransactionalMail(
                subjectLine: "Action needed: payment proof for {$what} was not accepted",
                preheader: 'Please check the reason and resubmit your proof.',
                eyebrow: 'Action needed',
                heading: 'Please resubmit your proof',
                intro: "{$hello} the admin could not accept your payment proof for {$what}, so the bill is still unpaid.",
                paragraphs: ['Open the bill in the app to upload a clearer proof, or pay online instead.'],
                details: array_values(array_filter(array_merge(
                    [$bill['rejection_reason'] ? ['label' => 'Reason', 'value' => $bill['rejection_reason']] : null],
                    $billDetails,
                ))),
                ctaLabel: 'Resubmit proof',
                ctaUrl: AppUrls::residentLogin(),
            ),
            default => null,
        };

        if (! $mail) {
            return;
        }

        $this->mailer->sendOnce(
            "payment_{$type}_bill_{$kind}",
            "{$type}_bill:{$bill['id']}:{$kind}".$this->eventSuffix($bill, $kind),
            $user->email,
            $mail,
        );
    }

    /** Proof submissions and rejections can repeat; each one is its own email. */
    private function eventSuffix(array $bill, string $kind): string
    {
        return match ($kind) {
            'proof_submitted' => ':'.($bill['proof_submitted_at'] ?? ''),
            'rejected' => ':'.($bill['rejected_at'] ?? ''),
            default => '',
        };
    }

    /**
     * @return list<array{label: string, value: string}>
     */
    private function billDetails(array $bill): array
    {
        return array_values(array_filter([
            ['label' => 'Bill', 'value' => $bill['title']],
            $bill['period'] ? ['label' => 'Period', 'value' => $bill['period']] : null,
            $bill['unit'] ? ['label' => 'Unit', 'value' => $bill['unit']] : null,
            ['label' => 'Community', 'value' => $bill['community']],
            ['label' => 'Amount', 'value' => $bill['amount_label']],
            ['label' => 'Due date', 'value' => $bill['due_label']],
        ]));
    }

    /** @return array<string, mixed>|null */
    private function loadUnitBill(int $billId): ?array
    {
        $row = DB::table('unit_service_bills as b')
            ->leftJoin('property_services as s', 's.id', '=', 'b.service_id')
            ->leftJoin('units as u', 'u.id', '=', 'b.unit_id')
            ->leftJoin('communities as c', 'c.id', '=', 'b.community_id')
            ->where('b.id', $billId)
            ->select('b.*', 's.name as service_name', 'u.unit_number', 'c.name as community_name')
            ->first();
        if (! $row || empty($row->billing_contact_user_id)) {
            return null;
        }

        return $this->normalise(self::UNIT, $row, (int) $row->billing_contact_user_id, [
            'service' => $row->service_name ?: ($row->title ?: 'Service bill'),
            'title' => $row->title ?: ($row->service_name ?: 'Service bill'),
            'period' => $row->billing_period ? $this->periodLabel((string) $row->billing_period) : null,
            'unit' => $row->unit_number ?? null,
            'payable_type' => PaymentAttempt::PAYABLE_SERVICE_BILL,
        ]);
    }

    /** @return array<string, mixed>|null */
    private function loadAmenityBill(int $residentBillId): ?array
    {
        $row = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->leftJoin('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->leftJoin('communities as c', 'c.id', '=', 'rb.community_id')
            ->where('rb.id', $residentBillId)
            ->select('rb.*', 'mb.title', 'mb.billing_month', 'mb.due_date', 'a.name as amenity_name', 'c.name as community_name')
            ->first();
        if (! $row) {
            return null;
        }

        return $this->normalise(self::AMENITY, $row, (int) $row->user_id, [
            'service' => $row->amenity_name ?: ($row->title ?: 'Amenity'),
            'title' => $row->title ?: ($row->amenity_name ?: 'Amenity bill'),
            'period' => $row->billing_month ? Carbon::parse((string) $row->billing_month)->format('F Y') : null,
            'unit' => null,
            'payable_type' => PaymentAttempt::PAYABLE_AMENITY_BILL,
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>|null
     */
    private function normalise(string $type, object $row, int $userId, array $extra): ?array
    {
        $user = User::query()->find($userId);
        if (! $user) {
            return null;
        }

        $code = $this->currency->forCommunityId((int) $row->community_id);
        $prefix = $type === self::UNIT ? 'UB' : 'AB';
        $number = str_pad((string) $row->id, 6, '0', STR_PAD_LEFT);
        $method = (string) ($row->payment_method ?? '');
        $online = app(OnlinePaymentPresenter::class)->forPayable($extra['payable_type'], (int) $row->id, (int) $row->community_id);

        return array_merge($extra, [
            'id' => (int) $row->id,
            'user' => $user,
            'community' => $row->community_name ?: 'your community',
            'amount_label' => Currency::format((float) ($row->amount ?? 0), $code),
            'due_label' => ! empty($row->due_date) ? Carbon::parse((string) $row->due_date)->format('j M Y') : 'the due date',
            'period_phrase' => $extra['period'] ? $extra['period'].' ' : '',
            'invoice_number' => "INV-{$prefix}-{$number}",
            'receipt_number' => "RCP-{$prefix}-{$number}",
            'payment_date' => ! empty($row->payment_date) ? Carbon::parse((string) $row->payment_date)->format('j M Y') : null,
            'reference' => $row->payment_reference ?? null,
            'rejection_reason' => $row->rejection_reason ?? null,
            'proof_submitted_at' => $row->proof_submitted_at ?? null,
            'rejected_at' => $row->rejected_at ?? null,
            'method_label' => match ($method) {
                'kuickpay' => 'Online (KuickPay)',
                'bank_ach' => 'Bank transfer',
                default => 'Payment proof, verified by admin',
            },
            'online' => (bool) ($online['available'] ?? false),
        ]);
    }

    private function periodLabel(string $period): string
    {
        try {
            return Carbon::parse(strlen($period) === 7 ? $period.'-01' : $period)->format('F Y');
        } catch (\Throwable) {
            return $period;
        }
    }

    // ── Online (KuickPay) ────────────────────────────────────────

    private function sendOnlineMail(PaymentAttempt $attempt, string $kind): void
    {
        $user = $attempt->user;
        if (! $user) {
            return;
        }

        $view = app(OnlinePaymentPresenter::class)->attempt($attempt);
        $receipt = (array) ($view['receipt'] ?? []);
        $amount = $attempt->formattedAmount();
        $hello = $this->greeting($user);
        $details = array_values(array_filter([
            ['label' => 'Bill', 'value' => (string) $attempt->title],
            filled($attempt->subtitle) ? ['label' => 'Details', 'value' => (string) $attempt->subtitle] : null,
            ['label' => 'Amount', 'value' => $amount],
            filled($receipt['paid_to'] ?? null) ? ['label' => 'Paid to', 'value' => (string) $receipt['paid_to']] : null,
            filled($receipt['method_label'] ?? null) ? ['label' => 'Method', 'value' => (string) $receipt['method_label']] : null,
            ['label' => 'Reference', 'value' => (string) $attempt->reference],
            filled($receipt['transaction_id'] ?? null) ? ['label' => 'Transaction ID', 'value' => (string) $receipt['transaction_id']] : null,
            $attempt->confirmed_at ? ['label' => 'Paid on', 'value' => $attempt->confirmed_at->format('j M Y, g:i A')] : null,
        ]));

        $mail = match ($kind) {
            'succeeded' => new HavenaTransactionalMail(
                subjectLine: "Payment successful · {$amount} for {$attempt->title}",
                preheader: "Reference {$attempt->reference}. Your receipt is inside.",
                eyebrow: 'Payment successful',
                heading: "You paid {$amount}",
                intro: "{$hello} your payment for {$attempt->title} went through. Thank you!",
                paragraphs: ['Keep this email as your receipt. You can also save or share it from Payment history in the Havena app.'],
                details: $details,
                ctaLabel: 'View receipt',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: $attempt->simulated ? 'This was a test-mode payment. No real money moved.' : null,
            ),
            'refund_pending' => new HavenaTransactionalMail(
                subjectLine: "Your {$amount} payment will be refunded",
                preheader: 'Your bill is still unpaid.',
                eyebrow: 'Refund on the way',
                heading: 'We are refunding your payment',
                intro: "{$hello} ".trim((string) $attempt->failure_message)." Your {$amount} will be returned to your account and the bill is still unpaid.",
                details: $details,
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'refunded' => new HavenaTransactionalMail(
                subjectLine: "Refund completed · {$amount}",
                preheader: "Your refund for {$attempt->title} is complete.",
                eyebrow: 'Refund completed',
                heading: "{$amount} refunded",
                intro: "{$hello} the refund for {$attempt->title} has been completed.",
                details: $details,
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
            default => null,
        };

        if ($mail) {
            $this->mailer->sendOnce("payment_online_{$kind}", "payment_attempt:{$attempt->id}:{$kind}", $user->email, $mail);
        }
    }

    // ── Bank (Plaid ACH) ─────────────────────────────────────────

    private function sendBankMail(PlaidTransfer $transfer, string $kind): void
    {
        $user = $transfer->user;
        if (! $user) {
            return;
        }

        $amount = '$'.number_format((float) $transfer->amount, 2);
        $what = $transfer->purposeLabel();
        $hello = $this->greeting($user);
        $details = array_values(array_filter([
            ['label' => 'Payment', 'value' => $what],
            ['label' => 'Amount', 'value' => $amount],
            $transfer->source_account_mask ? ['label' => 'From account', 'value' => '•••• '.$transfer->source_account_mask] : null,
            ['label' => 'Reference', 'value' => (string) $transfer->public_id],
            $transfer->return_code ? ['label' => 'Bank return code', 'value' => (string) $transfer->return_code] : null,
        ]));

        $mail = match ($kind) {
            'paid' => new HavenaTransactionalMail(
                subjectLine: "Bank payment sent · {$amount} for {$what}",
                preheader: 'Your bank payment was submitted.',
                eyebrow: 'Bank payment sent',
                heading: "{$amount} sent from your bank",
                intro: "{$hello} your bank payment for {$what} was submitted. ACH payments can still be returned by your bank; we will email you if that happens.",
                details: $details,
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'returned' => new HavenaTransactionalMail(
                subjectLine: "Action needed: your bank returned {$amount}",
                preheader: "{$what} is unpaid again.",
                eyebrow: 'Bank payment returned',
                heading: 'Your bank returned this payment',
                intro: "{$hello} your bank returned the {$amount} payment for {$what}, so the charge is unpaid again.",
                paragraphs: ['Check your account balance or details, then pay again from the Havena app.'],
                details: $details,
                ctaLabel: 'Pay again',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'failed' => new HavenaTransactionalMail(
                subjectLine: "Bank payment failed · {$what}",
                preheader: 'No money was taken.',
                eyebrow: 'Bank payment failed',
                heading: 'This bank payment did not go through',
                intro: "{$hello} ".($transfer->failure_message ?: 'your bank payment could not be completed.'),
                details: $details,
                ctaLabel: 'Try again',
                ctaUrl: AppUrls::residentLogin(),
            ),
            'refunded' => new HavenaTransactionalMail(
                subjectLine: "Refund sent · {$amount}",
                preheader: "Your refund for {$what} has been sent to your bank.",
                eyebrow: 'Refund sent',
                heading: "{$amount} refunded",
                intro: "{$hello} your refund for {$what} has been sent to your bank.",
                details: $details,
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
            default => null,
        };

        if ($mail) {
            $this->mailer->sendOnce("payment_bank_{$kind}", "plaid_transfer:{$transfer->id}:{$kind}", $user->email, $mail);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    private function greeting(User $user): string
    {
        $first = trim(strtok(trim((string) $user->name), ' ') ?: '');

        return $first !== '' ? "Hi {$first}," : 'Hi,';
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function guard(callable $send, array $context): void
    {
        try {
            $send();
        } catch (\Throwable $e) {
            Log::warning('Payment email skipped', $context + ['error' => $e->getMessage()]);
        }
    }
}
