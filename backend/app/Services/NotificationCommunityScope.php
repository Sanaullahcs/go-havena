<?php

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Community admins only see notifications for the community they are
 * currently approved to manage. Rows stay stored.
 */
class NotificationCommunityScope
{
    public static function appliesTo(?User $user): bool
    {
        return $user
            && AdminRoleService::isCommunityAdminRole($user)
            && ! UserActingContextService::isResidentMode($user);
    }

    public static function authorizedCommunityId(?User $user): ?int
    {
        if (! self::appliesTo($user) || ! $user) {
            return null;
        }

        if (($user->status ?? '') === 'suspended') {
            return null;
        }

        if (($user->community_admin_status ?? '') !== 'approved') {
            return null;
        }

        $membership = AdminRoleService::getApprovedAdminMembership($user);
        $communityId = UserActingContextService::currentCommunityId($user);
        if (! $membership || ! $communityId || (int) $membership->community_id !== (int) $communityId) {
            return null;
        }

        return (int) $communityId;
    }

    public static function apply(Builder $query, ?User $user): void
    {
        if (! self::appliesTo($user) || ! $user) {
            return;
        }

        $communityId = self::authorizedCommunityId($user);
        if ($communityId === null) {
            $query->where('data->scope', 'account');

            return;
        }

        $since = self::unstampedCutoff($user, $communityId);

        $query->where(function (Builder $scoped) use ($communityId, $since) {
            $scoped->where(function (Builder $match) use ($communityId) {
                $match->where('data->community_id', $communityId)
                    ->orWhere('data->community_id', (string) $communityId);
            })->orWhere('data->scope', 'account');

            $scoped->orWhere(function (Builder $unstamped) use ($since) {
                $unstamped->where(function (Builder $missing) {
                    $missing->whereNull('data')->orWhereNull('data->community_id');
                });
                if ($since) {
                    $unstamped->where('created_at', '>=', $since);
                }
            });
        });
    }

    /**
     * Unstamped rows are visible from when this admin joined the current
     * community, or from the later moment another admin assignment was revoked.
     * Stamped rows use community_id and are not limited by this cutoff.
     */
    private static function unstampedCutoff(User $user, int $communityId): ?Carbon
    {
        $joinedAt = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator'])
            ->value('created_at');

        $revokedAt = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', '!=', $communityId)
            ->where('role', 'admin')
            ->whereIn('status', ['banned', 'rejected'])
            ->max('updated_at');

        $moments = array_filter([$joinedAt, $revokedAt]);
        if ($moments === []) {
            return null;
        }

        return collect($moments)->map(fn ($value) => Carbon::parse($value))->max();
    }
}
