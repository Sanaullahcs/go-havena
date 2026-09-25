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

    public static function residentAlreadyConnected(): self
    {
        return new self(
            'You already have a connected bank account for this community.',
            'PLAID_RESIDENT_ALREADY_CONNECTED',
            409,
        );
    }

    public static function residentNotConnected(): self
    {
        return new self(
            'Connect a bank account before paying with ACH.',
            'PLAID_RESIDENT_NOT_CONNECTED',
            422,
        );
    }

    public static function communityBankRequired(): self
    {
        return new self(
            'This community has not connected a receiving bank yet. Upload payment proof instead.',
            'PLAID_COMMUNITY_BANK_REQUIRED',
            422,
        );
    }

    public static function transferFailed(string $message = 'Unable to send this bank payment.'): self
    {
        return new self($message, 'PLAID_TRANSFER_FAILED', 422);
    }

    public static function transferInProgress(): self
    {
        return new self(
            'A bank payment for this charge is already in progress.',
            'PLAID_TRANSFER_IN_PROGRESS',
            409,
        );
    }

    public static function paymentAlreadySettled(): self
    {
        return new self(
            'This charge has already been paid by bank transfer.',
            'PLAID_PAYMENT_SETTLED',
            409,
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
