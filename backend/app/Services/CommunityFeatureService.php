<?php

namespace App\Services;

use App\Exceptions\CommunityFeatureException;
use App\Models\Community;
use App\Models\CommunityFeatureDisableRequest;
use App\Models\CommunityFeatureFlag;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\GuestAccessService;
use App\Support\CommunityFeatureCatalog;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CommunityFeatureService
{
    public const DISABLED_BY_SYSTEM_ADMIN = 'system_admin';

    public const DISABLED_BY_COMMUNITY_ADMIN = 'community_admin';

    /** @return list<array<string, mixed>> */
    public function catalog(): array
    {
        return CommunityFeatureCatalog::all();
    }

    public function isConfigured(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        $configuredAt = Community::query()
            ->where('id', $communityId)
            ->value('resident_features_configured_at');

        return $configuredAt !== null;
    }

    /**
     * Feature selection is not part of community-admin signup.
     * Defaults stay on until a community admin requests a change from Settings.
     */
    public function requiresOnboardingConfiguration(?int $communityId): bool
    {
        return false;
    }

    /**
     * @return array<string, bool>
     */
    public function flagsForCommunity(?int $communityId): array
    {
        $flags = CommunityFeatureCatalog::defaultFlags();
        if (! $communityId) {
            return $flags;
        }

        $stored = CommunityFeatureFlag::query()
            ->where('community_id', $communityId)
            ->pluck('enabled', 'feature_key');

        foreach ($stored as $key => $enabled) {
            if (isset($flags[$key])) {
                $flags[$key] = (bool) $enabled;
            }
        }

        foreach ($this->regionLockedOffKeys($communityId) as $key) {
            if (isset($flags[$key])) {
                $flags[$key] = false;
            }
        }

        return $flags;
    }

    /**
     * Refer & Earn is a US billing feature. Pakistan communities never see it,
     * even when the stored flag was left on.
     *
     * @return list<string>
     */
    private function regionLockedOffKeys(?int $communityId): array
    {
        if (! $communityId) {
            return [];
        }

        $policy = app(RegionBillingPolicy::class);
        $code = strtoupper((string) ($policy->countryCodeForCommunity($communityId) ?? ''));
        if ($code === 'PK' || $policy->isBillingExempt($communityId)) {
            return ['refer_and_earn'];
        }

        return [];
    }

    public function isEnabled(?int $communityId, string $featureKey): bool
    {
        if (! CommunityFeatureCatalog::isKnown($featureKey)) {
            return true;
        }

        return $this->flagsForCommunity($communityId)[$featureKey] ?? true;
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * @return array<string, string>
     */
    public function disabledByForCommunity(?int $communityId): array
    {
        if (! $communityId) {
            return [];
        }

        $owners = [];
        $rows = CommunityFeatureFlag::query()
            ->where('community_id', $communityId)
            ->where('enabled', false)
            ->get(['feature_key', 'disabled_by']);

        foreach ($rows as $row) {
            $owners[(string) $row->feature_key] = $row->disabled_by ?: self::DISABLED_BY_SYSTEM_ADMIN;
        }

        return $owners;
    }

    /**
     * @return array<string, mixed>
     */
    public function payloadForCommunity(?int $communityId, ?User $viewer = null): array
    {
        $flags = $this->flagsForCommunity($communityId);
        $owners = $this->disabledByForCommunity($communityId);
        $catalog = array_map(static function (array $feature) use ($flags, $owners) {
            $enabled = (bool) ($flags[$feature['key']] ?? true);

            return array_merge($feature, [
                'enabled' => $enabled,
                'disabled_by' => $enabled ? null : ($owners[$feature['key']] ?? self::DISABLED_BY_SYSTEM_ADMIN),
            ]);
        }, $this->catalog());

        if ($viewer && ! AdminRoleService::isSystemAdmin($viewer)) {
            $catalog = array_values(array_filter(
                $catalog,
                fn (array $feature) => ($feature['disabled_by'] ?? null) !== self::DISABLED_BY_SYSTEM_ADMIN,
            ));
        }

        $includeRequests = $viewer && AdminRoleService::isCommunityAdminRole($viewer);

        return [
            'configured' => $this->isConfigured($communityId),
            'features' => $flags,
            'pending_requests' => $includeRequests ? $this->pendingRequestsForCommunity($communityId) : [],
            'requests' => $includeRequests ? $this->recentRequestsForCommunity($communityId) : [],
            'catalog' => $catalog,
        ];
    }

    public static function featureKeyForNoticeCategory(?string $category): string
    {
        return CommunityFeatureCatalog::featureKeyForNoticeCategory($category);
    }

    /**
     * @return list<string>|null  null = no restriction
     */
    public function allowedNoticeCategories(?User $user, ?int $communityId): ?array
    {
        if (! $user || AdminRoleService::isSystemAdmin($user)) {
            return null;
        }

        $flags = $this->flagsForCommunity($communityId);
        $allowed = [];
        if ($flags['notices'] ?? true) {
            $allowed = array_merge($allowed, ['general', 'maintenance', 'security', 'finance']);
        }
        if ($flags['events'] ?? true) {
            $allowed[] = 'event';
        }
        if ($flags['alerts'] ?? true) {
            $allowed[] = 'emergency';
        }

        return $allowed;
    }

    public function communityIdForUser(?User $user): ?int
    {
        if (! $user) {
            return null;
        }

        if (GuestAccessService::isGuest($user)) {
            $invitation = GuestAccessService::getLatestInvitation($user);

            return $invitation?->community_id ? (int) $invitation->community_id : null;
        }

        if (AdminRoleService::isResidentMode($user)) {
            return UserActingContextService::residentCommunityId($user);
        }

        if (AdminRoleService::isCommunityAdminRole($user)) {
            return UserActingContextService::currentCommunityId($user);
        }

        $preferred = UserActingContextService::currentCommunityId($user);
        if ($preferred) {
            return $preferred;
        }

        $membership = CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByRaw("CASE WHEN role = 'admin' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();

        return $membership?->community_id ? (int) $membership->community_id : null;
    }

    public function assertResidentCanAccess(?User $user, string $featureKey): void
    {
        if (! $user || AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        $communityId = $this->communityIdForUser($user);
        if ($this->isEnabled($communityId, $featureKey)) {
            return;
        }

        $label = CommunityFeatureCatalog::definition($featureKey)['label'] ?? $featureKey;

        throw CommunityFeatureException::disabled($featureKey, $label);
    }

    /**
     * @param  array<string, mixed>  $incoming
     * @return array<string, mixed>
     */
    /**
     * @param  array<string, string>  $disabledBy  feature key => system_admin|community_admin when turning off
     */
    public function save(int $communityId, array $incoming, User $actor, array $disabledBy = []): array
    {
        $wasConfigured = $this->isConfigured($communityId);
        $before = $this->flagsForCommunity($communityId);
        $next = $before;

        foreach ($incoming as $key => $value) {
            if (! CommunityFeatureCatalog::isKnown((string) $key)) {
                continue;
            }
            $next[(string) $key] = (bool) $value;
        }

        DB::transaction(function () use ($communityId, $next, $before, $actor, $disabledBy) {
            foreach ($next as $key => $enabled) {
                $enabled = (bool) $enabled;
                $was = (bool) ($before[$key] ?? true);
                $attributes = [
                    'enabled' => $enabled,
                    'updated_by_user_id' => $actor->id,
                ];
                if ($was !== $enabled) {
                    $attributes['disabled_by'] = $enabled
                        ? null
                        : ($disabledBy[$key] ?? (AdminRoleService::isSystemAdmin($actor)
                            ? self::DISABLED_BY_SYSTEM_ADMIN
                            : self::DISABLED_BY_COMMUNITY_ADMIN));
                }

                CommunityFeatureFlag::query()->updateOrCreate(
                    [
                        'community_id' => $communityId,
                        'feature_key' => $key,
                    ],
                    $attributes,
                );
            }

            Community::query()->where('id', $communityId)->update([
                'resident_features_configured_at' => now(),
            ]);
        });

        $changes = [];
        foreach ($next as $key => $enabled) {
            $was = (bool) ($before[$key] ?? true);
            if ($was === $enabled) {
                continue;
            }
            $label = CommunityFeatureCatalog::definition($key)['label'] ?? $key;
            $changes[] = [
                'field' => $label,
                'key' => $key,
                'previous' => $was ? 'On' : 'Off',
                'next' => $enabled ? 'On' : 'Off',
            ];
        }

        $communityName = Community::query()->where('id', $communityId)->value('name');

        if ($changes !== []) {
            ActivityLogService::recordChanges(
                'community_features_updated',
                Community::class,
                $communityId,
                $changes,
                $communityName,
                null,
                [
                    'community_id' => $communityId,
                    'related_item' => $communityName,
                ],
            );
        } elseif (! $wasConfigured) {
            ActivityLogService::user(
                'community_features_updated',
                trim(($actor->name ?: 'Admin').' saved resident feature defaults for '.$communityName),
                Community::class,
                $communityId,
                'info',
                $actor->id,
                [
                    'community_id' => $communityId,
                    'related_item' => $communityName,
                ],
            );
        }

        return $this->payloadForCommunity($communityId);
    }

    /**
     * Community admins request a disable or a re-enable. Both stay pending until a system admin approves them.
     * They can request a re-enable only for a feature they disabled.
     *
     * @param  array<string, mixed>  $incoming
     * @param  array<string, mixed>  $reasons
     * @return array<string, mixed>
     */
    public function saveAsCommunityAdmin(int $communityId, array $incoming, array $reasons, User $actor): array
    {
        $flags = $this->flagsForCommunity($communityId);
        $owners = $this->disabledByForCommunity($communityId);
        $errors = [];

        foreach ($incoming as $key => $value) {
            $key = (string) $key;
            if (! CommunityFeatureCatalog::isKnown($key)) {
                continue;
            }

            $currentlyOn = (bool) ($flags[$key] ?? true);
            $nextOn = (bool) $value;
            $label = CommunityFeatureCatalog::definition($key)['label'] ?? $key;

            if (! $currentlyOn && $nextOn && ($owners[$key] ?? null) !== self::DISABLED_BY_COMMUNITY_ADMIN) {
                $errors["features.{$key}"] = "Only a system administrator can turn {$label} back on.";
                continue;
            }

            if (! $currentlyOn && $nextOn) {
                $reason = trim((string) ($reasons[$key] ?? ''));
                if ($reason === '') {
                    $errors["enable_reasons.{$key}"] = "A reason is required to request enabling {$label}.";
                }
            }

            if ($currentlyOn && ! $nextOn) {
                $reason = trim((string) ($reasons[$key] ?? ''));
                if ($reason === '') {
                    $errors["disable_reasons.{$key}"] = "A reason is required to request disabling {$label}.";
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        foreach ($incoming as $key => $value) {
            $key = (string) $key;
            if (! CommunityFeatureCatalog::isKnown($key)) {
                continue;
            }
            $currentlyOn = (bool) ($flags[$key] ?? true);
            if (! $currentlyOn && (bool) $value) {
                $this->requestEnable($communityId, $key, (string) $reasons[$key], $actor);
            }
            if ($currentlyOn && ! (bool) $value) {
                $this->requestDisable($communityId, $key, (string) $reasons[$key], $actor);
            }
        }

        Community::query()->where('id', $communityId)->update([
            'resident_features_configured_at' => now(),
        ]);

        return $this->payloadForCommunity($communityId);
    }

    /**
     * @return array<string, mixed>
     */
    public function requestDisable(int $communityId, string $featureKey, string $reason, User $actor): array
    {
        if (! CommunityFeatureCatalog::isKnown($featureKey)) {
            throw ValidationException::withMessages([
                'feature_key' => 'That feature is not available.',
            ]);
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => 'Please provide a reason for this request.',
            ]);
        }

        $label = CommunityFeatureCatalog::definition($featureKey)['label'] ?? $featureKey;
        if (! $this->isEnabled($communityId, $featureKey)) {
            throw ValidationException::withMessages([
                'feature_key' => "{$label} is already off.",
            ]);
        }

        $this->assertNoPendingFeatureRequest($communityId, $featureKey, $label);

        $row = CommunityFeatureDisableRequest::query()->create([
            'community_id' => $communityId,
            'feature_key' => $featureKey,
            'action' => 'disable',
            'reason' => $reason,
            'status' => 'pending',
            'requested_by_user_id' => $actor->id,
        ]);

        $communityName = Community::query()->where('id', $communityId)->value('name');
        ActivityLogService::user(
            'feature_disable_requested',
            trim(($actor->name ?: 'Community admin')." requested to disable {$label} for {$communityName}"),
            Community::class,
            $communityId,
            'info',
            $actor->id,
            [
                'community_id' => $communityId,
                'related_item' => $communityName,
                'feature_key' => $featureKey,
                'request_id' => $row->id,
            ],
        );

        return $this->presentRequest($row->fresh(['community', 'requestedBy']));
    }

    /**
     * @return array<string, mixed>
     */
    public function enableAsCommunityAdmin(int $communityId, string $featureKey, User $actor): array
    {
        if (! CommunityFeatureCatalog::isKnown($featureKey)) {
            throw ValidationException::withMessages([
                'feature_key' => 'That feature is not available.',
            ]);
        }

        if (AdminRoleService::isSystemAdmin($actor)) {
            return $this->save($communityId, [$featureKey => true], $actor);
        }

        throw ValidationException::withMessages([
            'reason' => 'A reason is required. A system administrator must approve turning this feature back on.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function requestEnable(int $communityId, string $featureKey, string $reason, User $actor): array
    {
        if (! CommunityFeatureCatalog::isKnown($featureKey)) {
            throw ValidationException::withMessages([
                'feature_key' => 'That feature is not available.',
            ]);
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => 'Please provide a reason for this request.',
            ]);
        }

        $label = CommunityFeatureCatalog::definition($featureKey)['label'] ?? $featureKey;
        $owner = $this->disabledByForCommunity($communityId)[$featureKey] ?? null;
        if ($this->isEnabled($communityId, $featureKey) || $owner !== self::DISABLED_BY_COMMUNITY_ADMIN) {
            throw ValidationException::withMessages([
                'feature_key' => "Only a system administrator can turn {$label} back on.",
            ]);
        }

        $this->assertNoPendingFeatureRequest($communityId, $featureKey, $label);

        $row = CommunityFeatureDisableRequest::query()->create([
            'community_id' => $communityId,
            'feature_key' => $featureKey,
            'action' => 'enable',
            'reason' => $reason,
            'status' => 'pending',
            'requested_by_user_id' => $actor->id,
        ]);

        $communityName = Community::query()->where('id', $communityId)->value('name');
        ActivityLogService::user(
            'feature_enable_requested',
            trim(($actor->name ?: 'Community admin')." requested to enable {$label} for {$communityName}"),
            Community::class,
            $communityId,
            'info',
            $actor->id,
            [
                'community_id' => $communityId,
                'related_item' => $communityName,
                'feature_key' => $featureKey,
                'request_id' => $row->id,
            ],
        );

        return $this->presentRequest($row->fresh(['community', 'requestedBy']));
    }

    private function assertNoPendingFeatureRequest(int $communityId, string $featureKey, string $label): void
    {
        $existing = CommunityFeatureDisableRequest::query()
            ->where('community_id', $communityId)
            ->where('feature_key', $featureKey)
            ->where('status', 'pending')
            ->exists();

        if ($existing) {
            throw ValidationException::withMessages([
                'feature_key' => "A request for {$label} is already pending.",
            ]);
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listDisableRequests(?string $status = 'pending'): array
    {
        $query = CommunityFeatureDisableRequest::query()
            ->with(['community', 'requestedBy', 'reviewedBy'])
            ->orderByDesc('created_at');

        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (CommunityFeatureDisableRequest $row) => $this->presentRequest($row))->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function reviewDisableRequest(int $requestId, User $actor, bool $approve): array
    {
        $row = CommunityFeatureDisableRequest::query()->with(['community', 'requestedBy'])->find($requestId);
        if (! $row) {
            throw ValidationException::withMessages([
                'request' => 'That request could not be found.',
            ]);
        }

        if ($row->status !== 'pending') {
            throw ValidationException::withMessages([
                'request' => 'This request has already been reviewed.',
            ]);
        }

        $enabling = ($row->action ?: 'disable') === 'enable';
        if ($approve) {
            if ($enabling) {
                $this->save((int) $row->community_id, [$row->feature_key => true], $actor);
            } else {
                $this->save((int) $row->community_id, [$row->feature_key => false], $actor, [
                    $row->feature_key => self::DISABLED_BY_COMMUNITY_ADMIN,
                ]);
            }
        }

        $row->status = $approve ? 'approved' : 'rejected';
        $row->reviewed_by_user_id = $actor->id;
        $row->reviewed_at = now();
        $row->save();

        $label = CommunityFeatureCatalog::definition($row->feature_key)['label'] ?? $row->feature_key;
        $communityName = $row->community?->name;
        $verb = $enabling
            ? ($approve ? ' approved enabling ' : ' rejected enabling ')
            : ($approve ? ' approved disabling ' : ' rejected disabling ');
        ActivityLogService::user(
            $enabling
                ? ($approve ? 'feature_enable_approved' : 'feature_enable_rejected')
                : ($approve ? 'feature_disable_approved' : 'feature_disable_rejected'),
            trim(($actor->name ?: 'System admin').$verb.$label.($communityName ? " for {$communityName}" : '')),
            Community::class,
            (int) $row->community_id,
            'info',
            $actor->id,
            [
                'community_id' => (int) $row->community_id,
                'related_item' => $communityName,
                'feature_key' => $row->feature_key,
                'request_id' => $row->id,
            ],
        );

        return $this->presentRequest($row->fresh(['community', 'requestedBy', 'reviewedBy']));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function pendingRequestsForCommunity(?int $communityId): array
    {
        if (! $communityId) {
            return [];
        }

        return CommunityFeatureDisableRequest::query()
            ->with(['requestedBy'])
            ->where('community_id', $communityId)
            ->where('status', 'pending')
            ->orderByDesc('id')
            ->get()
            ->map(fn (CommunityFeatureDisableRequest $row) => $this->presentRequest($row))
            ->all();
    }

    /**
     * Latest requests for this community, including approved and rejected reviews.
     *
     * @return list<array<string, mixed>>
     */
    private function recentRequestsForCommunity(?int $communityId): array
    {
        if (! $communityId) {
            return [];
        }

        return CommunityFeatureDisableRequest::query()
            ->with(['requestedBy', 'reviewedBy'])
            ->where('community_id', $communityId)
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->map(fn (CommunityFeatureDisableRequest $row) => $this->presentRequest($row))
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function presentRequest(CommunityFeatureDisableRequest $row): array
    {
        $definition = CommunityFeatureCatalog::definition($row->feature_key);

        return [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'community_name' => $row->community?->name,
            'feature_key' => $row->feature_key,
            'feature_name' => $definition['label'] ?? $row->feature_key,
            'action' => $row->action ?: 'disable',
            'reason' => $row->reason,
            'status' => $row->status,
            'requested_by' => $row->requestedBy?->name,
            'requested_by_user_id' => (int) $row->requested_by_user_id,
            'requested_at' => optional($row->created_at)->toIso8601String(),
            'reviewed_by' => $row->reviewedBy?->name,
            'reviewed_at' => optional($row->reviewed_at)->toIso8601String(),
        ];
    }

    public function assertCanManage(?User $user, int $communityId): void
    {
        if (! $user) {
            throw CommunityFeatureException::forbidden();
        }

        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        if (AdminRoleService::isResidentMode($user) || ! AdminRoleService::isCommunityAdminRole($user)) {
            throw CommunityFeatureException::forbidden();
        }

        $managedId = $this->communityIdForUser($user);
        if ($managedId !== $communityId) {
            throw CommunityFeatureException::forbidden();
        }
    }
}
