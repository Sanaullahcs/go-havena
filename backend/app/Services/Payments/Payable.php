<?php

namespace App\Services\Payments;

/** A bill Havena can collect online, normalised across bill sources. */
final class Payable
{
    public const STATE_PAYABLE = 'payable';

    public const STATE_PAID = 'paid';

    /** A payment proof is waiting for the community admin; paying again would double-charge. */
    public const STATE_UNDER_REVIEW = 'under_review';

    /** The bill must be acknowledged before it can be paid. */
    public const STATE_NEEDS_ACKNOWLEDGEMENT = 'needs_acknowledgement';

    public const STATE_BLOCKED = 'blocked';

    public const STATE_INACTIVE = 'inactive';

    public function __construct(
        public readonly string $type,
        public readonly int $id,
        public readonly int $communityId,
        public readonly ?int $unitId,
        /** @var list<int> */
        public readonly array $payerIds,
        public readonly string $title,
        public readonly ?string $subtitle,
        public readonly int $amountPaisa,
        public readonly string $state,
        public readonly ?string $dueDate = null,
        public readonly ?string $billingMonth = null,
        public readonly ?string $consumerName = null,
        public readonly ?string $contactNumber = null,
        public readonly ?string $email = null,
        public readonly ?int $amountAfterDuePaisa = null,
    ) {
    }

    public function canBePaidBy(int $userId): bool
    {
        return in_array($userId, $this->payerIds, true);
    }

    public function isPayable(): bool
    {
        return $this->state === self::STATE_PAYABLE && $this->amountPaisa > 0;
    }

    public function blockedMessage(): string
    {
        return match ($this->state) {
            self::STATE_PAID => 'This bill has already been paid.',
            self::STATE_UNDER_REVIEW => 'A payment proof for this bill is being reviewed by your community office.',
            self::STATE_NEEDS_ACKNOWLEDGEMENT => 'Please acknowledge this bill before paying.',
            self::STATE_BLOCKED => 'This bill cannot be paid online. Please contact your community office.',
            default => 'This bill is no longer active.',
        };
    }
}
