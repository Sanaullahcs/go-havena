<?php

namespace App\Services;

use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;

class ResidentInviteLookupService
{
    /** @var list<string> */
    public const ENROLLED_MEMBERSHIP_STATUSES = [
        'approved',
        'pending',
        'onboarding',
        'invitation_sent',
        'not_invited',
        'banned',
    ];

    /** @var list<string> */
    public const BLOCKING_MEMBERSHIP_STATUSES = [
        'approved',
        'pending',
        'banned',
        'not_invited',
    ];

    /**
     * @return array<string, mixed>
     */
    public function lookup(string $email, ?int $communityId = null): array
    {
        $normalizedEmail = ContactIdentityService::normalizeEmail($email);
        if (! $normalizedEmail || ! ContactIdentityService::hasValidLocalPart($normalizedEmail)) {
            return $this->emptyPayload();
        }

        $user = ContactIdentityService::findUserByEmail($normalizedEmail);
        if (! $user || $user->trashed()) {
            return $this->emptyPayload();
        }

        if (($user->role ?? '') !== 'resident') {
            return [
                'found' => true,
                'enrolled' => false,
                'auto_fill' => false,
                'invitable' => false,
                'user_id' => (int) $user->id,
                'name' => null,
                'phone' => null,
                'phone_display' => null,
                'message' => 'This email belongs to an existing account that is not a resident.',
            ];
        }

        $enrolled = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->whereIn('status', self::ENROLLED_MEMBERSHIP_STATUSES)
            ->exists();

        $profile = DB::table('profiles')->where('user_id', $user->id)->first();
        $name = trim((string) ($profile->display_name ?? ''));
        if ($name === '') {
            $name = trim((string) ($user->name ?? ''));
        }

        $phone = PhoneNormalizer::normalize((string) ($user->phone ?? ''));
        $phoneDisplay = $phone ? PhoneNormalizer::formatForDisplay($phone) : null;

        $autoFill = $enrolled && $name !== '' && $phone !== null;

        $payload = [
            'found' => true,
            'enrolled' => $enrolled,
            'auto_fill' => $autoFill,
            'invitable' => true,
            'user_id' => (int) $user->id,
            'name' => $name !== '' ? $name : null,
            'phone' => $phone,
            'phone_display' => $phoneDisplay,
            'message' => null,
        ];

        if ($communityId === null) {
            return $payload;
        }

        return array_merge($payload, $this->communityInviteState($user, $communityId));
    }

    /**
     * @return array<string, mixed>
     */
    private function communityInviteState(User $user, int $communityId): array
    {
        $blocking = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->whereIn('status', self::BLOCKING_MEMBERSHIP_STATUSES)
            ->exists();

        if ($blocking) {
            return [
                'invitable' => false,
                'message' => 'This resident already belongs to this community.',
            ];
        }

        $inactive = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'inactive')
            ->exists();

        if ($inactive) {
            return [
                'invitable' => true,
                'message' => 'This resident was previously a member here and can be re-invited.',
            ];
        }

        $pendingInvite = \App\Models\InviteCode::query()
            ->pendingForUser((int) $user->id)
            ->where('community_id', $communityId)
            ->exists();

        if ($pendingInvite) {
            return [
                'invitable' => false,
                'message' => 'This resident already has a pending invitation to this community.',
            ];
        }

        return [
            'invitable' => true,
            'message' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyPayload(): array
    {
        return [
            'found' => false,
            'enrolled' => false,
            'auto_fill' => false,
            'invitable' => true,
            'user_id' => null,
            'name' => null,
            'phone' => null,
            'phone_display' => null,
            'message' => null,
        ];
    }
}
