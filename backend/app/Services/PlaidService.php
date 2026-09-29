<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityPlaidConnection;
use App\Models\ResidentPlaidConnection;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Support\TlsCaBundle;
use ChkltLabs\Plaid\Entities\User as PlaidUser;
use ChkltLabs\Plaid\Plaid;
use ChkltLabs\Plaid\PlaidRequestException;
use Illuminate\Support\Facades\Log;
use Nimbly\Shuttle\Handler\CurlHandler;
use Nimbly\Shuttle\Shuttle;

class PlaidService
{
    private const ALLOWED_ENVIRONMENTS = ['sandbox', 'development', 'production'];

    private const ATTENTION_CODES = [
        'ITEM_LOGIN_REQUIRED',
        'PENDING_EXPIRATION',
        'PENDING_DISCONNECT',
    ];

    private const ERROR_CODES = [
        'USER_PERMISSION_REVOKED',
        'ITEM_NOT_FOUND',
        'INVALID_ACCESS_TOKEN',
        'ITEM_NOT_SUPPORTED',
        'ACCESS_NOT_GRANTED',
    ];

    private ?Plaid $client = null;

    public function __construct(
        private readonly PlaidEligibilityService $eligibility,
    ) {
    }

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

        $curl = [
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        ];
        if (defined('CURL_SSLVERSION_TLSv1_2')) {
            $curl[CURLOPT_SSLVERSION] = CURL_SSLVERSION_TLSv1_2;
        }
        $caBundle = TlsCaBundle::path();
        if ($caBundle) {
            $curl[CURLOPT_CAINFO] = $caBundle;
            $curl[CURLOPT_SSL_VERIFYPEER] = true;
            $curl[CURLOPT_SSL_VERIFYHOST] = 2;
        }
        $this->client->setHttpClient(new Shuttle(
            handler: new CurlHandler($curl),
        ));

