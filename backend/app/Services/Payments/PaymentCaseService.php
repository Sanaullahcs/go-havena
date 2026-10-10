<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use App\Models\PaymentCase;
use App\Models\User;
use App\Services\Kuickpay\KuickpayException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Opens and closes dispute, refund, and reversal records. Money moves only when an admin records an external KuickPay outcome. */
class PaymentCaseService
{
    public function __construct(private readonly PaymentOrchestrator $orchestrator)
    {
    }

    public function open(User $actor, PaymentAttempt $attempt, string $kind, string $reason, ?string $details): PaymentCase
    {
        if (! in_array($kind, PaymentCase::KINDS, true)) {
            throw new KuickpayException('invalid_case', 'Choose a dispute, refund request, or reversal.');
        }

        $duplicate = PaymentCase::query()
            ->where('payment_attempt_id', $attempt->id)
            ->where('kind', $kind)
            ->whereIn('status', PaymentCase::OPEN_STATUSES)
            ->exists();
        if ($duplicate) {
            throw new KuickpayException('case_open', 'This payment already has an open '.$this->label($kind).'.');
        }

        return PaymentCase::query()->create([
            'public_id' => (string) Str::uuid(),
            'community_id' => $attempt->community_id,
            'payment_attempt_id' => $attempt->id,
            'payable_type' => $attempt->payable_type,
            'payable_id' => $attempt->payable_id,
            'kind' => $kind,
            'status' => PaymentCase::STATUS_OPEN,
            'reason' => mb_substr($reason, 0, 120),
            'details' => $details !== null && trim($details) !== '' ? mb_substr(trim($details), 0, 2000) : null,
            'amount_paisa' => (int) $attempt->amount_paisa,
            'opened_by' => $actor->id,
        ]);
    }

    /**
     * @return array{case: PaymentCase, payment: PaymentAttempt}
     */
    public function resolve(User $admin, PaymentCase $case, string $decision, ?string $note, bool $reopenBill): array
    {
        if (! $case->isOpen()) {
            throw new KuickpayException('case_closed', 'This case is already closed.');
        }
        if (! in_array($decision, ['needs_information', 'rejected', 'recorded'], true)) {
            throw new KuickpayException('invalid_decision', 'Choose needs information, rejected, or recorded.');
        }

        $note = $note !== null ? trim($note) : '';
        if ($decision === 'recorded' && $note === '') {
            throw new KuickpayException('note_required', 'Enter the KuickPay reference or the reason before recording this outcome.');
        }

        return DB::transaction(function () use ($admin, $case, $decision, $note, $reopenBill) {
            $locked = PaymentCase::query()->whereKey($case->id)->lockForUpdate()->first();
            if (! $locked || ! $locked->isOpen()) {
                throw new KuickpayException('case_closed', 'This case is already closed.');
            }

            $attempt = PaymentAttempt::query()->whereKey($locked->payment_attempt_id)->lockForUpdate()->first();
            abort_if(! $attempt, 404, 'Payment not found.');

            $reopened = false;
            if ($decision === 'recorded' && $locked->kind === PaymentCase::KIND_REFUND) {
                $attempt = $this->orchestrator->recordExternalRefund($attempt, $admin, $note);
            } elseif ($decision === 'recorded' && $locked->kind === PaymentCase::KIND_REVERSAL) {
                $attempt = $this->orchestrator->recordExternalReversal($attempt, $admin, $note, $reopenBill);
                $reopened = $reopenBill;
            }

            $status = match ($decision) {
                'needs_information' => PaymentCase::STATUS_NEEDS_INFORMATION,
                'rejected' => PaymentCase::STATUS_REJECTED,
                default => PaymentCase::STATUS_RECORDED,
            };

            $locked->forceFill([
                'status' => $status,
                'reviewed_by' => $admin->id,
                'resolution_note' => $note !== '' ? mb_substr($note, 0, 2000) : null,
                'reopened_bill' => $reopened,
                'resolved_at' => $decision === 'needs_information' ? null : now(),
            ])->save();

            return ['case' => $locked->refresh(), 'payment' => $attempt->refresh()];
        });
    }

    public function payload(PaymentCase $case): array
    {
        $case->loadMissing(['attempt.user:id,name']);

        return [
            'id' => $case->public_id,
            'kind' => $case->kind,
            'kind_label' => ucfirst($this->label($case->kind)),
            'status' => $case->status,
            'reason' => $case->reason,
            'details' => $case->details,
            'amount' => round(((int) $case->amount_paisa) / 100, 2),
            'resolution_note' => $case->resolution_note,
            'reopened_bill' => (bool) $case->reopened_bill,
            'payment_id' => $case->attempt?->public_id,
            'payment_reference' => $case->attempt?->reference,
            'resident' => $case->attempt?->user?->name,
            'title' => $case->attempt?->title,
            'created_at' => $case->created_at?->toIso8601String(),
            'resolved_at' => $case->resolved_at?->toIso8601String(),
        ];
    }

    private function label(string $kind): string
    {
        return match ($kind) {
            PaymentCase::KIND_REFUND => 'refund request',
            PaymentCase::KIND_REVERSAL => 'reversal',
            default => 'dispute',
        };
    }
}
