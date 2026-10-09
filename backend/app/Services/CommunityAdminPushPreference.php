<?php

namespace App\Services;

use App\Models\User;

/**
 * Account push switch for community admins and residents.
 * System admins are not gated by this preference.
 */
class CommunityAdminPushPreference
{
    public static function allows(?User $user): bool
    {
        if (! $user || AdminRoleService::isSystemAdmin($user)) {
            return true;
        }

        if (! AdminRoleService::isCommunityAdminRole($user) && ($user->role ?? '') !== 'resident') {
            return true;
        }

        return (bool) ($user->push_notifications_enabled ?? true);
    }
}
