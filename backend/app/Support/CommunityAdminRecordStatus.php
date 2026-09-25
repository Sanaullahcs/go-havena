<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CommunityAdminRecordStatus
{
    public const PENDING = 'pending';

    public const ACTIVE = 'active';

    public const SUSPENDED = 'suspended';

    public const REASSIGN = 'reassign';

    public const REJECTED = 'rejected';

    public const ACTION_VIEW = 'view';

    public const ACTION_APPROVE = 'approve';

    public const ACTION_REJECT = 'reject';

    public const ACTION_EDIT = 'edit';

    public const ACTION_RELEASE = 'release';

    public const ACTION_SUSPEND = 'suspend';

    public const ACTION_REACTIVATE = 'reactivate';

    public const ACTION_ASSIGN_COMMUNITY = 'assign_community';

    public const ACTION_DELETE = 'delete';

    public const ACTION_DELETE_RECORD = 'delete_record';

    /** @return list<string> */
    public static function statuses(): array
    {
        return [
            self::PENDING,
            self::ACTIVE,
            self::SUSPENDED,
            self::REASSIGN,
            self::REJECTED,
        ];
    }

    public static function hasCurrentAssignment(User $user): bool
    {
        $user->loadMissing('memberships');

        return $user->memberships
            ->contains(fn ($membership) => $membership->role === 'admin'
                && in_array($membership->status, ['approved', 'pending'], true));
    }

    public static function resolve(User $user): string
    {
        $application = (string) ($user->community_admin_status ?? '');

        if ($application === self::PENDING) {
            return self::PENDING;
        }

        if ($application === self::REJECTED) {
            return self::REJECTED;
        }

        if ($application === 'approved' && ($user->status ?? '') === self::SUSPENDED) {
            return self::SUSPENDED;
        }

        if ($application === 'approved') {
            return self::hasCurrentAssignment($user) ? self::ACTIVE : self::REASSIGN;
        }

        return self::PENDING;
    }

    /** @return list<string> */
    public static function actionsFor(string $status): array
    {
        return match ($status) {
            self::PENDING => [self::ACTION_VIEW, self::ACTION_APPROVE, self::ACTION_REJECT],
            self::ACTIVE => [
                self::ACTION_VIEW,
                self::ACTION_EDIT,
                self::ACTION_RELEASE,
                self::ACTION_SUSPEND,
                self::ACTION_DELETE,
            ],
            self::SUSPENDED => [
                self::ACTION_VIEW,
                self::ACTION_EDIT,
                self::ACTION_REACTIVATE,
                self::ACTION_DELETE,
            ],
            self::REASSIGN => [
                self::ACTION_VIEW,
                self::ACTION_EDIT,
                self::ACTION_ASSIGN_COMMUNITY,
                self::ACTION_DELETE,
            ],
            self::REJECTED => [self::ACTION_VIEW, self::ACTION_APPROVE, self::ACTION_DELETE_RECORD],
            default => [self::ACTION_VIEW],
        };
    }

    /** @return list<string> */
    public static function actionsForUser(User $user): array
    {
        return self::actionsFor(self::resolve($user));
    }

    public static function allows(User $user, string $action): bool
    {
        $actions = self::actionsForUser($user);

        if ($action === self::ACTION_DELETE) {
            return in_array(self::ACTION_DELETE, $actions, true)
                || in_array(self::ACTION_DELETE_RECORD, $actions, true);
        }

        return in_array($action, $actions, true);
    }

    public static function assertCan(User $user, string $action): void
    {
        if (! self::allows($user, $action)) {
            abort(422, self::deniedMessage(self::resolve($user), $action));
        }
    }

    public static function applyScope(Builder $query, string $status): void
    {
        if ($status === 'approved') {
            $status = self::ACTIVE;
        }

        if ($status === 'needs_reassign') {
            $status = self::REASSIGN;
        }

        if ($status === self::PENDING || $status === self::REJECTED) {
            $query->where('community_admin_status', $status);

            return;
        }

        if ($status === self::SUSPENDED) {
            $query->where('community_admin_status', 'approved')
                ->where('status', 'suspended');

            return;
        }

        $query->where('community_admin_status', 'approved')
            ->where('status', 'active');

        $assignment = function ($membership) {
            $membership->where('role', 'admin')
                ->whereIn('status', ['approved', 'pending']);
        };

        if ($status === self::REASSIGN) {
            $query->whereDoesntHave('memberships', $assignment);

            return;
        }

        $query->whereHas('memberships', $assignment);
    }

    public static function deniedMessage(string $status, string $action): string
    {
        $label = match ($action) {
            self::ACTION_APPROVE => 'approve',
            self::ACTION_REJECT => 'reject',
            self::ACTION_EDIT => 'edit',
            self::ACTION_RELEASE => 'release from a community',
            self::ACTION_SUSPEND => 'suspend',
            self::ACTION_REACTIVATE => 'reactivate',
            self::ACTION_ASSIGN_COMMUNITY => 'assign to a community',
            self::ACTION_DELETE, self::ACTION_DELETE_RECORD => 'delete',
            default => 'perform this action on',
        };

        $stage = match ($status) {
            self::PENDING => 'pending',
            self::ACTIVE => 'active',
            self::SUSPENDED => 'suspended',
            self::REASSIGN => 'unassigned',
            self::REJECTED => 'rejected',
            default => $status,
        };

        return "This action is not available for a {$stage} community admin.";
    }
}
