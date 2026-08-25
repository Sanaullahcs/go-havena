<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

class PlaidException extends Exception
{
    public function __construct(
        string $message,
        public readonly string $codeKey = 'PLAID_ERROR',
        public readonly int $status = 503,
        public readonly array $meta = [],
    ) {
        parent::__construct($message);
    }

    public static function notConfigured(string $missingVariable): self
    {
        return new self(
            "Plaid is not configured. Set {$missingVariable} in backend/.env.",
            'PLAID_NOT_CONFIGURED',
            503,
            ['missing' => $missingVariable],
        );
    }

    public static function invalidEnvironment(string $environment): self
    {
        return new self(
            'Plaid environment must be sandbox, development, or production.',
            'PLAID_INVALID_ENVIRONMENT',
            503,
            ['environment' => $environment],
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