        return $this->client;
    }

    /**
     * Create a Plaid Link token for the authenticated community admin.
     *
     * @return array{link_token: string, expiration: string, mode: string}
     */
    public function createLinkToken(User $user, string $mode = 'create'): array
    {
        $communityId = $this->resolveManagedCommunityId($user);
        $this->eligibility->assertCommunityEligible($communityId);
        $this->assertConfigured();

        $connection = $this->findConnection($communityId);
        $updateMode = $mode === 'update'
            && $connection
            && $connection->hasAccessToken();

        $plaidUser = new PlaidUser((string) $user->id);
        $webhook = $this->webhookUrl();
        $products = $updateMode ? null : config('plaid.link.products', ['auth']);
        $accessToken = $updateMode ? $connection->plaid_access_token : null;

        try {
            $response = $this->client()->tokens->create(
                (string) config('plaid.link.client_name', 'GoHavena'),
                (string) config('plaid.link.language', 'en'),
                config('plaid.link.country_codes', ['US']),
                $plaidUser,
                $products,
                [],
                [],
                [],
                $webhook,
                $accessToken,
            );
        } catch (PlaidRequestException $e) {
            $plaidError = $e->getResponse();

            Log::warning('Plaid link token creation failed', [
                'user_id' => $user->id,
                'community_id' => $communityId,
                'mode' => $updateMode ? 'update' : 'create',
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
            'mode' => $updateMode ? 'update' : 'create',
        ];
    }

    /**
     * Exchange a Plaid public token and persist the community bank connection.
     *
     * @param  array{account_id?: string|null, account?: array<string, mixed>, replace?: bool}  $options
     * @return array<string, mixed>
     */
    public function connectCommunityAccount(User $user, string $publicToken, array $options = []): array
    {
        $communityId = $this->resolveManagedCommunityId($user);
        $this->eligibility->assertCommunityEligible($communityId);

        $replace = (bool) ($options['replace'] ?? false);
        $connection = $this->findConnection($communityId);
        $previousStatus = $connection?->status;
        $hadConnectedBank = $connection?->isConnected() === true;
        $previousInstitution = $connection?->institution_name;

        if ($hadConnectedBank && ! $replace) {
            throw PlaidException::alreadyConnected();
        }

        $this->assertConfigured();

        if ($replace && $connection?->hasAccessToken()) {
            $this->removeItemQuietly($connection->plaid_access_token);
        }

        $exchange = $this->exchangePublicToken($publicToken);
        $institution = $this->resolveInstitution($exchange['access_token']);
        $account = $this->resolveSelectedAccount(
            $exchange['access_token'],
            isset($options['account_id']) ? (string) $options['account_id'] : null,
            is_array($options['account'] ?? null) ? $options['account'] : [],
        );
        $ach = $this->fetchAchNumbers($exchange['access_token'], $account['account_id'] ?? null);

        $connection ??= new CommunityPlaidConnection(['community_id' => $communityId]);
        $connection->fill([
            'community_id' => $communityId,
            'connected_by_user_id' => $user->id,
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
            'status' => CommunityPlaidConnection::STATUS_CONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => null,
        ]);
        $connection->save();

        $action = 'plaid_bank_connected';
        $description = $this->actorName($user).' connected a bank for community #'.$communityId;
        if ($hadConnectedBank && $replace) {
            $action = 'plaid_bank_replaced';
            $description = $this->actorName($user).' replaced the community bank connection';
            if ($previousInstitution) {
                $description .= ' ('.$previousInstitution.' → '.($connection->institution_name ?: 'new bank').')';
            }
        } elseif (in_array($previousStatus, [
            CommunityPlaidConnection::STATUS_NEEDS_ATTENTION,
            CommunityPlaidConnection::STATUS_ERROR,
        ], true)) {
            $action = 'plaid_reconnected';
            $description = $this->actorName($user).' completed Plaid reconnection for community #'.$communityId;
        }

        $this->logAction($action, $description, $user, $communityId, $connection);

        return $this->decoratePayload($connection);
    }

    /**
     * After Plaid Link update mode, the existing access token stays valid.
     *
     * @return array<string, mixed>
     */
    public function completeReconnect(User $user): array
    {
        $communityId = $this->resolveManagedCommunityId($user);
        $this->eligibility->assertCommunityEligible($communityId);
        $this->assertConfigured();

        $connection = $this->findConnection($communityId);
        if (! $connection || ! $connection->hasAccessToken()) {
            throw PlaidException::notConnected();
        }

        $this->refreshItemStatus($connection);
        $connection->refresh();

        if ($connection->needsReconnect() && ! $connection->isConnected()) {
            throw PlaidException::exchangeFailed(
                $connection->error_message ?: 'This bank connection still needs attention. Try reconnecting again.'
            );
        }

        $institution = $this->resolveInstitution($connection->plaid_access_token);
        $account = $this->resolveSelectedAccount(
            $connection->plaid_access_token,
            $connection->account_id,
            [],
        );
        $ach = $this->fetchAchNumbers($connection->plaid_access_token, $account['account_id'] ?? $connection->account_id);

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
            'status' => CommunityPlaidConnection::STATUS_CONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => null,
        ]);
        $connection->save();

        $this->logAction(
            'plaid_reconnected',
            $this->actorName($user).' completed Plaid reconnection for community #'.$communityId,
            $user,
            $communityId,
            $connection,
        );

        return $this->decoratePayload($connection);
    }

    /**
     * @return array<string, mixed>
     */
    public function disconnectCommunityAccount(User $user): array
    {
        $communityId = $this->resolveManagedCommunityId($user);
        $this->eligibility->assertCommunityEligible($communityId);

        $connection = $this->findConnection($communityId);
        if (! $connection) {
            throw PlaidException::notConnected();
        }

        if ($connection->hasAccessToken() && $this->configured()) {
            $this->removeItemQuietly($connection->plaid_access_token);
        }

        $connection->fill([
            'plaid_access_token' => '',
            'account_id' => null,
            'ach_account' => null,
            'ach_routing' => null,
            'transfer_access_token' => null,
            'transfer_account_id' => null,
            'status' => CommunityPlaidConnection::STATUS_DISCONNECTED,
            'error_code' => null,
            'error_message' => null,
            'disconnected_at' => now(),
        ]);
        $connection->save();

        $this->logAction(
            'plaid_bank_disconnected',
            $this->actorName($user).' disconnected the community bank',
            $user,
            $communityId,
            $connection,
        );

        return $this->decoratePayload($connection);
    }

    /**
     * Return the current community's Plaid connection, if any.
     *
     * @return array<string, mixed>
     */
    public function getCommunityConnection(User $user): array
    {
        $communityId = $this->resolveManagedCommunityId($user);
        $this->eligibility->assertCommunityEligible($communityId);

        $connection = $this->findConnection($communityId);

        if (! $connection) {
            return [
                'connected' => false,
                'status' => 'not_connected',
                'needs_reconnect' => false,
                'plaid_available' => true,
                'environment' => $this->environment(),
            ];
        }

        return $this->decoratePayload($connection);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function handleWebhook(array $payload): void
    {
        $type = strtoupper((string) ($payload['webhook_type'] ?? ''));
        if (str_starts_with($type, 'TRANSFER')) {
            app(PlaidAchService::class)->handleTransferWebhook($payload);

            return;
        }

        $itemId = (string) ($payload['item_id'] ?? '');
        if ($itemId === '') {
            return;
        }

        $connection = CommunityPlaidConnection::query()
            ->where('plaid_item_id', $itemId)
            ->first();

        if (! $connection) {
            $resident = app(PlaidResidentService::class)->findByItemId($itemId);
            if (! $resident) {
                Log::info('Plaid webhook ignored for unknown item');

                return;
            }

            $this->handleResidentItemWebhook($resident, $payload);

            return;
        }

        $code = strtoupper((string) ($payload['webhook_code'] ?? ''));
        $error = $payload['error'] ?? null;

        $connection->last_webhook_code = $code !== '' ? $code : $connection->last_webhook_code;
        $connection->last_webhook_at = now();

        $errorCode = is_array($error) ? strtoupper((string) ($error['error_code'] ?? '')) : '';
        $errorMessage = is_array($error)
            ? (string) ($error['display_message'] ?? $error['error_message'] ?? '')
            : '';

        $attention = $type === 'ITEM' && (
            in_array($code, ['ERROR', 'ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED'], true)
            || $errorCode !== ''
        );

        if ($attention) {
            $resolvedCode = $errorCode !== '' ? $errorCode : $code;
            $this->applyItemError($connection, $resolvedCode, $errorMessage);
            $this->logWebhookError($connection, $resolvedCode, $errorMessage);
        }

        $connection->save();
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

    public function refreshItemStatus(CommunityPlaidConnection $connection): void
    {
        if (! $connection->hasAccessToken()) {
            return;
        }

        try {
            $itemResponse = $this->client()->items->get($connection->plaid_access_token);
            $error = is_object($itemResponse->item ?? null) ? ($itemResponse->item->error ?? null) : null;
            if (is_object($error) && filled($error->error_code ?? null)) {
                $this->applyItemError(
                    $connection,
                    (string) $error->error_code,
                    (string) ($error->display_message ?? $error->error_message ?? ''),
                );
                $connection->save();
            }
        } catch (PlaidRequestException $e) {
            $plaidError = $e->getResponse();
            $code = is_object($plaidError) ? (string) ($plaidError->error_code ?? '') : '';
            if ($code !== '') {
                $this->applyItemError(
                    $connection,
                    $code,
                    is_object($plaidError) ? (string) ($plaidError->display_message ?? $plaidError->error_message ?? '') : '',
                );
                $connection->save();
            }
        }
    }

    /**
     * Safe status for System Admin community payloads.
     *
     * @return array<string, mixed>
     */
    public function publicStatusForCommunity(?CommunityPlaidConnection $connection): array
    {
        if (! $connection) {
            return [
                'connected' => false,
                'status' => 'not_connected',
                'needs_reconnect' => false,
                'institution_name' => null,
                'account_mask' => null,
                'error_code' => null,
            ];
        }

        return [
            'connected' => $connection->isConnected(),
            'status' => $connection->status ?: CommunityPlaidConnection::STATUS_DISCONNECTED,
            'needs_reconnect' => $connection->needsReconnect(),
            'institution_name' => $connection->institution_name,
            'account_name' => $connection->account_name,
            'account_mask' => $connection->account_mask,
            'error_code' => $connection->error_code,
            'updated_at' => $connection->updated_at?->toIso8601String(),
        ];
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

    protected function findConnection(int $communityId): ?CommunityPlaidConnection
    {
        return CommunityPlaidConnection::query()
            ->where('community_id', $communityId)
            ->first();
    }

    /**
     * @param  array<string, mixed>  $linkAccount
     * @return array{account_id: string|null, account_name: string|null, account_official_name: string|null, account_type: string|null, account_subtype: string|null, account_mask: string|null}
     */
    public function selectAccount(string $accessToken, ?string $accountId, array $linkAccount = []): array
    {
        return $this->resolveSelectedAccount($accessToken, $accountId, $linkAccount);
    }

    public function removeItemQuietlyPublic(?string $accessToken): void
    {
        $this->removeItemQuietly($accessToken);
    }

    /**
     * @return array{account: string|null, routing: string|null}
     */
    public function fetchAchNumbers(string $accessToken, ?string $accountId = null): array
    {
        if (! filled($accessToken)) {
            return ['account' => null, 'routing' => null];
        }

        try {
            $payload = app(PlaidHttpClient::class)->post('/auth/get', [
                'access_token' => $accessToken,
            ]);
        } catch (\Throwable $e) {
            Log::info('Plaid Auth numbers lookup skipped', ['error' => $e->getMessage()]);

            return ['account' => null, 'routing' => null];
        }

        $numbers = is_array($payload['numbers']['ach'] ?? null) ? $payload['numbers']['ach'] : [];
        $selected = null;
        foreach ($numbers as $row) {
            if (! is_array($row)) {
                continue;
            }
            if ($accountId && ($row['account_id'] ?? null) === $accountId) {
                $selected = $row;
                break;
            }
            $selected ??= $row;
        }

        return [
            'account' => isset($selected['account']) ? (string) $selected['account'] : null,
            'routing' => isset($selected['routing']) ? (string) $selected['routing'] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function handleResidentItemWebhook(ResidentPlaidConnection $connection, array $payload): void
    {
        $type = strtoupper((string) ($payload['webhook_type'] ?? ''));
        $code = strtoupper((string) ($payload['webhook_code'] ?? ''));
        $error = $payload['error'] ?? null;

        $connection->last_webhook_code = $code !== '' ? $code : $connection->last_webhook_code;
        $connection->last_webhook_at = now();

        $errorCode = is_array($error) ? strtoupper((string) ($error['error_code'] ?? '')) : '';
        $errorMessage = is_array($error)
            ? (string) ($error['display_message'] ?? $error['error_message'] ?? '')
            : '';

        $attention = $type === 'ITEM' && (
            in_array($code, ['ERROR', 'ITEM_LOGIN_REQUIRED', 'PENDING_EXPIRATION', 'PENDING_DISCONNECT', 'USER_PERMISSION_REVOKED'], true)
            || $errorCode !== ''
        );

        if ($attention) {
            app(PlaidResidentService::class)->applyItemError(
                $connection,
                $errorCode !== '' ? $errorCode : $code,
                $errorMessage,
            );

            return;
        }

        $connection->save();
    }

    /**
     * @param  array<string, mixed>  $linkAccount
     * @return array{account_id: string|null, account_name: string|null, account_official_name: string|null, account_type: string|null, account_subtype: string|null, account_mask: string|null}
     */
    protected function resolveSelectedAccount(string $accessToken, ?string $accountId, array $linkAccount): array
    {
        $fromAuth = $this->fetchAuthAccounts($accessToken);
        $selected = null;

        if ($accountId) {
            foreach ($fromAuth as $account) {
                if (($account['account_id'] ?? null) === $accountId) {
                    $selected = $account;
                    break;
                }
            }
        }

        if ($selected === null) {
            foreach ($fromAuth as $account) {
                if (($account['account_type'] ?? '') === 'depository') {
                    $selected = $account;
                    break;
                }
            }
        }

        $selected ??= $fromAuth[0] ?? $this->sanitizeAccount($linkAccount);

        if ($selected && $linkAccount) {
            $fallback = $this->sanitizeAccount($linkAccount);
            foreach ($selected as $key => $value) {
                if (! filled($value) && filled($fallback[$key] ?? null)) {
                    $selected[$key] = $fallback[$key];
                }
            }
        }

        return $selected ?? $this->emptyAccount();
    }

    /**
     * @return list<array{account_id: string|null, account_name: string|null, account_official_name: string|null, account_type: string|null, account_subtype: string|null, account_mask: string|null}>
     */
    protected function fetchAuthAccounts(string $accessToken): array
    {
        try {
            $response = $this->client()->auth->get($accessToken);
        } catch (PlaidRequestException $e) {
            Log::warning('Plaid Auth get failed', [
                'plaid_error_type' => $e->getResponse()?->error_type ?? null,
                'plaid_error_code' => $e->getResponse()?->error_code ?? null,
            ]);

            return [];
        }

        $accounts = [];
        foreach ($response->accounts ?? [] as $account) {
            $accounts[] = $this->sanitizeAccount([
                'account_id' => is_object($account) ? ($account->account_id ?? null) : ($account['account_id'] ?? null),
                'id' => is_object($account) ? ($account->account_id ?? null) : ($account['id'] ?? null),
                'name' => is_object($account) ? ($account->name ?? null) : ($account['name'] ?? null),
                'official_name' => is_object($account) ? ($account->official_name ?? null) : ($account['official_name'] ?? null),
                'type' => is_object($account) ? ($account->type ?? null) : ($account['type'] ?? null),
                'subtype' => is_object($account) ? ($account->subtype ?? null) : ($account['subtype'] ?? null),
                'mask' => is_object($account) ? ($account->mask ?? null) : ($account['mask'] ?? null),
            ]);
        }

        return $accounts;
    }

    /**
     * @param  array<string, mixed>  $account
     * @return array{account_id: string|null, account_name: string|null, account_official_name: string|null, account_type: string|null, account_subtype: string|null, account_mask: string|null}
     */
    protected function sanitizeAccount(array $account): array
    {
        $mask = isset($account['mask']) ? preg_replace('/\D+/', '', (string) $account['mask']) : '';
        if (is_string($mask) && strlen($mask) > 4) {
            $mask = substr($mask, -4);
        }

        return [
            'account_id' => $this->nullableString($account['account_id'] ?? $account['id'] ?? null, 128),
            'account_name' => $this->nullableString($account['name'] ?? $account['account_name'] ?? null, 120),
            'account_official_name' => $this->nullableString($account['official_name'] ?? $account['account_official_name'] ?? null, 160),
            'account_type' => $this->nullableString($account['type'] ?? $account['account_type'] ?? null, 40),
            'account_subtype' => $this->nullableString($account['subtype'] ?? $account['account_subtype'] ?? null, 40),
            'account_mask' => $mask !== '' ? $mask : null,
        ];
    }

    /**
     * @return array{account_id: null, account_name: null, account_official_name: null, account_type: null, account_subtype: null, account_mask: null}
     */
    protected function emptyAccount(): array
    {
        return [
            'account_id' => null,
            'account_name' => null,
            'account_official_name' => null,
            'account_type' => null,
            'account_subtype' => null,
            'account_mask' => null,
        ];
    }

    protected function removeItemQuietly(?string $accessToken): void
    {
        if (! filled($accessToken)) {
            return;
        }

        try {
            $this->client()->items->remove($accessToken);
        } catch (PlaidRequestException $e) {
            Log::warning('Plaid item remove failed', [
                'plaid_error_type' => $e->getResponse()?->error_type ?? null,
                'plaid_error_code' => $e->getResponse()?->error_code ?? null,
            ]);
        }
    }

    protected function applyItemError(CommunityPlaidConnection $connection, string $errorCode, string $errorMessage): void
    {
        $status = CommunityPlaidConnection::STATUS_ERROR;
        if (in_array($errorCode, self::ATTENTION_CODES, true)) {
            $status = CommunityPlaidConnection::STATUS_NEEDS_ATTENTION;
        } elseif (in_array($errorCode, self::ERROR_CODES, true)) {
            $status = CommunityPlaidConnection::STATUS_ERROR;
        } elseif ($errorCode === 'ITEM_LOGIN_REQUIRED') {
            $status = CommunityPlaidConnection::STATUS_NEEDS_ATTENTION;
        }

        $connection->status = $status;
        $connection->error_code = $errorCode !== '' ? $errorCode : $connection->error_code;
        $connection->error_message = $errorMessage !== ''
            ? mb_substr($errorMessage, 0, 500)
            : ($connection->error_message ?: 'This Plaid connection needs attention.');
    }

    protected function logWebhookError(CommunityPlaidConnection $connection, string $errorCode, string $errorMessage): void
    {
        $community = $connection->community;
        $actor = $connection->connectedBy;
        $label = $errorMessage !== '' ? $errorMessage : $errorCode;

        ActivityLogService::log(
            'user',
            'plaid_connection_error',
            'Plaid connection error for community #'.$connection->community_id.($label !== '' ? ': '.$label : ''),
            Community::class,
            (int) $connection->community_id,
            'warning',
            $connection->connected_by_user_id,
            $actor?->role,
            [
                'community_id' => $connection->community_id,
                'community_name' => $community?->name,
                'institution_name' => $connection->institution_name,
                'error_code' => $errorCode,
                'status' => $connection->status,
                'source' => 'webhook',
                'related_item' => $connection->institution_name ?: 'Plaid',
            ],
        );
    }

    protected function logAction(
        string $action,
        string $description,
        User $user,
        int $communityId,
        CommunityPlaidConnection $connection,
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

    /**
     * @return array<string, mixed>
     */
    protected function decoratePayload(CommunityPlaidConnection $connection): array
    {
        return array_merge($connection->toPublicPayload(), [
            'plaid_available' => true,
            'ach_ready' => $connection->isConnected(),
            'environment' => $this->environment(),
            'connected_at' => $connection->isConnected()
                ? ($connection->updated_at?->toIso8601String() ?: $connection->created_at?->toIso8601String())
                : $connection->created_at?->toIso8601String(),
        ]);
    }

    protected function actorName(User $user): string
    {
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Community Admin';
    }

    protected function webhookUrl(): ?string
    {
        $url = trim((string) config('plaid.webhook_url', ''));

        return $url !== '' ? $url : null;
    }

    protected function nullableString(mixed $value, int $max): ?string
    {
        $text = trim((string) $value);

        return $text !== '' ? mb_substr($text, 0, $max) : null;
    }
}
