<?php

namespace App\Services;

use App\Exceptions\BillingException;
use App\Models\Community;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ResidentInviteService
{
    /**
     * Create a resident invitation the same way the single Invite Member action does.
     * Role is always a normal resident unless the existing single-invite form asks otherwise.
     *
     * @return array<string, mixed>
     */
    public function send(
        User $actor,
        int $communityId,
        string $name,
        string $email,
        string $phone,
        string $unitNumber,
        ?string $residenceType = null,
        string $role = 'member',
    ): array {
        $normalizedPhone = PhoneNormalizer::accept($phone);
        if (! $normalizedPhone) {
            throw ValidationException::withMessages([
                'phone' => ['Phone number is invalid'],
            ]);
        }

        $billing = app(CommunityBillingService::class);
        if ($role !== 'admin') {
            $billing->releaseExpiredReservations($communityId);
            $billing->assertCanAllocateSeat($communityId);
        }

        $existingUser = ContactIdentityService::findUserByEmail($email);
        if ($existingUser) {
            $inactiveMembership = DB::table('community_memberships')
                ->where('user_id', $existingUser->id)
                ->where('community_id', $communityId)
                ->where('status', 'inactive')
                ->first();

            if ($inactiveMembership) {
                return $this->reactivateInactiveMember(
                    $actor,
                    $communityId,
                    $existingUser,
                    $name,
                    $normalizedPhone,
                    $unitNumber,
                    $residenceType,
                    $role,
                );
            }
        }

        ContactIdentityService::assertAvailableForRegistration($email, $normalizedPhone);

        $password = \Illuminate\Support\Str::random(12);

        try {
            $userId = DB::table('users')->insertGetId([
                'name' => $name,
                'email' => $email,
                'phone' => $normalizedPhone,
                'email_verified_at' => null,
                'phone_verified_at' => null,
                'password' => Hash::make($password),
                'role' => $role === 'admin' ? 'community_admin' : 'resident',
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException $e) {
            $sql = $e->getMessage();
            if (str_contains($sql, 'users_phone_unique')) {
                ContactIdentityService::failDuplicate('phone', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
            }
            if (str_contains($sql, 'users_email_unique')) {
                ContactIdentityService::failDuplicate('email', ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
            }

            throw $e;
        }

        $profile = [
            'user_id' => $userId,
            'display_name' => $name,
            'unit_number' => $unitNumber,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if ($residenceType !== null && $residenceType !== '') {
            $profile['residence_type'] = $residenceType;
        }
        DB::table('profiles')->insert($profile);

        $invite = InviteCodeService::createForCommunity(
            communityId: $communityId,
            createdBy: $actor->id,
            maxUses: 1,
            expiresAt: now()->addDays(30),
            invitedUserId: $userId,
        );

        if ($role !== 'admin') {
            $billing->reserveSeatForInvite($communityId, $userId, $invite);
        }

        $communityName = Community::query()->where('id', $communityId)->value('name') ?? 'your community';
        NotificationService::send(
            $userId,
            'info',
            'Community invitation',
            "You have been invited to {$communityName}. Open Havena and enter invite code {$invite->code} or scan your QR invite.",
        );

        ActivityLogService::user('member_invited', "Invited new member: {$name} ({$email})", 'User', $userId);

        $community = Community::query()->find($communityId);
        $invitee = User::query()->find($userId);
        $emailSent = false;
        if ($community && $invitee) {
            $emailSent = app(LifecycleMailService::class)->residentInvited(
                $invitee,
                $community,
                $invite,
                $actor,
            );
        }

        return [
            'id' => $userId,
            'temp_password' => $password,
            'invite_code' => $invite->code,
            'invite_qr_value' => InviteCodeService::qrPayload($invite->code),
            'community_name' => $communityName,
            'expires_at' => $invite->expires_at?->toIso8601String(),
            'member_name' => $name,
            'member_email' => $email,
            'email_sent' => $emailSent,
        ];
    }

    /**
     * Add a resident from batch upload without creating an invite or sending email.
     * They stay Not Invited until the admin sends an invitation.
     *
     * @return array{id: int, member_name: string, member_email: string}
     */
    public function prepare(
        User $actor,
        int $communityId,
        string $name,
        string $email,
        string $phone,
        string $unitNumber,
        ?string $residenceType = null,
    ): array {
        $normalizedPhone = PhoneNormalizer::accept($phone);
        if (! $normalizedPhone) {
            throw ValidationException::withMessages([
                'phone' => ['Phone number is invalid'],
            ]);
        }

        $existingUser = ContactIdentityService::findUserByEmail($email);
        if ($existingUser) {
            $inactiveMembership = DB::table('community_memberships')
                ->where('user_id', $existingUser->id)
                ->where('community_id', $communityId)
                ->where('status', 'inactive')
                ->first();

            if ($inactiveMembership) {
                ContactIdentityService::assertAvailableForRegistration(
                    null,
                    $normalizedPhone,
                    (int) $existingUser->id,
                );

                $billing = app(CommunityBillingService::class);
                $billing->releaseExpiredReservations($communityId);
                $billing->assertCanAllocateSeat($communityId);

                DB::table('users')->where('id', $existingUser->id)->update([
                    'name' => $name,
                    'phone' => $normalizedPhone,
                    'status' => 'active',
                    'deleted_at' => null,
                    'suspension_reason' => null,
                    'updated_at' => now(),
                ]);

                $profileUpdate = [
                    'display_name' => $name,
                    'unit_number' => $unitNumber,
                    'updated_at' => now(),
                ];
                if ($residenceType !== null && $residenceType !== '') {
                    $profileUpdate['residence_type'] = $residenceType;
                }

                $hasProfile = DB::table('profiles')->where('user_id', $existingUser->id)->exists();
                if ($hasProfile) {
                    DB::table('profiles')->where('user_id', $existingUser->id)->update($profileUpdate);
                } else {
                    DB::table('profiles')->insert(array_merge($profileUpdate, [
                        'user_id' => $existingUser->id,
                        'created_at' => now(),
                    ]));
                }

                DB::table('community_memberships')
                    ->where('user_id', $existingUser->id)
                    ->where('community_id', $communityId)
                    ->update([
                        'status' => 'not_invited',
                        'role' => 'member',
                        'rejection_reason' => null,
                        'rejected_by' => null,
                        'updated_at' => now(),
                    ]);

                $billing->reserveSeatForInvite($communityId, $existingUser->id, null);

                ActivityLogService::recordStatusChange(
                    'member_reactivated',
                    'User',
                    $existingUser->id,
                    'inactive',
                    'not_invited',
                    'Status',
                    $name,
                    $existingUser->id,
                    ['related_item' => $name, 'via' => 'batch_prepare'],
                );

                return [
                    'id' => $existingUser->id,
                    'member_name' => $name,
                    'member_email' => $existingUser->email,
                    'reactivated' => true,
                ];
            }
        }

        ContactIdentityService::assertAvailableForRegistration($email, $normalizedPhone);

        $billing = app(CommunityBillingService::class);
        $billing->releaseExpiredReservations($communityId);
        $billing->assertCanAllocateSeat($communityId);

        try {
            $userId = DB::table('users')->insertGetId([
                'name' => $name,
                'email' => $email,
                'phone' => $normalizedPhone,
                'email_verified_at' => null,
                'phone_verified_at' => null,
                'password' => Hash::make(\Illuminate\Support\Str::random(12)),
                'role' => 'resident',
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException $e) {
            $sql = $e->getMessage();
            if (str_contains($sql, 'users_phone_unique')) {
                ContactIdentityService::failDuplicate('phone', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
            }
            if (str_contains($sql, 'users_email_unique')) {
                ContactIdentityService::failDuplicate('email', ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
            }

            throw $e;
        }

        $profile = [
            'user_id' => $userId,
            'display_name' => $name,
            'unit_number' => $unitNumber,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if ($residenceType !== null && $residenceType !== '') {
            $profile['residence_type'] = $residenceType;
        }
        DB::table('profiles')->insert($profile);

        DB::table('community_memberships')->insert([
            'user_id' => $userId,
            'community_id' => $communityId,
            'role' => 'member',
            'status' => 'not_invited',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $billing->reserveSeatForInvite($communityId, $userId, null);

        ActivityLogService::user(
            'member_prepared',
            "Added resident without sending an invitation: {$name} ({$email})",
            'User',
            $userId,
        );

        return [
            'id' => $userId,
            'member_name' => $name,
            'member_email' => $email,
        ];
    }

    /**
     * Reuse an inactive community membership instead of creating a duplicate user.
     *
     * @return array<string, mixed>
     */
    private function reactivateInactiveMember(
        User $actor,
        int $communityId,
        User $existingUser,
        string $name,
        string $normalizedPhone,
        string $unitNumber,
        ?string $residenceType,
        string $role,
    ): array {
        ContactIdentityService::assertAvailableForRegistration(
            null,
            $normalizedPhone,
            (int) $existingUser->id,
        );

        $billing = app(CommunityBillingService::class);
        if ($role !== 'admin') {
            $billing->releaseExpiredReservations($communityId);
            $billing->assertCanAllocateSeat($communityId);
        }

        DB::table('users')->where('id', $existingUser->id)->update([
            'name' => $name,
            'phone' => $normalizedPhone,
            'status' => 'active',
            'deleted_at' => null,
            'suspension_reason' => null,
            'updated_at' => now(),
        ]);

        $profileUpdate = [
            'display_name' => $name,
            'unit_number' => $unitNumber,
            'updated_at' => now(),
        ];
        if ($residenceType !== null && $residenceType !== '') {
            $profileUpdate['residence_type'] = $residenceType;
        }

        $hasProfile = DB::table('profiles')->where('user_id', $existingUser->id)->exists();
        if ($hasProfile) {
            DB::table('profiles')->where('user_id', $existingUser->id)->update($profileUpdate);
        } else {
            DB::table('profiles')->insert(array_merge($profileUpdate, [
                'user_id' => $existingUser->id,
                'created_at' => now(),
            ]));
        }

        DB::table('community_memberships')
            ->where('user_id', $existingUser->id)
            ->where('community_id', $communityId)
            ->update([
                'status' => 'approved',
                'role' => $role === 'admin' ? 'admin' : 'member',
                'rejection_reason' => null,
                'rejected_by' => null,
                'updated_at' => now(),
            ]);

        $invite = InviteCodeService::createForCommunity(
            communityId: $communityId,
            createdBy: $actor->id,
            maxUses: 1,
            expiresAt: now()->addDays(30),
            invitedUserId: $existingUser->id,
        );

        if ($role !== 'admin') {
            $billing->reserveSeatForInvite($communityId, $existingUser->id, $invite);
        }

        $communityName = Community::query()->where('id', $communityId)->value('name') ?? 'your community';
        NotificationService::send(
            $existingUser->id,
            'success',
            'Membership restored',
            "Your membership in {$communityName} has been restored. You can sign in with your existing account.",
        );

        ActivityLogService::recordStatusChange(
            'member_reactivated',
            'User',
            $existingUser->id,
            'inactive',
            'approved',
            'Status',
            $name,
            $existingUser->id,
            ['related_item' => $name, 'via' => 'invite'],
        );

        $community = Community::query()->find($communityId);
        $invitee = User::query()->find($existingUser->id);
        $emailSent = false;
        if ($community && $invitee) {
            $emailSent = app(LifecycleMailService::class)->residentApproved($invitee, $community);
        }

        return [
            'id' => $existingUser->id,
            'temp_password' => null,
            'invite_code' => $invite->code,
            'invite_qr_value' => InviteCodeService::qrPayload($invite->code),
            'community_name' => $communityName,
            'expires_at' => $invite->expires_at?->toIso8601String(),
            'member_name' => $name,
            'member_email' => $existingUser->email,
            'email_sent' => $emailSent,
            'reactivated' => true,
        ];
    }

    public static function failureMessage(\Throwable $e): string
    {
        if ($e instanceof ValidationException) {
            $messages = collect($e->errors())->flatten()->filter()->values();
            $first = (string) ($messages->first() ?? '');
            if (str_contains(strtolower($first), 'email')) {
                return 'Email already exists';
            }
            if (str_contains(strtolower($first), 'phone')) {
                return str_contains(strtolower($first), 'invalid') ? 'Phone number is invalid' : 'Phone number already exists';
            }

            return $first !== '' ? $first : 'This row could not be invited.';
        }

        if ($e instanceof BillingException) {
            return $e->getMessage();
        }

        return 'This row could not be invited.';
    }
}
