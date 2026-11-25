<?php

namespace App\Services\Kuickpay;

final class BillPaymentResult
{
    public const SUCCESS = 'success';

    /** Biller refused the payment outright; nothing was settled. */
    public const REJECTED = 'rejected';

    /** Bill was already settled before this request. */
    public const ALREADY_PAID = 'already_paid';

    /** Timeout or "05": the payment may or may not have gone through. Never retry blindly. */
    public const UNKNOWN = 'unknown';

    public function __construct(
        public readonly string $outcome,
        public readonly ?string $responseCode = null,
        public readonly ?string $receiptId = null,
        public readonly ?string $tranAuthId = null,
        public readonly ?string $message = null,
    ) {
    }
}
