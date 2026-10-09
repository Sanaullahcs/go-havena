<?php

namespace App\Services;

use App\Models\User;

/**
 * Community-admin category switches saved on the account.
 * Missing keys use the product defaults. Existing inbox rows are left in place.
 */
class CommunityAdminNotificationPreferences
{
    public const NEW_MEMBER = 'new_member_alerts';

    public const MODERATION = 'moderation_alerts';

    public const SYSTEM = 'system_alerts';

    public const WEEKLY = 'weekly_digest';

    /** @var array<string, bool> */
    public const DEFAULTS = [
        self::NEW_MEMBER => true,
        self::MODERATION => true,
        self::SYSTEM     => true,
        self::WEEKLY     => false,
    ];

    /** @return array<string, bool> */
    public static function forUser(User $user): array
    {
        $stored = $user->admin_notification_preferences;
        if (! is_array($stored)) {
            $stored = [];
        }

        $prefs = self::DEFAULTS;
        foreach (self::DEFAULTS as $key => $default) {
            if (array_key_exists($key, $stored)) {
                $prefs[$key] = (bool) $stored[$key];
            }
        }

        return $prefs;
    }

    /** @param  array<string, bool>  $incoming */
    public static function save(User $user, array $incoming): array
    {
        $next = self::forUser($user);
        foreach (self::DEFAULTS as $key => $default) {
            if (array_key_exists($key, $incoming)) {
                $next[$key] = (bool) $incoming[$key];
            }
        }

        $user->forceFill(['admin_notification_preferences' => $next])->save();

        return $next;
    }

    public static function allows(int $userId, ?string $category): bool
    {
        if ($category === null) {
            return true;
        }

        $user = User::query()->find($userId);
        $isDashboardAdmin = $user
            && (AdminRoleService::isCommunityAdminRole($user) || AdminRoleService::isSystemAdmin($user));
        if (! $isDashboardAdmin) {
            return true;
        }

        $prefs = self::forUser($user);

        return (bool) ($prefs[$category] ?? true);
    }

    public static function categoryFor(
        string $type,
        string $title,
        ?string $actionUrl,
        ?array $data,
    ): ?string {
        $kind = strtolower((string) ($data['kind'] ?? ''));
        $scope = strtolower((string) ($data['scope'] ?? ''));
        $title = strtolower($title);
        $url = strtolower((string) $actionUrl);

        if (
            in_array($kind, ['weekly_digest', 'weekly_summary'], true)
            || str_contains($title, 'weekly summary')
            || str_contains($title, 'weekly digest')
        ) {
            return self::WEEKLY;
        }

        if (
            in_array($kind, ['ugc_report', 'user_blocked'], true)
            || str_contains($url, '/admin/moderation')
            || str_contains($url, '/moderation')
        ) {
            return self::MODERATION;
        }

        if (
            in_array($kind, [
                'family_join_pending_admin',
                'family_add_member_pending_admin',
                'membership_request',
                'new_member',
            ], true)
            || str_contains($url, '/admin/members')
            || str_contains($url, '/admin/residents')
            || str_contains($title, 'membership approval')
            || str_contains($title, 'family member approval')
            || str_contains($title, 'new member')
        ) {
            return self::NEW_MEMBER;
        }

        if (
            $type === 'system'
            || $scope === 'account'
            || in_array($kind, ['system', 'security'], true)
            || str_contains($title, 'security')
            || str_contains($title, 'system alert')
        ) {
            return self::SYSTEM;
        }

        return null;
    }
}
