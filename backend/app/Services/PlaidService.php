<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\User;
use ChkltLabs\Plaid\Entities\User as PlaidUser;
use ChkltLabs\Plaid\Plaid;
use ChkltLabs\Plaid\PlaidRequestException;
use Illuminate\Support\Facades\Log;

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

    /**
     * Create a Plaid Link token for the authenticated community admin.
     *
     * @return array{link_token: string, expiration: string}
     */
    public function createLinkToken(User $user): array
    {
        $this->assertConfigured();

        $plaidUser = new PlaidUser((string) $user->id);

        try {
            $response = $this->client()->tokens->create(
                (string) config('plaid.link.client_name', 'GoHavena'),
                (string) config('plaid.link.language', 'en'),
                config('plaid.link.country_codes', ['US']),
                $plaidUser,
                config('plaid.link.products', ['auth']),
            );
        } catch (PlaidRequestException $e) {
            $plaidError = $e->getResponse();

            Log::warning('Plaid link token creation failed', [
                'user_id' => $user->id,
                'plaid_error_type' => is_object($plaidError) ? ($plaidError->error_type ?? null) : null,
                'plaid_error_code' => is_object($plaidError) ? ($plaidError->error_code ?? null) : null,
            ]);

            $message = is_object($plaidError) && filled($plaidError->display_message ?? null)
                ? (string) $plaidError->display_message
                : 'Unable to create Plaid link token.';

            throw PlaidException::linkTokenFailed($message);
        }

        return [
            'link_token' => (string) ($response->link_token ?? ''),
            'expiration' => (string) ($response->expiration ?? ''),
        ];
    }

    protected function environmentValid(): bool
    {
        return in_array($this->environment(), self::ALLOWED_ENVIRONMENTS, true);
    }
}
