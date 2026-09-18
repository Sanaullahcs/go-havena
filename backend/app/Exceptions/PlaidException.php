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

    public static function linkTokenFailed(string $message = 'Unable to create Plaid link token.'): self
    {
        return new self(
            $message,
            'PLAID_LINK_TOKEN_FAILED',
            502,
        );
    }

    public static function exchangeFailed(string $message = 'Unable to connect bank account with Plaid.'): self
    {
        return new self(
            $message,
            'PLAID_EXCHANGE_FAILED',
            422,
        );
    }

    public static function alreadyConnected(): self
    {
        return new self(
            'This community already has a connected bank account.',
            'PLAID_ALREADY_CONNECTED',
            409,
        );
    }

    public static function noManagedCommunity(): self
    {
        return new self(
            'No managed community found for this community admin account.',
            'PLAID_NO_COMMUNITY',
            422,
        );
    }

    public static function notAvailable(): self
    {
        return new self(
            'Plaid bank linking is not available for this community.',
            'PLAID_NOT_AVAILABLE',
            403,
        );
    }

    public static function notConnected(): self
    {
        return new self(
            'This community does not have a Plaid bank connection.',
            'PLAID_NOT_CONNECTED',
            404,
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
