<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\CommunityPlaidConnection;
use App\Models\User;
use App\Services\AdminRoleService;
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

    /**
     * Exchange a Plaid public token and persist the community bank connection.
     *
     * @return array{connected: bool, item_id: string, institution_name: string|null, institution_id: string|null}
     */
    public function connectCommunityAccount(User $user, string $publicToken): array
    {
        $this->assertConfigured();

        $communityId = $this->resolveManagedCommunityId($user);

        if (CommunityPlaidConnection::query()
            ->where('community_id', $communityId)
            ->where('status', 'connected')
            ->exists()) {
            throw PlaidException::alreadyConnected();
        }

        $exchange = $this->exchangePublicToken($publicToken);
        $institution = $this->resolveInstitution($exchange['access_token']);

        $connection = CommunityPlaidConnection::query()->create([
            'community_id' => $communityId,
            'connected_by_user_id' => $user->id,
            'plaid_item_id' => $exchange['item_id'],
            'plaid_access_token' => $exchange['access_token'],
            'institution_id' => $institution['institution_id'],
            'institution_name' => $institution['institution_name'],
            'status' => 'connected',
        ]);

        return $connection->toPublicPayload();
    }

    /**
     * Return the current community's Plaid connection, if any.
     *
     * @return array{connected: bool, item_id?: string|null, institution_name?: string|null, institution_id?: string|null, connected_at?: string|null}
     */
    public function getCommunityConnection(User $user): array
    {
        $communityId = $this->resolveManagedCommunityId($user);

        $connection = CommunityPlaidConnection::query()
            ->where('community_id', $communityId)
            ->where('status', 'connected')
            ->first();

        if (! $connection) {
            return ['connected' => false];
        }

        return array_merge($connection->toPublicPayload(), [
            'connected_at' => $connection->created_at?->toIso8601String(),
        ]);
    }

    /**
     * @return array{access_token: string, item_id: string}
     */
    public function exchangePublicToken(string $publicToken): array
    {
        $this->assertConfigured();

        try {
            $response = $this->client()->items->exchangeToken($publicToken);
        } catch (PlaidRequestException $e) {
            throw $this->mapExchangeException($e);
        }

        $accessToken = (string) ($response->access_token ?? '');
        $itemId = (string) ($response->item_id ?? '');

        if ($accessToken === '' || $itemId === '') {
            throw PlaidException::exchangeFailed('Plaid did not return a valid bank connection.');
        }

        return [
            'access_token' => $accessToken,
            'item_id' => $itemId,
        ];
    }

    /**
     * @return array{institution_id: string|null, institution_name: string|null}
     */
    public function resolveInstitution(string $accessToken): array
    {
        try {
            $itemResponse = $this->client()->items->get($accessToken);
            $institutionId = is_object($itemResponse->item ?? null)
                ? (string) ($itemResponse->item->institution_id ?? '')
                : '';

            if ($institutionId === '') {
                return [
                    'institution_id' => null,
                    'institution_name' => null,
                ];
            }

            $institutionResponse = $this->client()->institutions->get(
                $institutionId,
                config('plaid.link.country_codes', ['US']),
            );

            return [
                'institution_id' => $institutionId,
                'institution_name' => isset($institutionResponse->institution->name)
                    ? (string) $institutionResponse->institution->name
                    : null,
            ];
        } catch (PlaidRequestException $e) {
            Log::warning('Plaid institution lookup failed after token exchange', [
                'plaid_error_type' => $e->getResponse()?->error_type ?? null,
                'plaid_error_code' => $e->getResponse()?->error_code ?? null,
            ]);

            return [
                'institution_id' => null,
                'institution_name' => null,
            ];
        }
    }

    protected function resolveManagedCommunityId(User $user): int
    {
        $membership = AdminRoleService::getApprovedAdminMembership($user)
            ?? AdminRoleService::getAdminMembershipIncludingPending($user);

        if (! $membership) {
            throw PlaidException::noManagedCommunity();
        }

        return (int) $membership->community_id;
    }

    protected function mapExchangeException(PlaidRequestException $e): PlaidException
    {
        $plaidError = $e->getResponse();
        $errorCode = is_object($plaidError) ? (string) ($plaidError->error_code ?? '') : '';

        Log::warning('Plaid public token exchange failed', [
            'plaid_error_type' => is_object($plaidError) ? ($plaidError->error_type ?? null) : null,
            'plaid_error_code' => $errorCode !== '' ? $errorCode : null,
        ]);

        $message = is_object($plaidError) && filled($plaidError->display_message ?? null)
            ? (string) $plaidError->display_message
            : 'Unable to connect bank account with Plaid.';

        if (in_array($errorCode, ['INVALID_PUBLIC_TOKEN', 'PUBLIC_TOKEN_EXPIRED'], true)) {
            $message = 'This Plaid connection link expired or is invalid. Start a new connection and try again.';
        }

        return PlaidException::exchangeFailed($message);
    }

    protected function environmentValid(): bool
    {
        return in_array($this->environment(), self::ALLOWED_ENVIRONMENTS, true);
    }
}
