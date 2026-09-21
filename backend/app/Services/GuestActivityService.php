<?php

namespace App\Services;

use App\Models\GuestInvitation;
use App\Models\GuestActivityLog;
use App\Models\User;

class GuestActivityService
{
    /** Minutes before the same feature view can be logged again for one guest. */
    public const VIEW_THROTTLE_MINUTES = 10;

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

            if (in_array($action, [
                'login',
                'verification_complete',
                'access_rejected',
                'invitation_cancelled',
                'access_revoked',
                'access_extended',
                'access_activated',
                'blocked_action',
            ], true)) {
                ActivityLogService::user(
                    str_starts_with($action, 'guest_') ? $action : 'guest_'.$action,
                    $description ?: 'Guest '.$action,
                    'GuestInvitation',
                    (int) $invitation->id,
                    $action === 'blocked_action' ? 'warning' : 'info',
                    $invitation->guest_user_id ? (int) $invitation->guest_user_id : null,
                    [
                        'community_id' => $invitation->community_id,
                        'actor_type' => 'guest',
                        'actor_role' => 'guest',
                        'module' => 'Guest',
                        'status' => $action,
                    ],
                );
            }
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
        if (! GuestAccessService::isGuest($user)) {
            return;
        }

        $map = [
            'feed'        => ['action' => 'viewed_posts', 'description' => 'Viewed community feed'],
            'notices'     => ['action' => 'viewed_notices', 'description' => 'Viewed notices'],
            'events'      => ['action' => 'viewed_events', 'description' => 'Viewed events'],
            'marketplace' => ['action' => 'viewed_marketplace', 'description' => 'Viewed marketplace'],
            'businesses'  => ['action' => 'viewed_businesses', 'description' => 'Viewed businesses'],
            'wellness'    => ['action' => 'viewed_wellness', 'description' => 'Viewed wellness'],
            'services'    => ['action' => 'viewed_services', 'description' => 'Viewed community services'],
        ];

        $entry = $map[$feature] ?? [
            'action'      => "viewed_{$feature}",
            'description' => 'Viewed '.str_replace('_', ' ', $feature),
        ];

        $invitation = GuestInvitation::query()
            ->where('guest_user_id', $user->id)
            ->orderByDesc('id')
            ->first();

        if (! $invitation) {
            return;
        }

        $recentDuplicate = GuestActivityLog::query()
            ->where('guest_invitation_id', $invitation->id)
            ->where('action', $entry['action'])
            ->where('created_at', '>=', now()->subMinutes(self::VIEW_THROTTLE_MINUTES))
            ->exists();

        if ($recentDuplicate) {
            // Keep last_activity_at fresh without flooding the timeline.
            $invitation->update(['last_activity_at' => now()]);

            return;
        }

        self::log($invitation, $entry['action'], $entry['description'], ['feature' => $feature]);
    }
}
