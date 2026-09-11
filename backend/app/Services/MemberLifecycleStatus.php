<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Pre-membership resident stages for Community Admin → Members.
 *
 * Invitation Sent: admin invited the resident; they have not signed up yet.
 * Onboarding: resident started signup / accepted the invite, but has no membership yet.
 * Active: membership status `approved` (handled by community_memberships).
 */
class MemberLifecycleStatus
{
    public const INVITATION_SENT = 'invitation_sent';

    public const ONBOARDING = 'onboarding';

    public static function hasStartedSignup(mixed $emailVerifiedAt, mixed $phoneVerifiedAt, bool $hasAuthenticated = false): bool
    {
        return filled($emailVerifiedAt) || filled($phoneVerifiedAt) || $hasAuthenticated;
    }

    public static function statusWithoutMembership(bool $startedSignup, bool $hasAssignedUnusedInvite): string
    {
        if ($hasAssignedUnusedInvite && ! $startedSignup) {
            return self::INVITATION_SENT;
        }

        return self::ONBOARDING;
    }

    public static function applyStartedSignup($query, string $usersAlias = 'users'): void
    {
        $query->where(function ($q) use ($usersAlias) {
            $q->whereNotNull("{$usersAlias}.email_verified_at")
                ->orWhereNotNull("{$usersAlias}.phone_verified_at")
                ->orWhereExists(fn ($sub) => self::authTokenSubquery($sub, $usersAlias));
        });
    }

    public static function applyNotStartedSignup($query, string $usersAlias = 'users'): void
    {
        $query->whereNull("{$usersAlias}.email_verified_at")
            ->whereNull("{$usersAlias}.phone_verified_at")
            ->whereNotExists(fn ($sub) => self::authTokenSubquery($sub, $usersAlias));
    }

    public static function applyAssignedUnusedInviteExists($query, string $usersAlias = 'users', ?int $communityId = null): void
    {
        $query->whereExists(fn ($sub) => self::assignedUnusedInviteSubquery($sub, $usersAlias, $communityId));
    }

    public static function applyNoAssignedUnusedInvite($query, string $usersAlias = 'users', ?int $communityId = null): void
    {
        $query->whereNotExists(fn ($sub) => self::assignedUnusedInviteSubquery($sub, $usersAlias, $communityId));
    }

    public static function applyNoMembership($query, string $usersAlias = 'users'): void
    {
        $query->whereNotExists(function ($sub) use ($usersAlias) {
            $sub->from('community_memberships as cm_all')
                ->whereColumn('cm_all.user_id', "{$usersAlias}.id");
        });
    }

    /** Residents with no membership who still belong on the members list. */
    public static function preMembershipResidentsQuery(?int $communityId)
    {
        $query = DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted');

        self::applyNoMembership($query);

        if ($communityId) {
            $query->whereExists(function ($sub) use ($communityId) {
                $sub->from('invite_codes')
                    ->whereColumn('invite_codes.invited_user_id', 'users.id')
                    ->where('invite_codes.community_id', $communityId)
                    ->whereNull('invite_codes.deleted_at');
            });
        } else {
            $query->where(function ($q) {
                $q->whereNotExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNotNull('invite_codes.deleted_at');
                })->orWhereExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNull('invite_codes.deleted_at');
                });
            });
        }

        return $query;
    }

    public static function countInvitationSent(?int $communityId): int
    {
        $query = self::preMembershipResidentsQuery($communityId);
        self::applyNotStartedSignup($query);
        self::applyAssignedUnusedInviteExists($query, 'users', $communityId);

        return (int) $query->count();
    }

    public static function countOnboarding(?int $communityId): int
    {
        $query = self::preMembershipResidentsQuery($communityId);
        $query->where(function ($q) use ($communityId) {
            $q->where(function ($started) {
                self::applyStartedSignup($started);
            })->orWhere(function ($noInvite) use ($communityId) {
                self::applyNoAssignedUnusedInvite($noInvite, 'users', $communityId);
            });
        });

        return (int) $query->count();
    }

    public static function pendingInviteCountSelect(string $usersAlias = 'users'): \Illuminate\Contracts\Database\Query\Expression
    {
        return DB::raw(
            "(select count(*) from invite_codes where invited_user_id = {$usersAlias}.id and deleted_at is null and (max_uses is null or used_count < max_uses)) as pending_invite_count"
        );
    }

    public static function authTokenCountSelect(string $usersAlias = 'users'): \Illuminate\Contracts\Database\Query\Expression
    {
        $type = addslashes(User::class);

        return DB::raw(
            "(select count(*) from personal_access_tokens where tokenable_id = {$usersAlias}.id and tokenable_type = '{$type}') as auth_token_count"
        );
    }

    private static function authTokenSubquery($sub, string $usersAlias): void
    {
        $sub->from('personal_access_tokens')
            ->whereColumn('personal_access_tokens.tokenable_id', "{$usersAlias}.id")
            ->where('personal_access_tokens.tokenable_type', User::class);
    }

    private static function assignedUnusedInviteSubquery($sub, string $usersAlias, ?int $communityId): void
    {
        $sub->from('invite_codes')
            ->whereColumn('invite_codes.invited_user_id', "{$usersAlias}.id")
            ->whereNull('invite_codes.deleted_at')
            ->where(function ($q) {
                $q->whereNull('invite_codes.max_uses')
                    ->orWhereColumn('invite_codes.used_count', '<', 'invite_codes.max_uses');
            });

        if ($communityId) {
            $sub->where('invite_codes.community_id', $communityId);
        }
    }
}
