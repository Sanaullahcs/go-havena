<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use ChkltLabs\Plaid\Entities\User as PlaidUser;
use ChkltLabs\Plaid\PlaidRequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PlaidResidentService
{
    public function __construct(
        private readonly PlaidService $plaid,
        private readonly PlaidEligibilityService $eligibility,
    ) {
    }

    public function resolveCommunityId(User $user, ?int $communityId = null, bool $requireEligible = true): int
    {
        $query = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved');

        if ($communityId) {
            $query->where('community_id', $communityId);
        } else {
            $current = UserActingContextService::currentCommunityId($user);
            if ($current) {
                $query->where('community_id', $current);
            }
        }

        $membership = $query->orderBy('created_at')->first();
        if (! $membership) {
            throw PlaidException::noManagedCommunity();
        }

        $resolved = (int) $membership->community_id;
        if ($requireEligible) {
            $this->eligibility->assertCommunityEligible($resolved);
        }

        return $resolved;
    }

    /**
     * @return array<string, mixed>
     */
    public function getConnection(User $user, ?int $communityId = null): array
    {
        $communityId = $this->resolveCommunityId($user, $communityId);
        $connection = $this->findConnection($user->id, $communityId);

        if (! $connection) {
            return [
                'connected' => false,
                'status' => 'not_connected',
                'needs_reconnect' => false,
                'plaid_available' => true,
                'environment' => $this->plaid->environment(),
            ];
        }

        return $this->decorate($connection);
    }

    /**
     * @return array{link_token: string, expiration: string, mode: string}
     */
    public function createLinkToken(User $user, string $mode = 'create', ?int $communityId = null): array
    {
        $communityId = $this->resolveCommunityId($user, $communityId);
        $this->plaid->assertConfigured();

        $connection = $this->findConnection($user->id, $communityId);
        $updateMode = $mode === 'update' && $connection?->hasAccessToken();
        $webhook = $this->webhookUrl();
        $products = $updateMode ? null : config('plaid.link.resident_products', ['auth', 'transfer']);
        $accessToken = $updateMode ? $connection->plaid_access_token : null;

        try {
            $response = $this->plaid->client()->tokens->create(
                (string) config('plaid.link.client_name', 'GoHavena'),
                (string) config('plaid.link.language', 'en'),
                config('plaid.link.country_codes', ['US']),
                new PlaidUser((string) $user->id),
                $products,
                [],
                [],
                [],
                $webhook,
                $accessToken,
            );
        } catch (PlaidRequestException $e) {
            if (! $updateMode && is_array($products) && in_array('transfer', $products, true)) {
                return $this->createLinkTokenWithoutTransfer($user, $webhook);
            }

            throw $this->mapLinkFailure($e, $user, $communityId, $updateMode);
        }

        return [
            'link_token' => (string) ($response->link_token ?? ''),
            'expiration' => (string) ($response->expiration ?? ''),
            'mode' => $updateMode ? 'update' : 'create',
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function connect(User $user, string $publicToken, array $options = []): array
    {
        $communityId = $this->resolveCommunityId($user, isset($options['community_id']) ? (int) $options['community_id'] : null);
        $replace = (bool) ($options['replace'] ?? false);
        $connection = $this->findConnection($user->id, $communityId);

        if ($connection?->isConnected() && ! $replace) {
            throw PlaidException::residentAlreadyConnected();
        }

        $this->plaid->assertConfigured();

        $exchange = $this->plaid->exchangePublicToken($publicToken);
        $previousAccessToken = $connection?->hasAccessToken() ? $connection->plaid_access_token : null;
        $institution = $this->plaid->resolveInstitution($exchange['access_token']);
        $account = $this->plaid->selectAccount(
            $exchange['access_token'],
            isset($options['account_id']) ? (string) $options['account_id'] : null,
            is_array($options['account'] ?? null) ? $options['account'] : [],
        );
        $ach = $this->plaid->fetchAchNumbers($exchange['access_token'], $account['account_id'] ?? null);

        $connection ??= new ResidentPlaidConnection([
            'user_id' => $user->id,
            'community_id' => $communityId,
        ]);
        $connection->fill([
            'user_id' => $user->id,
            'community_id' => $communityId,
            'plaid_item_id' => $exchange['item_id'],
            'plaid_access_token' => $exchange['access_token'],
            'institution_id' => $institution['institution_id'] ?? ($options['institution_id'] ?? null),
            'institution_name' => $institution['institution_name'] ?? ($options['institution_name'] ?? null),
            'account_id' => $account['account_id'],
            'account_name' => $account['account_name'],
            'account_official_name' => $account['account_official_name'],
            'account_type' => $account['account_type'],
            'account_subtype' => $account['account_subtype'],
            'account_mask' => $account['account_mask'],
            'ach_account' => $ach['account'] ?? null,
            'ach_routing' => $ach['routing'] ?? null,
            'status' => ResidentPlaidConnection::STATUS_CONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => null,
        ]);
        $connection->save();

        if ($previousAccessToken && $previousAccessToken !== $exchange['access_token']) {
            $this->plaid->removeItemQuietlyPublic($previousAccessToken);
        }

        $this->logAction(
            $replace ? 'plaid_resident_bank_replaced' : 'plaid_resident_bank_connected',
            $this->actorName($user).($replace ? ' replaced their bank' : ' connected a bank').' for community #'.$communityId,
            $user,
            $communityId,
            $connection,
        );

        return $this->decorate($connection);
    }

    /**
     * @return array<string, mixed>
     */
    public function completeReconnect(User $user, ?int $communityId = null): array
    {
        $communityId = $this->resolveCommunityId($user, $communityId);
        $this->plaid->assertConfigured();

        $connection = $this->findConnection($user->id, $communityId);
        if (! $connection || ! $connection->hasAccessToken()) {
            throw PlaidException::residentNotConnected();
        }

        $institution = $this->plaid->resolveInstitution($connection->plaid_access_token);
        $account = $this->plaid->selectAccount($connection->plaid_access_token, $connection->account_id, []);
        $ach = $this->plaid->fetchAchNumbers($connection->plaid_access_token, $account['account_id'] ?? $connection->account_id);

        $connection->fill([
            'institution_id' => $institution['institution_id'] ?: $connection->institution_id,
            'institution_name' => $institution['institution_name'] ?: $connection->institution_name,
            'account_id' => $account['account_id'] ?: $connection->account_id,
            'account_name' => $account['account_name'] ?: $connection->account_name,
            'account_official_name' => $account['account_official_name'] ?: $connection->account_official_name,
            'account_type' => $account['account_type'] ?: $connection->account_type,
            'account_subtype' => $account['account_subtype'] ?: $connection->account_subtype,
            'account_mask' => $account['account_mask'] ?: $connection->account_mask,
            'ach_account' => $ach['account'] ?? $connection->ach_account,
            'ach_routing' => $ach['routing'] ?? $connection->ach_routing,
            'status' => ResidentPlaidConnection::STATUS_CONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => null,
        ]);
        $connection->save();

        $this->logAction(
            'plaid_resident_reconnected',
            $this->actorName($user).' reconnected their bank for community #'.$communityId,
            $user,
            $communityId,
            $connection,
        );

        return $this->decorate($connection);
    }

    /**
     * @return array<string, mixed>
     */
    public function disconnect(User $user, ?int $communityId = null): array
    {
        $communityId = $this->resolveCommunityId($user, $communityId);
        $connection = $this->findConnection($user->id, $communityId);
        if (! $connection) {
            throw PlaidException::residentNotConnected();
        }

        if ($connection->hasAccessToken() && $this->plaid->configured()) {
            $this->plaid->removeItemQuietlyPublic($connection->plaid_access_token);
        }

        $connection->fill([
            'plaid_access_token' => '',
            'account_id' => null,
            'ach_account' => null,
            'ach_routing' => null,
            'status' => ResidentPlaidConnection::STATUS_DISCONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => now(),
        ]);
        $connection->save();

        $this->logAction(
            'plaid_resident_bank_disconnected',
            $this->actorName($user).' disconnected their bank',
            $user,
            $communityId,
            $connection,
        );

        return $this->decorate($connection);
    }

    public function findActive(int $userId, int $communityId): ?ResidentPlaidConnection
    {
        $connection = $this->findConnection($userId, $communityId);

        return $connection?->isConnected() ? $connection : null;
    }

    public function findByItemId(string $itemId): ?ResidentPlaidConnection
    {
        if ($itemId === '') {
            return null;
        }

        return ResidentPlaidConnection::query()->where('plaid_item_id', $itemId)->first();
    }

    public function applyItemError(ResidentPlaidConnection $connection, string $errorCode, string $errorMessage): void
    {
        $status = ResidentPlaidConnection::STATUS_ERROR;
        if (in_array($errorCode, [
            'ITEM_LOGIN_REQUIRED',
            'PENDING_EXPIRATION',
            'PENDING_DISCONNECT',
        ], true)) {
            $status = ResidentPlaidConnection::STATUS_NEEDS_ATTENTION;
        }

        $connection->status = $status;
        $connection->error_code = $errorCode !== '' ? $errorCode : $connection->error_code;
        $connection->error_message = $errorMessage !== ''
            ? mb_substr($errorMessage, 0, 500)
            : ($connection->error_message ?: 'This bank connection needs attention.');
        $connection->save();
    }

    /**
     * @return array{link_token: string, expiration: string, mode: string}
     */
    protected function createLinkTokenWithoutTransfer(User $user, ?string $webhook): array
    {
        $response = $this->plaid->client()->tokens->create(
            (string) config('plaid.link.client_name', 'GoHavena'),
            (string) config('plaid.link.language', 'en'),
            config('plaid.link.country_codes', ['US']),
            new PlaidUser((string) $user->id),
            ['auth'],
            [],
            [],
            [],
            $webhook,
            null,
        );

        return [
            'link_token' => (string) ($response->link_token ?? ''),
            'expiration' => (string) ($response->expiration ?? ''),
            'mode' => 'create',
        ];
    }

    protected function findConnection(int $userId, int $communityId): ?ResidentPlaidConnection
    {
        return ResidentPlaidConnection::query()
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    protected function decorate(ResidentPlaidConnection $connection): array
    {
        return array_merge($connection->toPublicPayload(), [
            'plaid_available' => true,
            'environment' => $this->plaid->environment(),
        ]);
    }

    protected function mapLinkFailure(
        PlaidRequestException $e,
        User $user,
        int $communityId,
        bool $updateMode,
    ): PlaidException {
        $plaidError = $e->getResponse();

        Log::warning('Resident Plaid link token creation failed', [
            'user_id' => $user->id,
            'community_id' => $communityId,
            'mode' => $updateMode ? 'update' : 'create',
            'plaid_error_code' => is_object($plaidError) ? ($plaidError->error_code ?? null) : null,
        ]);

        $message = is_object($plaidError) && filled($plaidError->display_message ?? null)
            ? (string) $plaidError->display_message
            : 'Unable to create Plaid link token.';

        return PlaidException::linkTokenFailed($message);
    }

    protected function logAction(
        string $action,
        string $description,
        User $user,
        int $communityId,
        ResidentPlaidConnection $connection,
    ): void {
        ActivityLogService::user(
            $action,
            $description,
            Community::class,
            $communityId,
            'info',
            $user->id,
            [
                'community_id' => $communityId,
                'institution_name' => $connection->institution_name,
                'status' => $connection->status,
                'related_item' => $connection->institution_name ?: 'Plaid',
            ],
        );
    }

    protected function actorName(User $user): string
    {
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Resident';
    }

    protected function webhookUrl(): ?string
    {
        $url = trim((string) config('plaid.webhook_url', ''));

        return $url !== '' ? $url : null;
    }
}
