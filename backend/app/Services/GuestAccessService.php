<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\GuestInvitation;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class GuestAccessService
{
    public const MSG_ACCESS_NOT_STARTED = 'Your guest access has not started yet. Please try again at the scheduled time.';

    public const MSG_ACCESS_EXPIRED = 'Your guest access has expired.';

    public const MSG_ACCESS_REVOKED = 'Your guest access has been revoked.';

    /** Actions guests are allowed to perform when enabled on their invitation. */
    public const PERMISSION_KEYS = [
        'feed',
        'notices',
        'events',
        'marketplace',
        'businesses',
        'wellness',
    ];

    /** @var array<string, bool> */
    public const DEFAULT_PERMISSIONS = [
        'feed'        => true,
        'notices'     => true,
        'events'      => true,
        'marketplace' => true,
        'businesses'  => true,
        'wellness'    => true,
    ];

    /** Actions guests are allowed to perform. */
    public const READ_FEATURES = [
        'feed',
        'notices',
        'events',
        'marketplace',
        'businesses',
        'wellness',
    ];

    /** Actions blocked for guests. */
    public const BLOCKED_WRITE_ACTIONS = [
        'create_post',
        'create_event',
        'create_notice',
        'create_listing',
        'create_business',
        'invite_user',
        'admin_access',
    ];

    public static function isGuest(?User $user): bool
    {
        return $user && ($user->role ?? '') === 'guest';
    }

    public static function getActiveInvitation(User $user): ?GuestInvitation
    {
        if (! self::isGuest($user)) {
            return null;
        }

        return GuestInvitation::query()
            ->where('guest_user_id', $user->id)
            ->where('status', 'active')
            ->where('ends_at', '>=', now())
            ->where('starts_at', '<=', now())
            ->orderByDesc('id')
            ->first();
    }

    public static function getLatestInvitation(User $user): ?GuestInvitation
    {
        if (! self::isGuest($user)) {
            return null;
        }

        $invitation = GuestInvitation::query()
            ->where('guest_user_id', $user->id)
            ->orderByDesc('id')
            ->first();

        if ($invitation) {
            return $invitation;
        }

        if (! $user->phone) {
            return null;
        }

        return GuestInvitation::query()
            ->where('guest_phone', $user->phone)
            ->orderByDesc('id')
            ->first();
    }

    public static function canGuestAccessDashboard(User $user): bool
    {
        if (! self::isGuest($user)) {
            return false;
        }

        $invitation = self::getActiveInvitation($user);
        if (! $invitation) {
            return false;
        }

        return $user->memberships()
            ->where('role', 'guest')
            ->where('status', 'approved')
            ->where('community_id', $invitation->community_id)
            ->exists();
    }

    /** @return array{status: ?string, can_access_dashboard: bool, starts_at: ?string, ends_at: ?string}|null */
    public static function guestAccessSummary(User $user): ?array
    {
        if (! self::isGuest($user)) {
            return null;
        }

        $invitation = self::getLatestInvitation($user);
        if (! $invitation) {
            return [
                'status'                => null,
                'can_access_dashboard'  => false,
                'starts_at'             => null,
                'ends_at'               => null,
            ];
        }

        return [
            'status'               => $invitation->status,
            'can_access_dashboard' => self::canGuestAccessDashboard($user),
            'starts_at'            => $invitation->starts_at?->toIso8601String(),
            'ends_at'              => $invitation->ends_at?->toIso8601String(),
            'access_window_active' => $invitation->isAccessWindowActive(),
            'permissions'          => self::permissionsFromInvitation($invitation),
        ];
    }

    /** @param  array<string, mixed>|null  $permissions
     * @return array<string, bool>
     */
    public static function normalizePermissions(?array $permissions): array
    {
        $normalized = self::DEFAULT_PERMISSIONS;

        if (! is_array($permissions)) {
            return $normalized;
        }

        foreach (self::PERMISSION_KEYS as $key) {
            if (array_key_exists($key, $permissions)) {
                $normalized[$key] = (bool) $permissions[$key];
            }
        }

        return $normalized;
    }

    /** @return array<string, bool> */
    public static function permissionsFromInvitation(GuestInvitation $invitation): array
    {
        return self::normalizePermissions($invitation->permissions);
    }

    public static function canAccessFeature(User $user, string $feature): bool
    {
        if (! self::isGuest($user)) {
            return true;
        }

        if (! in_array($feature, self::PERMISSION_KEYS, true)) {
            return false;
        }

        $invitation = self::getActiveInvitation($user);
        if (! $invitation) {
            return false;
        }

        $permissions = self::permissionsFromInvitation($invitation);

        return (bool) ($permissions[$feature] ?? false);
    }

    public static function assertCanAccessFeature(User $user, string $feature): void
    {
        if (! self::isGuest($user)) {
            return;
        }

        self::assertGuestAccessValid($user);

        if (! self::canAccessFeature($user, $feature)) {
            GuestActivityService::logBlocked($user, "access_denied_{$feature}");

            $label = self::featureLabel($feature);

            self::denyGuestAccess(
                "The resident or community admin who invited you did not enable {$label} for this guest visit.",
                'GUEST_FEATURE_DENIED',
                403,
                ['feature' => $feature],
            );
        }
    }

    public static function featureLabel(string $feature): string
    {
        return match ($feature) {
            'feed'        => 'Community feed',
            'notices'     => 'Notice board',
            'events'      => 'Events',
            'marketplace' => 'Marketplace',
            'businesses'  => 'Local businesses',
            'wellness'    => 'Wellness',
            default       => 'This feature',
        };
    }

    /** @return array<string, string> */
    public static function permissionValidationRules(): array
    {
        $rules = ['permissions' => 'nullable|array'];

        foreach (self::PERMISSION_KEYS as $key) {
            $rules["permissions.{$key}"] = 'sometimes|boolean';
        }

        return $rules;
    }

    /** @return array{message: string, code: string}|null */
    public static function loginScheduleBlock(GuestInvitation $invitation): ?array
    {
        if ($invitation->ends_at->isPast()) {
            self::expireInvitation($invitation);

            return [
                'message' => self::MSG_ACCESS_EXPIRED,
                'code'    => 'GUEST_ACCESS_EXPIRED',
            ];
        }

        if ($invitation->starts_at->isFuture()) {
            return [
                'message' => self::MSG_ACCESS_NOT_STARTED,
                'code'    => 'ACCESS_NOT_STARTED',
            ];
        }

        return null;
    }

    /** @return array{message: string, code: string}|null */
    public static function loginTerminationBlock(GuestInvitation $invitation): ?array
    {
        if ($invitation->status === 'revoked') {
            return [
                'message' => self::MSG_ACCESS_REVOKED,
                'code'    => 'GUEST_ACCESS_REVOKED',
            ];
        }

        if ($invitation->status === 'rejected') {
            return [
                'message' => 'Your guest access request was rejected.',
                'code'    => 'GUEST_ACCESS_REJECTED',
            ];
        }

        if ($invitation->status === 'expired') {
            return [
                'message' => self::MSG_ACCESS_EXPIRED,
                'code'    => 'GUEST_ACCESS_EXPIRED',
            ];
        }

        return null;
    }

    /** @return array{message: string, code: string}|null */
    public static function resolveGuestLoginBlock(?GuestInvitation $validInvitation, ?GuestInvitation $latestInvitation): ?array
    {
        if ($validInvitation) {
            if ($termination = self::loginTerminationBlock($validInvitation)) {
                return $termination;
            }

            return self::loginScheduleBlock($validInvitation);
        }

        if ($latestInvitation && ($block = self::loginTerminationBlock($latestInvitation))) {
            return $block;
        }

        return null;
    }

    public static function findLatestInvitationForPhone(string $phoneInput): ?GuestInvitation
    {
        $phone = \App\Support\PhoneNormalizer::normalize($phoneInput);
        if (! $phone) {
            return null;
        }

        return GuestInvitation::query()
            ->where('guest_phone', $phone)
            ->orderByDesc('id')
            ->first();
    }

    /** @return array{message: string, code: string}|null */
    public static function resolveGuestLoginBlockForUser(User $user): ?array
    {
        if (! self::isGuest($user)) {
            return null;
        }

        $latest = self::getLatestInvitation($user);
        if (! $latest) {
            return null;
        }

        if ($block = self::loginTerminationBlock($latest)) {
            return $block;
        }

        $loginInvitation = self::findLoginInvitationForEmail($user->email ?? '')
            ?? self::findLoginInvitationForPhone($user->phone ?? '');
        if (! $loginInvitation) {
            return [
                'message' => self::MSG_ACCESS_REVOKED,
                'code'    => 'GUEST_ACCESS_REVOKED',
            ];
        }

        return null;
    }

    public static function findLoginInvitationForPhone(string $phoneInput): ?GuestInvitation
    {
        $phone = \App\Support\PhoneNormalizer::normalize($phoneInput);
        if (! $phone) {
            return null;
        }

        return GuestInvitation::query()
            ->where('guest_phone', $phone)
            ->whereIn('status', ['pending_verification', 'pending_approval', 'active'])
            ->orderByDesc('id')
            ->first();
    }

    public static function findLatestInvitationForEmail(string $emailInput): ?GuestInvitation
    {
        $email = ContactIdentityService::normalizeEmail($emailInput);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            return null;
        }

        return GuestInvitation::query()
            ->whereRaw('LOWER(guest_email) = ?', [$email])
            ->orderByDesc('id')
            ->first();
    }

    public static function findLoginInvitationForEmail(string $emailInput): ?GuestInvitation
    {
        $email = ContactIdentityService::normalizeEmail($emailInput);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            return null;
        }

        return GuestInvitation::query()
            ->whereRaw('LOWER(guest_email) = ?', [$email])
            ->whereIn('status', ['pending_verification', 'pending_approval', 'active'])
            ->orderByDesc('id')
            ->first();
    }

    public static function assertGuestAccessValid(User $user): GuestInvitation
    {
        if (! self::isGuest($user)) {
            self::denyGuestAccess('Guest access required.', 'NOT_GUEST');
        }

        $invitation = GuestInvitation::query()
            ->where('guest_user_id', $user->id)
            ->orderByDesc('id')
            ->first();

        if (! $invitation) {
            self::denyGuestAccess('No guest invitation found for this account.', 'NO_GUEST_INVITATION');
        }

        if ($block = self::loginScheduleBlock($invitation)) {
            self::denyGuestAccess($block['message'], $block['code']);
        }

        if ($invitation->status === 'pending_verification') {
            self::denyGuestAccess('Complete invite code verification to continue.', 'PENDING_VERIFICATION');
        }

        if ($invitation->status === 'pending_approval') {
            self::denyGuestAccess('Your guest access is pending host approval.', 'PENDING_APPROVAL');
        }

        if (in_array($invitation->status, ['rejected', 'revoked'], true)) {
            self::denyGuestAccess(self::MSG_ACCESS_REVOKED, 'GUEST_ACCESS_REVOKED');
        }

        if ($invitation->status === 'expired') {
            self::denyGuestAccess(self::MSG_ACCESS_EXPIRED, 'GUEST_ACCESS_EXPIRED');
        }

        if ($invitation->status !== 'active') {
            self::denyGuestAccess('Guest access is not active.', 'GUEST_ACCESS_INACTIVE');
        }

        return $invitation;
    }

    /** @return never */
    public static function denyGuestAccess(string $message, string $code, int $status = 403, array $extra = []): void
    {
        throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(array_merge([
            'message' => $message,
            'code'    => $code,
        ], $extra), $status));
    }

    public static function assertCanWrite(User $user, string $action): void
    {
        if (! self::isGuest($user)) {
            return;
        }

        self::assertGuestAccessValid($user);

        GuestActivityService::logBlocked($user, $action);

        abort(403, 'Guest accounts cannot perform this action.');
    }

    public static function expireInvitation(GuestInvitation $invitation): void
    {
        if ($invitation->status === 'expired') {
            return;
        }

        $invitation->update(['status' => 'expired']);

        if ($invitation->guest_user_id) {
            self::removeGuestMembership($invitation);

            DB::table('personal_access_tokens')
                ->where('tokenable_id', $invitation->guest_user_id)
                ->where('tokenable_type', User::class)
                ->delete();

            GuestActivityService::log(
                $invitation,
                'access_expired',
                'Guest access expired automatically',
            );
        }
    }

    public static function removeGuestMembership(GuestInvitation $invitation): void
    {
        if (! $invitation->guest_user_id) {
            return;
        }

        CommunityMembership::query()
            ->where('user_id', $invitation->guest_user_id)
            ->where('community_id', $invitation->community_id)
            ->where('role', 'guest')
            ->delete();
    }

    public static function revokeTokensForUser(int $userId): void
    {
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->delete();
    }
}
