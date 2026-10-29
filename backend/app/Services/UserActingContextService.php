<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UserActingContextService
{
    public const CONTEXT_ADMIN = 'community_admin';
    public const CONTEXT_RESIDENT = 'resident';

    public static function isResidentMode(?User $user): bool
    {
        return $user
            && AdminRoleService::isCommunityAdminRole($user)
            && ($user->active_context ?? '') === self::CONTEXT_RESIDENT;
    }

    public static function effectiveMode(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        if (self::isResidentMode($user)) {
            return self::CONTEXT_RESIDENT;
        }

        if (AdminRoleService::isCommunityAdminRole($user)) {
            return self::CONTEXT_ADMIN;
        }

        return $user->role ? (string) $user->role : self::CONTEXT_RESIDENT;
    }

    public static function currentCommunityId(?User $user): ?int
    {
        if (! $user) {
            return null;
        }

        $allowed = self::approvedCommunityIds($user);
        $preferred = $user->active_context_community_id ? (int) $user->active_context_community_id : null;
        if ($preferred && in_array($preferred, $allowed, true)) {
            return $preferred;
        }

        if ($allowed !== []) {
            return $allowed[0];
        }

        $membership = AdminRoleService::getApprovedAdminMembership($user)
            ?? AdminRoleService::getAdminMembershipIncludingPending($user);

        return $membership?->community_id ? (int) $membership->community_id : null;
    }

    /**
     * Approved communities this account can act in (resident or staff).
     *
     * @return list<int>
     */
    public static function approvedCommunityIds(User $user): array
    {
        return DB::table('community_memberships as cm')
            ->join('communities as c', 'c.id', '=', 'cm.community_id')
            ->where('cm.user_id', $user->id)
            ->where('cm.status', 'approved')
            ->whereNull('c.deleted_at')
            ->where(function ($query) {
                $query->whereNull('c.status')->orWhere('c.status', 'active');
            })
            ->orderBy('cm.created_at')
            ->orderBy('cm.id')
            ->pluck('cm.community_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return list<array{id: int, name: string, role: string}>
     */
    public static function switchableCommunities(User $user): array
    {
        return DB::table('community_memberships as cm')
            ->join('communities as c', 'c.id', '=', 'cm.community_id')
            ->where('cm.user_id', $user->id)
            ->where('cm.status', 'approved')
            ->whereNull('c.deleted_at')
            ->where(function ($query) {
                $query->whereNull('c.status')->orWhere('c.status', 'active');
            })
            ->orderBy('c.name')
            ->get(['c.id', 'c.name', 'cm.role'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'role' => (string) $row->role,
            ])
            ->values()
            ->all();
    }

    public static function switchCommunity(User $user, int $communityId): User
    {
        $allowed = self::approvedCommunityIds($user);
        if (! in_array($communityId, $allowed, true)) {
            throw ValidationException::withMessages([
                'community_id' => ['Choose one of your approved communities.'],
            ]);
        }

        $user->active_context_community_id = $communityId;
        $user->save();

        ActivityLogService::user(
            'switched_community',
            'Switched active community',
            'Community',
            $communityId,
            'info',
            (int) $user->id,
            [
                'community_id' => $communityId,
                'module' => 'Auth',
                'active_context' => self::effectiveMode($user),
            ],
        );

        return $user->fresh();
    }

    public static function rememberCommunityIfUnset(User $user, int $communityId): void
    {
        if ($user->active_context_community_id) {
            return;
        }

        $user->active_context_community_id = $communityId;
        $user->save();
    }

    /** Move off a banned/unavailable community onto another approved membership. */
    public static function clearUnavailableActiveCommunity(User $user): User
    {
        $allowed = self::approvedCommunityIds($user);
        $preferred = $user->active_context_community_id ? (int) $user->active_context_community_id : null;
        if ($preferred && in_array($preferred, $allowed, true)) {
            return $user;
        }

        $next = $allowed[0] ?? null;
        if ((int) ($user->active_context_community_id ?? 0) === (int) ($next ?? 0)) {
            return $user;
        }

        $user->active_context_community_id = $next;
        $user->save();

        return $user->fresh() ?? $user;
    }

    public static function requireCurrentCommunityId(?User $user, string $message = 'No approved community membership found.'): int
    {
        $id = self::currentCommunityId($user);
        abort_if(! $id, 422, $message);

        return $id;
    }

    public static function residentCommunityId(?User $user): ?int
    {
        if (! self::isResidentMode($user)) {
            return null;
        }

        return self::currentCommunityId($user);
    }

    public static function canUseResidentMode(?User $user): bool
    {
        return self::canSwitchModes($user);
    }

    /** True only when the account is an approved Community Admin — not the current UI mode. */
    public static function canSwitchModes(?User $user): bool
    {
        return $user
            && AdminRoleService::isCommunityAdminApproved($user)
            && AdminRoleService::getApprovedAdminMembership($user) !== null;
    }

    /**
     * @return list<array{id: int, name: string}>
     */
    public static function residentModeCommunities(User $user): array
    {
        return DB::table('community_memberships as cm')
            ->join('communities as c', 'c.id', '=', 'cm.community_id')
            ->where('cm.user_id', $user->id)
            ->where('cm.status', 'approved')
            ->whereIn('cm.role', ['admin', 'moderator'])
            ->whereNull('c.deleted_at')
            ->orderBy('c.name')
            ->get(['c.id', 'c.name'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
            ])
            ->values()
            ->all();
    }

    public static function switch(User $user, string $context, ?int $communityId = null): User
    {
        if (! self::canSwitchModes($user)) {
            abort(response()->json([
                'message' => 'Only a Community Admin can switch modes.',
                'code' => 'MODE_SWITCH_NOT_ALLOWED',
            ], 403));
        }

        if ($context !== self::CONTEXT_RESIDENT && $context !== self::CONTEXT_ADMIN) {
            throw ValidationException::withMessages([
                'context' => ['Context must be resident or community_admin.'],
            ]);
        }

        $communities = self::residentModeCommunities($user);
        if ($communities === []) {
            throw ValidationException::withMessages([
                'community_id' => ['Join an approved community before switching modes.'],
            ]);
        }

        $resolved = self::resolveSwitchCommunityId($user, $communities, $communityId);
        $user->active_context = $context;
        $user->active_context_community_id = $resolved;
        $user->save();

        ActivityLogService::user(
            $context === self::CONTEXT_RESIDENT ? 'switched_to_resident_mode' : 'switched_to_admin_mode',
            $context === self::CONTEXT_RESIDENT ? 'Switched to Resident Mode' : 'Switched to Admin Mode',
            'Community',
            $resolved,
            'info',
            (int) $user->id,
            [
                'community_id' => $resolved,
                'module' => 'Auth',
                'status' => $context,
                'account_role' => 'community_admin',
                'active_context' => $context,
                'active_mode' => $context,
                'actor_role' => self::CONTEXT_ADMIN,
                'actor_type' => self::CONTEXT_ADMIN,
            ],
        );

        return $user->fresh();
    }

    /**
     * Keep the user in the same community unless they explicitly choose another
     * community they already manage.
     *
     * @param  list<array{id: int, name: string}>  $communities
     */
    private static function resolveSwitchCommunityId(User $user, array $communities, ?int $communityId): int
    {
        $allowedIds = array_map(fn ($row) => (int) $row['id'], $communities);
        $currentId = $user->active_context_community_id ? (int) $user->active_context_community_id : null;

        if ($communityId && in_array($communityId, $allowedIds, true)) {
            return $communityId;
        }

        if ($communityId) {
            throw ValidationException::withMessages([
                'community_id' => ['Choose one of your managed communities.'],
            ]);
        }

        if ($currentId && in_array($currentId, $allowedIds, true)) {
            return $currentId;
        }

        return $allowedIds[0];
    }

    /**
     * @return array<string, mixed>
     */
    public static function payload(User $user): array
    {
        $mode = self::effectiveMode($user);

        return [
            'active_context' => $mode,
            'active_mode' => $mode,
            'active_context_community_id' => self::currentCommunityId($user),
            'can_switch_modes' => self::canSwitchModes($user),
            'can_use_admin_mode' => self::canSwitchModes($user),
            'can_use_resident_mode' => self::canSwitchModes($user),
            'can_switch_communities' => count(self::approvedCommunityIds($user)) > 1,
            'resident_communities' => self::switchableCommunities($user),
            'resident_mode_communities' => self::canSwitchModes($user)
                ? self::residentModeCommunities($user)
                : [],
        ];
    }
}
