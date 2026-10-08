<?php

namespace App\Services\Kuickpay;

use RuntimeException;

/**
 * Resident-safe payment error. `codeKey` is stable for the apps; the message is
 * already worded for residents and never contains provider response codes.
 */
class KuickpayException extends RuntimeException
{
    public function __construct(
        public readonly string $codeKey,
        string $message,
        public readonly int $status = 422,
        public readonly array $context = [],
    ) {
        parent::__construct($message);
    }

    public function render(): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->codeKey,
            'meta' => $this->context ?: (object) [],
        ], $this->status);
    }

    /** Expected business outcomes, not application errors. */
    public function report(): bool
    {
        return true;
    }

    public static function notAvailable(): self
    {
        return new self('payments_unavailable', 'Online payments are not available for this community yet.');
    }

    public static function notYourBill(): self
    {
        return new self('bill_not_found', 'We could not find this bill.', 404);
    }

    public static function alreadyPaid(): self
    {
        return new self('already_paid', 'This bill has already been paid.', 409);
    }

    public static function inProgress(): self
    {
        return new self('payment_in_progress', 'A payment for this bill is already being processed. Please do not pay again.', 409);
    }

    public static function unreachable(): self
    {
        return new self('provider_unavailable', 'KuickPay is not responding right now. You have not been charged. Please try again in a few minutes.', 503);
    }
}
