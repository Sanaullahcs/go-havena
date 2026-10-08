<?php

namespace App\Services\Kuickpay;

final class CheckoutSession
{
    public function __construct(
        public readonly string $sessionId,
        public readonly string $redirectUrl,
        public readonly bool $simulated,
    ) {
    }
}
