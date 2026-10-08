<?php

namespace App\Services\Kuickpay;

use Illuminate\Support\Carbon;

final class BillInquiryResult
{
    public const FOUND = 'found';

    public const NOT_FOUND = 'not_found';

    public const BLOCKED = 'blocked';

    public const PAID = 'paid';

    /** Provider failed or timed out; nothing about the bill is known. */
    public const ERROR = 'error';

    public function __construct(
        public readonly string $outcome,
        public readonly ?string $responseCode = null,
        public readonly ?string $consumerName = null,
        public readonly ?string $billingMonth = null,
        public readonly ?int $amountWithinDuePaisa = null,
        public readonly ?int $amountAfterDuePaisa = null,
        public readonly ?Carbon $dueDate = null,
        public readonly ?string $tranAuthId = null,
        public readonly ?int $amountPaidPaisa = null,
        public readonly ?Carbon $datePaid = null,
        public readonly ?string $message = null,
    ) {
    }

    public function isFound(): bool
    {
        return in_array($this->outcome, [self::FOUND, self::PAID], true);
    }
}
