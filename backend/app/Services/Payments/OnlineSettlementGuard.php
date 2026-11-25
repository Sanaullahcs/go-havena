<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use Illuminate\Validation\ValidationException;

/** Stops a receipt approval from settling a bill that KuickPay is already paying or has paid. */
class OnlineSettlementGuard
{
    public static function assertManualApprovalAllowed(string $payableType, int $payableId): void
    {
        $settled = PaymentAttempt::query()
            ->where('payable_type', $payableType)
            ->where('payable_id', $payableId)
            ->where('status', PaymentAttempt::STATUS_SUCCEEDED)
            ->exists();

        if ($settled) {
            throw ValidationException::withMessages([
                'bill' => 'This bill was already paid through KuickPay. Do not approve a second payment.',
            ]);
        }

        $active = PaymentAttempt::query()
            ->where('payable_type', $payableType)
            ->where('payable_id', $payableId)
            ->whereIn('status', PaymentAttempt::ACTIVE_STATUSES)
            ->exists();

        if ($active) {
            throw ValidationException::withMessages([
                'bill' => 'A KuickPay payment is still open for this bill. Wait for it to finish before approving a receipt.',
            ]);
        }
    }
}
