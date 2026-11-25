<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * One welcome per approved resident membership, sent only after the member
 * has submitted their profile. Invitation and verification do not send it.
 */
class MemberWelcomeNotification
{
    public const KIND = 'member_welcome';

    public const HOME_URL = '/(tabs)/home';

    public static function sendForApprovedMemberships(User $user): void
    {
        if (! self::residentProfileIsComplete($user)) {
            return;
        }

        $user->loadMissing('memberships');

        foreach ($user->memberships as $membership) {
            if (($membership->status ?? '') !== 'approved' || ($membership->role ?? '') !== 'member') {
                continue;
            }
            self::sendOnce($user, $membership);
        }
    }

    public static function sendIfReady(User $user, CommunityMembership $membership): void
    {
        if (($membership->status ?? '') !== 'approved' || ($membership->role ?? '') !== 'member') {
            return;
        }

        if (! self::residentProfileIsComplete($user)) {
            return;
        }

        self::sendOnce($user, $membership);
    }

    /**
     * A provisioned invite stores a profile at the same moment it is created.
     * Completing the profile form updates that row afterwards.
     */
    public static function residentProfileIsComplete(User $user): bool
    {
        if (($user->role ?? '') !== 'resident') {
            return false;
        }

        $user->load('profile');
        $profile = $user->profile;
        if (! $profile || ! filled($profile->display_name) || ! $profile->created_at || ! $profile->updated_at) {
            return false;
        }

        return $profile->updated_at->greaterThan($profile->created_at->copy()->addSeconds(2));
    }

    private static function sendOnce(User $user, CommunityMembership $membership): void
    {
        $communityId = (int) $membership->community_id;
        if ($communityId < 1) {
            return;
        }

        DB::transaction(function () use ($user, $membership, $communityId) {
            CommunityMembership::query()->whereKey($membership->id)->lockForUpdate()->first();

            $alreadySent = DB::table('app_notifications')
                ->where('user_id', $user->id)
                ->where('data->kind', self::KIND)
                ->where('data->community_id', $communityId)
                ->lockForUpdate()
                ->exists();

            if ($alreadySent) {
                return;
            }

            $membership->loadMissing('community');
            $communityName = trim((string) ($membership->community?->name ?? ''));
            if ($communityName === '') {
                $communityName = 'your community';
            }

            NotificationService::send(
                (int) $user->id,
                'success',
                "Welcome to {$communityName}!",
                "You're now a member of {$communityName}! Explore your community and stay connected with your neighbors.",
                self::HOME_URL,
                [
                    'kind'         => self::KIND,
                    'community_id' => $communityId,
                ],
            );
        });
    }
}
