<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use ChkltLabs\Plaid\Plaid;

class PlaidService
{
    private const ALLOWED_ENVIRONMENTS = ['sandbox', 'development', 'production'];

    private ?Plaid $client = null;

    public function configured(): bool
    {
        return filled(config('plaid.client_id'))
            && filled(config('plaid.secret'))
            && $this->environmentValid();
    }

    public function environment(): string
    {
        return (string) config('plaid.environment', 'sandbox');
    }

    public function assertConfigured(): void
    {
        if (! filled(config('plaid.client_id'))) {
            throw PlaidException::notConfigured('PLAID_CLIENT_ID');
        }

        if (! filled(config('plaid.secret'))) {
            throw PlaidException::notConfigured('PLAID_SECRET');
        }

        if (! $this->environmentValid()) {
            throw PlaidException::invalidEnvironment($this->environment());
        }
    }

    public function client(): Plaid
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $this->assertConfigured();

        $this->client = new Plaid(
            (string) config('plaid.client_id'),
            (string) config('plaid.secret'),
            $this->environment(),
        );

        return $this->client;
    }

    protected function environmentValid(): bool
    {
        return in_array($this->environment(), self::ALLOWED_ENVIRONMENTS, true);
    }
}
