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
    public static function generateInviteCode(): string
    {
        do {
            $code = 'GST-'.strtoupper(Str::random(4)).'-'.random_int(1000, 9999);
        } while (GuestInvitation::query()->where('invite_code', $code)->exists());

        return $code;
    }

    public static function qrPayload(string $code): string
    {
        return 'neighborlink://guest?invite_code='.urlencode($code);
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
     * @param  array{guest_name:string,guest_email?:?string,guest_phone:string,starts_at:string,ends_at:string}  $data
     */
    public static function create(
        int $communityId,
        User $invitedBy,
        string $invitationType,
        array $data,
    ): GuestInvitation {
        $phone = PhoneNormalizer::normalize($data['guest_phone']);
        if (! $phone) {
            abort(422, 'Enter a valid guest phone number.');
        }

        $startsAt = \Illuminate\Support\Carbon::parse($data['starts_at']);
        $endsAt = \Illuminate\Support\Carbon::parse($data['ends_at']);

        if ($endsAt->lte($startsAt)) {
            abort(422, 'End date must be after start date.');
        }

        $guestEmail = isset($data['guest_email']) ? trim((string) $data['guest_email']) : null;
        ContactIdentityService::assertAvailableForGuestInvite($guestEmail, $phone);

        $code = self::generateInviteCode();

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
            'permissions'        => GuestAccessService::normalizePermissions($data['permissions'] ?? null),
            'status'             => 'pending_verification',
        ]);

        ActivityLogService::user(
            'guest_invited',
            "Invited guest {$invitation->guest_name} ({$phone})",
            'GuestInvitation',
            $invitation->id,
            'info',
            $invitedBy->id,
            ['invitation_type' => $invitationType],
        );

        return $invitation;
    }

    public static function verifyInviteForPhone(string $phoneInput, string $inviteCode): GuestInvitation
    {
        $phone = PhoneNormalizer::normalize($phoneInput);
        if (! $phone) {
            abort(422, 'Enter a valid phone number.');
        }

        $invitation = GuestInvitation::query()
            ->where('invite_code', self::normalizeInviteCode($inviteCode))
            ->first();

        if (! $invitation) {
            abort(422, 'Invalid invite code.');
        }

        if ($invitation->guest_phone !== $phone) {
            abort(422, 'This invite code does not match your phone number.');
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
            GuestAccessService::revokeTokensForUser($invitation->guest_user_id);
            NotificationService::send(
                $invitation->guest_user_id,
                'warning',
                'Guest access rejected',
                'Your guest access request was rejected.',
            );
        }

        GuestActivityService::log($invitation, 'access_rejected', 'Guest access rejected by resident', [
            'reason' => $reason,
        ]);

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

        $invitation->update([
            'ends_at' => $endsAt,
            'status'  => 'active',
        ]);

        GuestActivityService::log($invitation, 'access_extended', 'Guest access extended', [
            'ends_at' => $endsAt->toIso8601String(),
            'by'      => $extendedBy->id,
        ]);

        return $invitation->fresh();
    }

    public static function findOrCreateGuestUser(GuestInvitation $invitation): User
    {
        $phone = $invitation->guest_phone;
        $user = PhoneNormalizer::findUserByPhone($phone);

        if ($user) {
            return self::prepareExistingGuestUser($user, $invitation);
        }

        if ($invitation->guest_email) {
            $byEmail = User::query()->where('email', trim($invitation->guest_email))->first();
            if ($byEmail && $byEmail->role === 'guest') {
                return self::prepareExistingGuestUser($byEmail, $invitation, $phone);
            }
        }

        $user = User::query()->create([
            'name'              => $invitation->guest_name,
            'email'             => self::resolveGuestEmail($invitation),
            'phone'             => $phone,
            'phone_verified_at' => now(),
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
            abort(422, 'This phone number is registered as a resident. Use resident login instead.');
        }

        if ($user->role !== 'guest' && $user->role !== null) {
            abort(422, 'This phone number belongs to a non-guest account.');
        }

        $updates = [
            'name'              => $invitation->guest_name,
            'phone_verified_at' => now(),
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
        $guestEmail = trim((string) ($invitation->guest_email ?? ''));
        if ($guestEmail !== '' && ! User::query()->where('email', $guestEmail)->exists()) {
            return $guestEmail;
        }

        $phoneEmail = str_replace('+', '', $invitation->guest_phone).'@guest.nbrlink.local';
        if (! User::query()->where('email', $phoneEmail)->exists()) {
            return $phoneEmail;
        }

        return str_replace('+', '', $invitation->guest_phone).'.'.$invitation->id.'@guest.nbrlink.local';
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

        return $invitation->fresh();
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
            'resident'         => $invitation->invitation_type === 'resident' && $invitation->invitedBy ? [
                'id'           => $invitation->invitedBy->id,
                'name'         => $invitation->invitedBy->name,
                'display_name' => $invitation->invitedBy->profile?->display_name,
                'unit_number'  => $invitation->invitedBy->profile?->unit_number,
            ] : null,
            'guest_avatar_url' => self::resolveMediaUrl($invitation->guestUser?->profile?->avatar_url),
        ];

        if ($includeQr) {
            $data['invite_qr_value'] = self::qrPayload($invitation->invite_code);
        }

        return $data;
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
