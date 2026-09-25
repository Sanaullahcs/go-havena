<?php

namespace App\Services;

use App\Exceptions\CommunityFeatureException;
use App\Models\Community;
use App\Models\CommunityFeatureFlag;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\GuestAccessService;
use App\Support\CommunityFeatureCatalog;
use Illuminate\Support\Facades\DB;

class CommunityFeatureService
{
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

    public function requiresOnboardingConfiguration(?int $communityId): bool
    {
        if (! $communityId) {
            return false;
        }

        $community = Community::query()->find($communityId);
        if (! $community) {
            return false;
        }

        if (($community->review_status ?? null) !== 'pending') {
            return false;
        }

        return $community->resident_features_configured_at === null;
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

        return $flags;
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
    public function payloadForCommunity(?int $communityId): array
    {
        $flags = $this->flagsForCommunity($communityId);

        return [
            'configured' => $this->isConfigured($communityId),
            'features' => $flags,
            'catalog' => array_map(static function (array $feature) use ($flags) {
                return array_merge($feature, [
                    'enabled' => $flags[$feature['key']] ?? true,
                ]);
            }, $this->catalog()),
        ];
    }

    public static function featureKeyForNoticeCategory(?string $category): string
    {
        return match (strtolower((string) $category)) {
            'event' => 'events',
            'emergency' => 'alerts',
            default => 'notices',
        };
    }

    /**
     * @return list<string>|null  null = no restriction
     */
    public function allowedNoticeCategories(?User $user, ?int $communityId): ?array
    {
        if (
            ! $user
            || AdminRoleService::isSystemAdmin($user)
            || (AdminRoleService::isCommunityAdminRole($user) && ! AdminRoleService::isResidentMode($user))
        ) {
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
        if (
            ! $user
            || AdminRoleService::isSystemAdmin($user)
            || (AdminRoleService::isCommunityAdminRole($user) && ! AdminRoleService::isResidentMode($user))
        ) {
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
    public function save(int $communityId, array $incoming, User $actor): array
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

        DB::transaction(function () use ($communityId, $next, $actor) {
            foreach ($next as $key => $enabled) {
                CommunityFeatureFlag::query()->updateOrCreate(
                    [
                        'community_id' => $communityId,
                        'feature_key' => $key,
                    ],
                    [
                        'enabled' => $enabled,
                        'updated_by_user_id' => $actor->id,
                    ],
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
