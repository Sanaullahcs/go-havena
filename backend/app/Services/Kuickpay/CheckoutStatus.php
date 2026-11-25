<?php

namespace App\Services\Kuickpay;

final class CheckoutStatus
{
    public const SUCCESS = 'SUCCESS';

    public const FAILED = 'FAILED';

    public const CANCELLED = 'CANCELLED';

    /** KuickPay has no result yet; the resident may still be on the payment page. */
    public const PENDING = 'PENDING';

    public function __construct(
        public readonly string $status,
        public readonly ?string $transactionId = null,
        public readonly ?int $amountPaisa = null,
        public readonly ?string $responseCode = null,
        public readonly ?string $method = null,
    ) {
    }
}
