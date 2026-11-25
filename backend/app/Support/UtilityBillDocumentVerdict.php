<?php

namespace App\Support;

class UtilityBillDocumentVerdict
{
    public const REJECT = 'reject';

    public const REVIEW = 'review';

    public const LIKELY = 'likely_document';

    public const REJECT_MESSAGE = 'Please upload a valid utility bill or lease document.';

    public function __construct(
        public readonly string $outcome,
        public readonly string $reviewStatus,
        public readonly string $reason,
    ) {}

    public function shouldReject(): bool
    {
        return $this->outcome === self::REJECT;
    }

    public static function reject(string $reason = 'unrelated_content'): self
    {
        return new self(self::REJECT, self::REVIEW, $reason);
    }

    public static function review(string $reason = 'low_confidence'): self
    {
        return new self(self::REVIEW, self::REVIEW, $reason);
    }

    public static function likely(string $reason = 'document_signals'): self
    {
        return new self(self::LIKELY, self::LIKELY, $reason);
    }
}
