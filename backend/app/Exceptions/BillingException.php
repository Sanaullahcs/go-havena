<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

class BillingException extends Exception
{
    public function __construct(
        string $message,
        public readonly string $codeKey = 'BILLING_ERROR',
        public readonly int $status = 422,
        public readonly array $meta = [],
    ) {
        parent::__construct($message);
    }

    public static function subscriptionRequired(): self
    {
        return new self(
            'An active community subscription is required before inviting or approving residents.',
            'SUBSCRIPTION_REQUIRED',
            402,
        );
    }

    public static function subscriptionInactive(string $status): self
    {
        return new self(
            'Your community subscription is not active. Update billing to continue adding residents.',
            'SUBSCRIPTION_INACTIVE',
            402,
            ['subscription_status' => $status],
        );
    }

    public static function seatsFull(int $used, int $limit): self
    {
        return new self(
            "All seats are in use ({$used}/{$limit}). Upgrade your plan or add more seats.",
            'SEATS_FULL',
            422,
            ['seats_used' => $used, 'seat_limit' => $limit],
        );
    }

    public static function downgradeBlocked(int $used, int $limit): self
    {
        return new self(
            "Cannot switch to this plan: you have {$used} residents but the plan only allows {$limit} seats.",
            'DOWNGRADE_BLOCKED',
            422,
            ['seats_used' => $used, 'seat_limit' => $limit],
        );
    }

    public static function stripeNotConfigured(): self
    {
        return new self(
            'Stripe billing is not configured. Use test-mode API keys (pk_test_/sk_test_) in your environment.',
            'STRIPE_NOT_CONFIGURED',
            503,
        );
    }

    public static function cardRequired(): self
    {
        return new self(
            'Add a card to continue. Your 30-day free trial starts after approval, and you are not charged until that trial ends.',
            'CARD_REQUIRED',
            422,
        );
    }

    public static function stripePriceMissing(): self
    {
        return new self(
            'This plan has no Stripe price yet. Ask a system admin to publish prices in Billing & Plans.',
            'STRIPE_PRICE_MISSING',
            503,
        );
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->codeKey,
            ...($this->meta ? ['meta' => $this->meta] : []),
        ], $this->status);
    }
}
