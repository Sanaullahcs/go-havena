<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\GuestInvitation;
use App\Models\Profile;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GuestInvitationService
{
    public const MIN_ACCESS_MINUTES = 30;

    public const MAX_ACCESS_YEARS = 1;

    public const MIN_ACCESS_DURATION_MESSAGE = 'Guest access duration must be at least 30 minutes.';

    public const MAX_ACCESS_DURATION_MESSAGE = 'Guest access cannot exceed 1 year from the start date.';

    public const START_IN_PAST_MESSAGE = 'Start date cannot be earlier than the current date and time.';

    public const NAME_MIN = 2;

    public const NAME_MAX = 25;

    public const NAME_REQUIRED_MESSAGE = 'Guest name is required.';

    public const NAME_MIN_MESSAGE = 'Guest name must be at least 2 characters.';

    public const NAME_MAX_MESSAGE = 'Guest name must be 25 characters or less.';

    public static function latestAllowedEnd(\Illuminate\Support\Carbon $startsAt): \Illuminate\Support\Carbon
    {
        return $startsAt->copy()->addYearsNoOverflow(self::MAX_ACCESS_YEARS);
    }

    public static function accessWindowExceedsMax(
        \Illuminate\Support\Carbon $startsAt,
        \Illuminate\Support\Carbon $endsAt,
    ): bool {
        return $endsAt->gt(self::latestAllowedEnd($startsAt));
    }

    public static function earliestAllowedStart(): \Illuminate\Support\Carbon
    {
        return now()->timezone((string) config('app.timezone'))->startOfMinute();
    }

    public static function startIsInThePast(\Illuminate\Support\Carbon $startsAt): bool
    {
        return $startsAt->lt(self::earliestAllowedStart());
    }

    /** @return array<string, mixed> */
    public static function inviteFieldRules(): array
    {
        return [
            'guest_name'  => ['required', 'string', 'min:'.self::NAME_MIN, 'max:'.self::NAME_MAX, 'regex:/^[\p{L} .]+$/u'],
            'guest_email' => 'required|email|max:200',
            'guest_phone' => 'nullable|string|max:30',
            'starts_at'   => ['required', 'date', function (string $attribute, mixed $value, \Closure $fail): void {
                if (! is_string($value) || $value === '') {
                    return;
                }

                try {
                    $start = \Illuminate\Support\Carbon::parse($value);
                } catch (\Throwable) {
                    return;
                }

                if (self::startIsInThePast($start)) {
                    $fail(self::START_IN_PAST_MESSAGE);
                }
            }],
            'ends_at'     => ['required', 'date', 'after:starts_at', function (string $attribute, mixed $value, \Closure $fail): void {
                $startsAt = request()->input('starts_at');
                if (! is_string($startsAt) || $startsAt === '' || ! is_string($value) || $value === '') {
                    return;
                }

                try {
                    $start = \Illuminate\Support\Carbon::parse($startsAt);
                    $end = \Illuminate\Support\Carbon::parse($value);
                } catch (\Throwable) {
                    return;
                }

                if ($end->lt($start->copy()->addMinutes(self::MIN_ACCESS_MINUTES))) {
                    $fail(self::MIN_ACCESS_DURATION_MESSAGE);
                }

                if (self::accessWindowExceedsMax($start, $end)) {
                    $fail(self::MAX_ACCESS_DURATION_MESSAGE);
                }
            }],
        ];
    }

    /** @return array<string, string> */
    public static function inviteFieldMessages(): array
    {
        return [
            'guest_name.required' => self::NAME_REQUIRED_MESSAGE,
            'guest_name.min' => self::NAME_MIN_MESSAGE,
            'guest_name.max' => self::NAME_MAX_MESSAGE,
            'guest_name.regex' => 'Guest name can only contain letters, spaces, and full stops.',
            'permissions.required' => 'Please select at least one permission.',
            'ends_at.after' => self::MIN_ACCESS_DURATION_MESSAGE,
        ];
    }

    public static function generateInviteCode(): string
    {
        do {
            $code = 'GST-'.strtoupper(Str::random(4)).'-'.random_int(1000, 9999);
        } while (GuestInvitation::query()->where('invite_code', $code)->exists());

        return $code;
    }

    private static function generateCancelledInviteCode(int $invitationId): string
    {
        do {
            $code = 'CXL-'.$invitationId.'-'.strtoupper(Str::random(6));
        } while (GuestInvitation::query()->where('invite_code', $code)->exists());

        return $code;
    }

    public static function qrPayload(string $code): string
    {
        return 'havena://guest?invite_code='.urlencode($code);
    }

    public static function normalizeInviteCode(string $code): string
    {
        $trimmed = strtoupper(trim($code));
        $compact = preg_replace('/[\s\-]+/', '', $trimmed) ?? $trimmed;

        if (preg_match('/^GST([A-Z0-9]{4})(\d{4})$/', $compact, $matches)) {
            return 'GST-'.$matches[1].'-'.$matches[2];
        }

        return $trimmed;
    }

    /**
     * @param  array{guest_name:string,guest_email:string,guest_phone?:?string,starts_at:string,ends_at:string}  $data
     */
    public static function create(
        int $communityId,
        User $invitedBy,
        string $invitationType,
        array $data,
    ): GuestInvitation {
        $guestEmail = ContactIdentityService::normalizeEmail($data['guest_email'] ?? null);
        if (! $guestEmail || ContactIdentityService::isPlaceholderEmail($guestEmail)) {
            abort(422, 'A guest email address is required.');
        }

        $rawPhone = trim((string) ($data['guest_phone'] ?? ''));
        $phone = $rawPhone !== '' ? PhoneNormalizer::normalize($rawPhone) : null;
        if ($rawPhone !== '' && ! $phone) {
            abort(422, 'Enter a valid guest phone number.');
        }

        $startsAt = \Illuminate\Support\Carbon::parse($data['starts_at']);
        $endsAt = \Illuminate\Support\Carbon::parse($data['ends_at']);

        if (self::startIsInThePast($startsAt)) {
            abort(422, self::START_IN_PAST_MESSAGE);
        }

        if ($endsAt->lt($startsAt->copy()->addMinutes(self::MIN_ACCESS_MINUTES))) {
            abort(422, self::MIN_ACCESS_DURATION_MESSAGE);
        }

        ContactIdentityService::assertAvailableForGuestInvite($guestEmail, $phone);

        $code = self::generateInviteCode();
        $rawPermissions = $data['permissions'] ?? null;
        if (is_array($rawPermissions) && ! GuestAccessService::hasAtLeastOneEnabledPermission($rawPermissions)) {
            abort(422, 'Please select at least one permission.');
        }
        $permissions = GuestAccessService::normalizePermissions($rawPermissions);

        $invitation = GuestInvitation::query()->create([
            'community_id'       => $communityId,
            'invited_by_user_id' => $invitedBy->id,
            'invitation_type'    => $invitationType,
            'guest_name'         => trim($data['guest_name']),
            'guest_email'        => $guestEmail,
            'guest_phone'        => $phone,
            'invite_code'        => $code,
            'starts_at'          => $startsAt,
            'ends_at'            => $endsAt,
            'permissions'        => $permissions,
            'status'             => 'pending_verification',
        ]);

        ActivityLogService::user(
            'guest_invited',
            "Invited guest {$invitation->guest_name} ({$guestEmail})",
            'GuestInvitation',
            $invitation->id,
            'info',
            $invitedBy->id,
            ['invitation_type' => $invitationType],
        );

        app(LifecycleMailService::class)->guestInvited($invitation);

        return $invitation;
    }

    public static function verifyInviteForEmail(string $emailInput, string $inviteCode): GuestInvitation
    {
        $email = ContactIdentityService::normalizeEmail($emailInput);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            abort(422, 'Enter a valid email address.');
        }

        $invitation = GuestInvitation::query()
            ->where('invite_code', self::normalizeInviteCode($inviteCode))
            ->first();

        if (! $invitation) {
            abort(422, 'Invalid invite code.');
        }

        if (strtolower(trim((string) $invitation->guest_email)) !== $email) {
            abort(422, 'This invite code does not match your email address.');
        }

        if ($block = GuestAccessService::loginTerminationBlock($invitation)) {
            abort(422, $block['message']);
        }

        if (! in_array($invitation->status, ['pending_verification', 'pending_approval'], true)) {
            if ($invitation->status === 'active' && $invitation->guest_user_id) {
                return $invitation;
            }
            abort(422, 'This invitation is no longer valid.');
        }

        if ($invitation->ends_at->isPast()) {
            $invitation->update(['status' => 'expired']);
            abort(422, 'This invitation has expired.');
        }

        return $invitation;
    }

    public static function activateAfterVerification(GuestInvitation $invitation, User $guestUser): GuestInvitation
    {
        $invitation->update([
            'guest_user_id' => $guestUser->id,
            'status'        => 'pending_approval',
        ]);

        NotificationService::send(
            $invitation->invited_by_user_id,
            'info',
            'Guest approval needed',
            "{$invitation->guest_name} verified their invitation. Approve or reject guest access.",
            '/screens/guest-approvals',
            ['guest_invitation_id' => $invitation->id],
        );

        GuestActivityService::log($invitation, 'verification_complete', 'Guest completed phone and invite verification');

        return $invitation->fresh();
    }

    public static function approve(GuestInvitation $invitation, User $approver): GuestInvitation
    {
        if ($invitation->status !== 'pending_approval') {
            abort(422, 'This invitation is not awaiting approval.');
        }

        if (! $invitation->guest_user_id) {
            abort(422, 'Guest has not completed verification yet.');
        }

        $guestUser = User::query()->findOrFail($invitation->guest_user_id);

        return self::activateGuest($invitation, $guestUser, $approver->id);
    }

    public static function reject(GuestInvitation $invitation, User $rejector, ?string $reason = null): GuestInvitation
    {
        if ($invitation->status !== 'pending_approval') {
            abort(422, 'This invitation is not awaiting approval.');
        }

        $invitation->update([
            'status'           => 'rejected',
            'rejected_at'      => now(),
            'rejection_reason' => $reason,
        ]);

        if ($invitation->guest_user_id) {
            GuestAccessService::removeGuestMembership($invitation);
            NotificationService::send(
                $invitation->guest_user_id,
                'warning',
                'Guest access rejected',
                $reason
                    ? "Your guest access request was rejected. Reason: {$reason}"
                    : 'Your guest access request was rejected.',
            );
        }

        app(LifecycleMailService::class)->guestRejected($invitation->fresh(), $reason);

        GuestActivityService::log($invitation, 'access_rejected', 'Guest access rejected by resident', [
            'reason' => $reason,
        ]);

        return $invitation->fresh();
    }

    /**
     * Cancel a pending invite that the guest has not accepted yet.
     * The original invite code is replaced so it cannot be redeemed later.
     */
    public static function cancelPending(GuestInvitation $invitation, User $actor): GuestInvitation
    {
        if ($invitation->status !== 'pending_verification') {
            abort(422, 'Only pending invitations that have not been accepted can be deleted.');
        }

        $invitation->update([
            'status'             => 'cancelled',
            'invite_code'        => self::generateCancelledInviteCode((int) $invitation->id),
            'ends_at'            => now()->min($invitation->ends_at),
            'revoked_at'         => now(),
            'revoked_by_user_id' => $actor->id,
        ]);

        ActivityLogService::user(
            'guest_invite_cancelled',
            "Cancelled pending guest invitation for {$invitation->guest_name}",
            'GuestInvitation',
            $invitation->id,
            'warning',
            $actor->id,
        );

        GuestActivityService::log($invitation, 'invitation_cancelled', 'Pending guest invitation deleted');

        return $invitation->fresh();
    }

    public static function revoke(GuestInvitation $invitation, User $revokedBy): GuestInvitation
    {
        if (! in_array($invitation->status, ['active', 'pending_approval', 'pending_verification'], true)) {
            abort(422, 'This invitation cannot be revoked.');
        }

        $invitation->update([
            'status'             => 'revoked',
            'revoked_at'         => now(),
            'revoked_by_user_id' => $revokedBy->id,
        ]);

        if ($invitation->guest_user_id) {
            GuestAccessService::removeGuestMembership($invitation);

            GuestAccessService::revokeTokensForUser($invitation->guest_user_id);
            NotificationService::send(
                $invitation->guest_user_id,
                'warning',
                'Guest access revoked',
                'Your guest access to the community has been revoked.',
            );
        }

        GuestActivityService::log($invitation, 'access_revoked', 'Guest access revoked');

        return $invitation->fresh();
    }

    /**
     * @param  array{ends_at?:string}  $data
     */
    public static function extend(GuestInvitation $invitation, array $data, User $extendedBy): GuestInvitation
    {
        if (! in_array($invitation->status, ['active', 'expired'], true)) {
            abort(422, 'Only active or expired guest access can be extended.');
        }

        $endsAt = isset($data['ends_at'])
            ? \Illuminate\Support\Carbon::parse($data['ends_at'])
            : $invitation->ends_at->copy()->addDays(7);

        if ($endsAt->lte($invitation->starts_at)) {
            abort(422, 'Extended end date must be after start date.');
        }

        if (self::accessWindowExceedsMax($invitation->starts_at, $endsAt)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'ends_at' => [self::MAX_ACCESS_DURATION_MESSAGE],
            ]);
        }

        $invitation->update([
            'ends_at' => $endsAt,
            'status'  => 'active',
        ]);

        $invitation = $invitation->fresh();

        if (GuestAccessService::canRestoreReturningGuest($invitation)) {
            GuestAccessService::restoreGuestMembership($invitation);

            NotificationService::send(
                (int) $invitation->guest_user_id,
                'success',
                'Guest access extended',
                'Your guest access has been extended. You can sign in with your email — no invite code needed.',
            );
        }

        GuestActivityService::log($invitation, 'access_extended', 'Guest access extended', [
            'ends_at' => $endsAt->toIso8601String(),
            'by'      => $extendedBy->id,
        ]);

        return $invitation->fresh();
    }

    public static function findOrCreateGuestUser(GuestInvitation $invitation): User
    {
        $phone = $invitation->guest_phone;
        $email = ContactIdentityService::normalizeEmail($invitation->guest_email);
        $user = $email ? ContactIdentityService::findActiveUserByEmail($email) : null;

        if (! $user && $phone) {
            $user = PhoneNormalizer::findUserByPhone($phone);
        }

        if ($user) {
            return self::prepareExistingGuestUser($user, $invitation, $phone);
        }

        $user = User::query()->create([
            'name'              => $invitation->guest_name,
            'email'             => self::resolveGuestEmail($invitation),
            'phone'             => $phone,
            'email_verified_at' => now(),
            'phone_verified_at' => $phone ? now() : null,
            'password'          => Str::random(32),
            'status'            => 'active',
            'role'              => 'guest',
        ]);

        Profile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['display_name' => $invitation->guest_name],
        );

        return $user->fresh(['profile', 'memberships.community']);
    }

    private static function prepareExistingGuestUser(User $user, GuestInvitation $invitation, ?string $phone = null): User
    {
        if ($user->role === 'resident') {
            abort(422, 'This email is registered as a resident. Use resident login instead.');
        }

        if ($user->role !== 'guest' && $user->role !== null) {
            abort(422, 'This email belongs to a non-guest account.');
        }

        $updates = [
            'name'              => $invitation->guest_name,
            'email_verified_at' => now(),
            'phone_verified_at' => $phone ? now() : $user->phone_verified_at,
            'role'              => 'guest',
            'status'            => 'active',
        ];

        if ($phone) {
            $updates['phone'] = $phone;
        }

        $user->update($updates);

        Profile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['display_name' => $invitation->guest_name],
        );

        return $user->fresh(['profile', 'memberships.community']);
    }

    private static function resolveGuestEmail(GuestInvitation $invitation): string
    {
        $guestEmail = ContactIdentityService::normalizeEmail($invitation->guest_email);
        if ($guestEmail && ! ContactIdentityService::isPlaceholderEmail($guestEmail)) {
            return $guestEmail;
        }

        abort(422, 'A guest email address is required.');
    }

    private static function activateGuest(GuestInvitation $invitation, User $guestUser, int $activatedByUserId): GuestInvitation
    {
        CommunityMembership::query()->updateOrCreate(
            [
                'user_id'      => $guestUser->id,
                'community_id' => $invitation->community_id,
            ],
            [
                'role'   => 'guest',
                'status' => 'approved',
            ],
        );

        $invitation->update([
            'status'              => 'active',
            'guest_user_id'       => $guestUser->id,
            'approved_by_user_id' => $activatedByUserId,
            'approved_at'         => now(),
        ]);

        NotificationService::send(
            $guestUser->id,
            'success',
            'Guest access granted',
            'You now have guest access to the community.',
        );

        GuestActivityService::log($invitation, 'access_activated', 'Guest access activated');

        $activated = $invitation->fresh();
        app(LifecycleMailService::class)->guestApproved($activated);

        return $activated;
    }

    public static function formatInvitation(GuestInvitation $invitation, bool $includeQr = false): array
    {
        $invitation->loadMissing(['invitedBy.profile', 'guestUser.profile', 'community']);

        $data = [
            'id'               => $invitation->id,
            'community_id'     => $invitation->community_id,
            'community_name'   => $invitation->community?->name,
            'invitation_type'  => $invitation->invitation_type,
            'guest_name'       => $invitation->guest_name,
            'guest_email'      => $invitation->guest_email,
            'guest_phone'      => $invitation->guest_phone,
            'invite_code'      => $invitation->invite_code,
            'starts_at'        => $invitation->starts_at?->toIso8601String(),
            'ends_at'          => $invitation->ends_at?->toIso8601String(),
            'permissions'      => GuestAccessService::permissionsFromInvitation($invitation),
            'status'           => $invitation->status,
            'guest_user_id'    => $invitation->guest_user_id,
            'rejection_reason' => $invitation->rejection_reason,
            'last_activity_at' => $invitation->last_activity_at?->toIso8601String(),
            'created_at'       => $invitation->created_at?->toIso8601String(),
            'invited_by'       => $invitation->invitedBy ? [
                'id'           => $invitation->invitedBy->id,
                'name'         => $invitation->invitedBy->name,
                'display_name' => $invitation->invitedBy->profile?->display_name,
            ] : null,
            'resident'         => $invitation->invitation_type === 'resident' && $invitation->invitedBy
                ? self::formatResidentIdentity($invitation->invitedBy, (int) $invitation->community_id)
                : null,
            'guest_avatar_url' => self::resolveMediaUrl($invitation->guestUser?->profile?->avatar_url),
        ];

        if ($includeQr) {
            $data['invite_qr_value'] = self::qrPayload($invitation->invite_code);
        }

        return $data;
    }

    /**
     * @return array{id: int, name: string, display_name: ?string, unit_number: ?string, units: list<string>}
     */
    private static function formatResidentIdentity(\App\Models\User $user, int $communityId): array
    {
        $units = [];
        if ($communityId > 0) {
            $units = array_values(array_map(
                static fn (array $row) => (string) $row['unit_number'],
                app(\App\Services\UnitAssignmentService::class)->unitsBriefMapForUsers(
                    $communityId,
                    [(int) $user->id],
                )[(int) $user->id] ?? [],
            ));
        }

        if ($units === [] && $user->profile?->unit_number) {
            $units = [(string) $user->profile->unit_number];
        }

        return [
            'id' => (int) $user->id,
            'name' => (string) $user->name,
            'display_name' => $user->profile?->display_name,
            'unit_number' => $units[0] ?? null,
            'units' => $units,
        ];
    }

    private static function resolveMediaUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return url($url);
    }
}
