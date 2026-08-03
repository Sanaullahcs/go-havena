<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\InviteCode;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InviteCodeService
{
    public static function generateUniqueCode(): string
    {
        do {
            $code = 'NBR-'.strtoupper(Str::random(4)).'-'.random_int(1000, 9999);
        } while (InviteCode::query()->where('code', $code)->exists());

        return $code;
    }

    public static function createForCommunity(
        int $communityId,
        ?int $createdBy = null,
        ?int $maxUses = 1,
        ?\DateTimeInterface $expiresAt = null,
        ?int $invitedUserId = null,
    ): InviteCode {
        return InviteCode::query()->create([
            'community_id'   => $communityId,
            'code'           => self::generateUniqueCode(),
            'created_by'     => $createdBy,
            'invited_user_id'=> $invitedUserId,
            'max_uses'       => $maxUses,
            'used_count'     => 0,
            'expires_at'     => $expiresAt,
        ]);
    }

    /**
     * When a resident redeems an admin member invite, merge the placeholder invited
     * account into the phone-authenticated user so invitation email/name/unit can be reused.
     *
     * @return array{display_name:string,email:string,unit_number:?string}|null
     */
    public static function claimInvitedMember(User $claimant, InviteCode $invite): ?array
    {
        $invitedUserId = (int) ($invite->invited_user_id ?? 0);
        if ($invitedUserId <= 0 || $invitedUserId === (int) $claimant->id) {
            return null;
        }

        $invited = User::query()->with('profile')->find($invitedUserId);
        if (! $invited || $invited->trashed() || ! self::isInvitedPlaceholderUser($invited)) {
            return null;
        }

        $invitedProfile = $invited->profile;
        $prefill = [
            'display_name' => $invitedProfile?->display_name ?: ($invited->name ?: ''),
            'email'        => ContactIdentityService::normalizeEmail($invited->email) ?? '',
            'unit_number'  => $invitedProfile?->unit_number,
        ];

        if ($prefill['email'] === '') {
            return null;
        }

        DB::transaction(function () use ($claimant, $invited, $prefill): void {
            CommunityMembership::query()
                ->where('user_id', $invited->id)
                ->delete();

            $invited->update([
                'email' => 'claimed-'.$invited->id.'@invited-claimed.havena.local',
            ]);
            $invited->delete();

            $claimant->update([
                'name'  => $prefill['display_name'] ?: $claimant->name,
                'email' => $prefill['email'],
            ]);

            $claimant->profile()->updateOrCreate(
                ['user_id' => $claimant->id],
                array_filter([
                    'display_name' => $prefill['display_name'] ?: null,
                    'unit_number'  => $prefill['unit_number'],
                ], fn ($value) => $value !== null && $value !== ''),
            );
        });

        $claimant->refresh()->load(['profile', 'memberships.community']);

        return $prefill;
    }

    private static function isInvitedPlaceholderUser(User $user): bool
    {
        if ($user->phone_verified_at || filled($user->phone)) {
            return false;
        }

        return ! ContactIdentityService::isPlaceholderEmail($user->email);
    }

    /** Value encoded in QR — mobile scanner accepts code or URL with invite_code param. */
    public static function qrPayload(string $code): string
    {
        return 'havena://join?invite_code='.urlencode($code);
    }
}
