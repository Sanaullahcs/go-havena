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
            self::feature('complaints', 'Complaints', 'Residents can submit maintenance complaints for this community. Technical support stays available when this is off.', 'property', 'Property', [], []),
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

    public static function noticeIdFromActionUrl(?string $actionUrl): ?int
    {
        if (! $actionUrl) {
            return null;
        }

        if (preg_match('#/notices/(\d+)#', $actionUrl, $matches)) {
            return (int) $matches[1];
        }

        if (
            str_contains(strtolower($actionUrl), 'notice')
            && preg_match('#[?&](?:id|notice_id|noticeId)=(\d+)#', $actionUrl, $matches)
        ) {
            return (int) $matches[1];
        }

        return null;
    }

    /**
     * Feature keys a notification belongs to, using this catalog's route rules.
     * An empty list is not tied to a permission-based feature.
     * More than one key means the notification stays visible when any of those features is on.
     *
     * @param  array<int|string, string|null>  $noticeCategories  notice id => category
     * @return list<string>
     */
    public static function featureKeysForNotification(
        ?string $actionUrl,
        ?string $title,
        ?string $body,
        mixed $data,
        array $noticeCategories = [],
    ): array {
        $noticeId = self::noticeIdFromActionUrl($actionUrl);
        if ($noticeId !== null) {
            $category = $noticeCategories[$noticeId] ?? $noticeCategories[(string) $noticeId] ?? null;
            if (is_string($category) && $category !== '') {
                return [self::featureKeyForNoticeCategory($category)];
            }
        }

        $payload = self::notificationPayload($data);
        $pathKeys = self::featureKeysForActionUrl($actionUrl);
        if (count($pathKeys) === 1) {
            return $pathKeys;
        }

        $narrowed = self::contentFeatureFromCategory($payload['category'] ?? null)
            ?? self::contentFeatureFromText($title, $body)
            ?? self::featureKeyForNotificationKind($payload['kind'] ?? null);

        if ($narrowed !== null) {
            return [$narrowed];
        }

        return $pathKeys;
    }

    public static function featureKeyForNoticeCategory(?string $category): string
    {
        return match (strtolower((string) $category)) {
            'event' => 'events',
            'emergency', 'alert' => 'alerts',
            default => 'notices',
        };
    }

    /**
     * Ordered like the app route rules: the first matching destination wins.
     *
     * @return list<string>
     */
    public static function featureKeysForActionUrl(?string $actionUrl): array
    {
        $url = strtolower(trim((string) $actionUrl));
        if ($url === '') {
            return [];
        }

        if (str_contains($url, 'admin-content-review')) {
            if (str_contains($url, 'kind=event')) {
                return ['events'];
            }
            if (str_contains($url, 'kind=alert') || str_contains($url, 'kind=emergency')) {
                return ['alerts'];
            }
            if (str_contains($url, 'kind=notice')) {
                return ['notices'];
            }
        }

        foreach (self::notificationRouteRules() as [$pattern, $keys]) {
            if (preg_match($pattern, $url)) {
                return $keys;
            }
        }

        return [];
    }

    /**
     * Destinations that belong to a catalog feature. Shared content paths stay
     * on notices, events, and alerts together; a linked notice is split by category.
     *
     * @return list<array{0: string, 1: list<string>}>
     */
    private static function notificationRouteRules(): array
    {
        return [
            ['~admin-guests|invite-guest|guest-approvals|/admin/guests~', ['guest_invites']],
            ['~reservation-calender|reservation-calendar~', ['bookings']],
            ['~admin-amenities|admin-amenity-bills|amenity-bills|amenity-form|/amenity(?:/|$)|/admin/amenities|/admin/amenity-bills~', ['amenities']],
            ['~admin-bookings|my-booking|/admin/bookings~', ['bookings']],
            ['~listing-detail|community-listings|admin-listings|create-listing|create-deal|add-business|deal-details|provider-profile|business-deals|/marketplace|all-businesses|/deals|/admin/businesses|/admin/listings~', ['marketplace']],
            ['~refer-and-earn~', ['refer_and_earn']],
            ['~create-notice|/admin/notices~', ['notices']],
            ['~create-event|event-detail|admin-community-events|/admin/events~', ['events']],
            ['~create-alert|/admin/alerts~', ['alerts']],
            ['~create-post|community-feed|my-posts|/admin/feed|(?:^|/)feed(?:/|$)~', ['feed']],
            ['~community-rules|rule-form|rule-detail|/admin/community-rules~', ['community_rules']],
            ['~/documents|/admin/documents~', ['documents']],
            ['~/wellness|lessonvedio|wellness-detail~', ['wellness']],
            ['~my-family|pending-family~', ['family']],
            ['~/messages|/chat|/admin/messages|/conversations~', ['messages']],
            ['~nearby-place~', ['nearby_places']],
            ['~achievements|leaderboard|rank-details|points-history~', ['points']],
            ['~/notices|notice-detail|admin-content-review~', ['notices', 'events', 'alerts']],
        ];
    }

    /**
     * @return array{category: ?string, kind: ?string}
     */
    private static function notificationPayload(mixed $data): array
    {
        if (is_string($data) && $data !== '') {
            $decoded = json_decode($data, true);
            $data = is_array($decoded) ? $decoded : [];
        }

        if (! is_array($data)) {
            return ['category' => null, 'kind' => null];
        }

        $category = $data['category'] ?? $data['notice_category'] ?? null;
        $kind = $data['kind'] ?? null;

        return [
            'category' => is_string($category) ? $category : null,
            'kind' => is_string($kind) ? $kind : null,
        ];
    }

    private static function contentFeatureFromCategory(mixed $category): ?string
    {
        $category = strtolower(trim((string) $category));
        if (! in_array($category, ['event', 'emergency', 'alert', 'general', 'maintenance', 'security', 'finance', 'notice'], true)) {
            return null;
        }

        if ($category === 'notice') {
            return 'notices';
        }

        return self::featureKeyForNoticeCategory($category);
    }

    private static function contentFeatureFromText(?string $title, ?string $body): ?string
    {
        $title = strtolower(trim((string) $title));
        $body = strtolower((string) $body);

        if (
            in_array($title, ['new event', 'event update', 'event cancelled'], true)
            || str_contains($body, 'your event')
            || str_contains($body, 'left your event')
            || str_contains($body, 'joined your event')
            || str_contains($body, 'joined the waiting list')
        ) {
            return 'events';
        }

        if ($title === 'new alert' || str_contains($body, 'your alert')) {
            return 'alerts';
        }

        if ($title === 'new notice' || str_contains($body, 'your notice')) {
            return 'notices';
        }

        return null;
    }

    private static function featureKeyForNotificationKind(mixed $kind): ?string
    {
        $kind = strtolower(trim((string) $kind));
        if ($kind === '') {
            return null;
        }

        foreach ([
            ['prefixes' => ['post_', 'comment_'], 'exact' => [], 'key' => 'feed'],
            ['prefixes' => ['family_'], 'exact' => [], 'key' => 'family'],
            ['prefixes' => ['amenity_', 'shared_amenity'], 'exact' => [], 'key' => 'amenities'],
            ['prefixes' => ['guest_'], 'exact' => [], 'key' => 'guest_invites'],
            ['prefixes' => [], 'exact' => ['message'], 'key' => 'messages'],
        ] as $rule) {
            if (in_array($kind, $rule['exact'], true)) {
                return $rule['key'];
            }

            foreach ($rule['prefixes'] as $prefix) {
                if (str_starts_with($kind, $prefix)) {
                    return $rule['key'];
                }
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
