<?php

namespace App\Support;

class CommunityFeatureCatalog
{
    /**
     * Single source of truth for resident-facing community features.
     * Missing flags for a community default to enabled.
     *
     * @return list<array{
     *   key: string,
     *   label: string,
     *   description: string,
     *   group: string,
     *   group_label: string,
     *   resident_paths: list<string>,
     *   api_prefixes: list<string>
     * }>
     */
    public static function all(): array
    {
        return [
            self::feature('feed', 'Community Feed', 'Residents can view and post in the community feed.', 'community', 'Community', ['/feed'], ['api/v1/feed']),
            self::feature('notices', 'Notices', 'Residents can read community announcements on the notice board.', 'community', 'Community', ['/notices'], ['api/v1/notices']),
            self::feature('events', 'Events', 'Residents can view events, RSVP, and submit community events.', 'community', 'Community', ['/notices'], ['api/v1/events']),
            self::feature('alerts', 'Alerts', 'Residents can receive urgent community alerts.', 'community', 'Community', ['/notices'], []),
            self::feature('messages', 'Messages', 'Residents can send and receive direct messages with neighbors.', 'community', 'Community', ['/messages'], ['api/v1/conversations', 'api/v1/community-members']),
            self::feature('marketplace', 'Marketplace', 'Residents can browse listings, deals, and local businesses.', 'marketplace', 'Marketplace', ['/marketplace'], ['api/v1/listings', 'api/v1/deals', 'api/v1/businesses']),
            self::feature('amenities', 'Amenities', 'Residents can browse community amenities and facilities.', 'property', 'Property', ['/property'], ['api/v1/amenities']),
            self::feature('bookings', 'Bookings', 'Residents can reserve amenities and manage booking requests.', 'property', 'Property', ['/property'], ['api/v1/bookings']),
            self::feature('documents', 'Documents', 'Residents can open the community document library.', 'property', 'Property', ['/property'], ['api/v1/documents']),
            self::feature('community_rules', 'Community Rules', 'Residents can view and acknowledge community rules.', 'property', 'Property', ['/property'], ['api/v1/community-rules']),
            self::feature('wellness', 'Wellness', 'Residents can access wellness courses and lessons.', 'lifestyle', 'Lifestyle', ['/wellness'], ['api/v1/wellness']),
            self::feature('family', 'My Family', 'Residents can manage household members and family requests.', 'lifestyle', 'Lifestyle', [], ['api/v1/families', 'api/v1/family-join-requests', 'api/v1/family-add-member-requests']),
            self::feature('guest_invites', 'Guest Users', 'Residents can invite temporary guests and approve guest visits.', 'lifestyle', 'Lifestyle', [], ['api/v1/guest-invitations']),
            self::feature('points', 'Points & Rank', 'Residents can earn points, view rank, and see achievements.', 'lifestyle', 'Lifestyle', ['/profile'], ['api/v1/me/points', 'api/v1/me/achievements', 'api/v1/leaderboard']),
            self::feature('nearby_places', 'Nearby Places', 'Residents can discover nearby places around the community.', 'lifestyle', 'Lifestyle', [], ['api/v1/nearby-places']),
            self::feature('refer_and_earn', 'Refer & Earn', 'Referral rewards are available for this community.', 'growth', 'Growth', [], ['api/v1/admin/referrals']),
        ];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_values(array_map(static fn (array $feature) => $feature['key'], self::all()));
    }

    public static function isKnown(string $key): bool
    {
        return in_array($key, self::keys(), true);
    }

    /** @return array<string, bool> */
    public static function defaultFlags(): array
    {
        return array_fill_keys(self::keys(), true);
    }

    public static function definition(string $key): ?array
    {
        foreach (self::all() as $feature) {
            if ($feature['key'] === $key) {
                return $feature;
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $residentPaths
     * @param  list<string>  $apiPrefixes
     * @return array{key: string, label: string, description: string, group: string, group_label: string, resident_paths: list<string>, api_prefixes: list<string>}
     */
    private static function feature(
        string $key,
        string $label,
        string $description,
        string $group,
        string $groupLabel,
        array $residentPaths,
        array $apiPrefixes,
    ): array {
        return [
            'key' => $key,
            'label' => $label,
            'description' => $description,
            'group' => $group,
            'group_label' => $groupLabel,
            'resident_paths' => $residentPaths,
            'api_prefixes' => $apiPrefixes,
        ];
    }
}
