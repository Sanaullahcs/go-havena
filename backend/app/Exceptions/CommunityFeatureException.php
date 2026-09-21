<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

class CommunityFeatureException extends Exception
{
    public function __construct(
        string $message,
        public readonly string $codeKey = 'COMMUNITY_FEATURE_DISABLED',
        public readonly int $status = 403,
        public readonly array $meta = [],
    ) {
        parent::__construct($message);
    }

    public static function disabled(string $featureKey, string $label): self
    {
        return new self(
            "{$label} is not available in this community.",
            'COMMUNITY_FEATURE_DISABLED',
            403,
            ['feature' => $featureKey],
        );
    }

    public static function forbidden(): self
    {
        return new self(
            'You do not have permission to manage resident features for this community.',
            'COMMUNITY_FEATURE_FORBIDDEN',
            403,
        );
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->codeKey,
            'meta' => $this->meta ?: (object) [],
        ], $this->status);
    }
}
