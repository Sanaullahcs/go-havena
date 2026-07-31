<?php

namespace App\Services;

use App\Models\GuestInvitation;
use App\Models\GuestActivityLog;
use App\Models\User;

class GuestActivityService
{
    public static function log(
        GuestInvitation $invitation,
        string $action,
        ?string $description = null,
        ?array $meta = null,
    ): void {
        try {
            GuestActivityLog::query()->create([
                'guest_invitation_id' => $invitation->id,
                'guest_user_id'       => $invitation->guest_user_id,
                'community_id'        => $invitation->community_id,
                'action'              => $action,
                'description'         => $description,
                'meta'                => $meta,
                'created_at'          => now(),
            ]);

            $invitation->update(['last_activity_at' => now()]);
        } catch (\Throwable) {
            // Never break main flow
        }
    }

    public static function logForUser(User $user, string $action, ?string $description = null, ?array $meta = null): void
    {
        if (! GuestAccessService::isGuest($user)) {
            return;
        }

        $invitation = GuestInvitation::query()
            ->where('guest_user_id', $user->id)
            ->orderByDesc('id')
            ->first();

        if ($invitation) {
            self::log($invitation, $action, $description, $meta);
        }
    }

    public static function logBlocked(User $user, string $action): void
    {
        self::logForUser($user, 'blocked_action', "Blocked action: {$action}", ['blocked_action' => $action]);
    }

    public static function logView(User $user, string $feature): void
    {
        $map = [
            'feed'        => 'viewed_posts',
            'notices'     => 'viewed_notices',
            'events'      => 'viewed_events',
            'marketplace' => 'viewed_marketplace',
            'businesses'  => 'viewed_businesses',
        ];

        $action = $map[$feature] ?? "viewed_{$feature}";
        self::logForUser($user, $action, "Viewed {$feature}");
    }
}
