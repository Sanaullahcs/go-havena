<?php

namespace App\Services;

use App\Models\User;
use App\Support\NearbyDiscovery;
use App\Support\OsmPlaceCategories;
use Illuminate\Support\Facades\DB;

class CommunityDirectoryService
{
    public const SECTIONS = ['health', 'burial', 'parking', 'clubs', 'food'];

    /** Nearby category used when a local essential is also published nearby. */
    public const SECTION_NEARBY_CATEGORY = [
        'health' => 'hospitals',
        'burial' => 'burial_places',
        'parking' => 'parking',
        'clubs' => 'clubs',
        'food' => 'restaurants',
    ];

    /** @var array<string, list<string>> */
    public const SECTION_CATEGORIES = [
        'health' => ['hospitals', 'pharmacies'],
        'burial' => ['burial_places'],
        'parking' => ['parking'],
        'clubs' => ['clubs'],
        'food' => ['restaurants', 'cafes'],
    ];

    /**
     * @param  list<array<string, mixed>>|array<string, list<array<string, mixed>>>  $data
     * @return list<array<string, mixed>>|array<string, list<array<string, mixed>>>
     */
    public function overlay(int $communityId, float $lat, float $lng, array $data, bool $grouped, ?string $category = null): array
    {
        $hidden = $this->hiddenPlaceIds($communityId);
        $custom = $this->customPlaces($communityId, $lat, $lng);

        if ($grouped) {
            $out = [];
            foreach ($data as $key => $rows) {
                $rows = is_array($rows) ? $rows : [];
                $out[$key] = $this->mergeList($rows, $this->forCategory($custom, (string) $key), $hidden);
            }

            return $out;
        }

        $rows = array_is_list($data) ? $data : [];

        return $this->mergeList($rows, $this->forCategory($custom, (string) $category), $hidden);
    }

    /**
     * @param  list<array<string, mixed>>  $osm
     * @param  list<array<string, mixed>>  $custom
     * @param  array<string, true>  $hidden
     * @return list<array<string, mixed>>
     */
    public function mergeList(array $osm, array $custom, array $hidden): array
    {
        $customNames = [];
        foreach ($custom as $place) {
            $customNames[$this->nameKey((string) ($place['name'] ?? ''))] = true;
        }

        $kept = [];
        foreach ($osm as $place) {
            if (! is_array($place)) {
                continue;
            }
            $id = (string) ($place['id'] ?? '');
            if ($id !== '' && isset($hidden[$id])) {
                continue;
            }
            if (isset($customNames[$this->nameKey((string) ($place['name'] ?? ''))])) {
                continue;
            }
            $kept[] = $place;
        }

        $merged = array_merge($custom, $kept);
        usort($merged, function ($a, $b) {
            $phone = (int) filled($b['phone'] ?? null) <=> (int) filled($a['phone'] ?? null);
            if ($phone !== 0) {
                return $phone;
            }

            return ((int) ($a['distance_meters'] ?? PHP_INT_MAX)) <=> ((int) ($b['distance_meters'] ?? PHP_INT_MAX));
        });

        return array_values($merged);
    }

    /** @return list<array<string, mixed>> */
    public function customPlaces(int $communityId, float $lat, float $lng): array
    {
        return DB::table('community_nearby_places')
            ->where('community_id', $communityId)
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => $this->formatCustomPlace($row, $lat, $lng))
            ->all();
    }

    /** @return array<string, true> */
    public function hiddenPlaceIds(int $communityId): array
    {
        $ids = [];
        foreach (DB::table('community_place_hides')->where('community_id', $communityId)->pluck('place_id') as $id) {
            $ids[(string) $id] = true;
        }

        return $ids;
    }

    /**
     * @param  list<string>  $categories
     * @return list<array<string, mixed>>
     */
    public function placesForCategories(int $communityId, float $lat, float $lng, array $categories, OsmNearbyPlacesService $osm, ?int $radiusMeters = null): array
    {
        $radius = OsmNearbyPlacesService::normalizeRadiusMeters($radiusMeters);
        $hidden = $this->hiddenPlaceIds($communityId);
        $custom = $this->customPlaces($communityId, $lat, $lng);
        $osmRows = [];
        $customRows = [];
        $seen = [];

        foreach ($categories as $category) {
            if (! OsmPlaceCategories::isValid($category)) {
                continue;
            }
            foreach ($osm->search($lat, $lng, $category, $communityId, $radius) as $place) {
                if (! $this->insideRadius($place, $radius)) {
                    continue;
                }
                $id = (string) ($place['id'] ?? '');
                if ($id === '' || isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
                $place['category'] = $category;
                $osmRows[] = $place;
            }
            foreach ($this->forCategory($custom, $category) as $place) {
                if (! $this->insideRadius($place, $radius)) {
                    continue;
                }
                $id = (string) ($place['id'] ?? '');
                if ($id === '' || isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
                $customRows[] = $place;
            }
        }

        return $this->mergeList($osmRows, $customRows, $hidden);
    }

    /** @param  array<string, mixed>  $place */
    private function insideRadius(array $place, int $radius): bool
    {
        $meters = $place['distance_meters'] ?? null;
        if ($meters === null) {
            return true;
        }

        return (int) $meters <= $radius;
    }

    public function normalizeSection(string $value): string
    {
        $value = trim($value);
        if ($value === '' || $value === '__new__') {
            return '';
        }

        $slug = strtolower($value);
        $slug = preg_replace('/[^a-z0-9]+/', '_', $slug) ?? '';
        $slug = trim($slug, '_');
        if (strlen($slug) > 40) {
            $slug = rtrim(substr($slug, 0, 40), '_');
        }

        foreach ([...self::SECTIONS, ...OsmPlaceCategories::KEYS] as $key) {
            if ($slug === $key || strtolower($value) === $key) {
                return $key;
            }
        }

        return $slug;
    }

    public function categoryLabel(string $key): string
    {
        return ucwords(str_replace('_', ' ', $key));
    }

    /**
     * Nearby categories plus any Local Essentials category already used here.
     *
     * @return list<array{value: string, label: string}>
     */
    public function listingCategories(int $communityId): array
    {
        $items = [];
        $push = function (string $key) use (&$items): void {
            $key = $this->normalizeSection($key);
            if ($key === '' || isset($items[$key])) {
                return;
            }
            $items[$key] = [
                'value' => $key,
                'label' => $this->categoryLabel($key),
            ];
        };

        foreach (self::SECTIONS as $section) {
            $push($section);
        }
        foreach (['restaurants', 'cafes', 'pharmacies', 'hospitals', 'gyms', 'gas_stations', 'parking', 'clubs', 'shopping'] as $key) {
            $push($key);
        }
        foreach (DB::table('community_essential_entries')->where('community_id', $communityId)->distinct()->pluck('section') as $section) {
            $push((string) $section);
        }
        foreach (DB::table('nearby_place_suggestions')->where('community_id', $communityId)->whereNotNull('essential_section')->distinct()->pluck('essential_section') as $section) {
            $push((string) $section);
        }

        return array_values($items);
    }

    /**
     * @param  list<array<string, mixed>>  $entries
     * @return list<array{key: string, label: string, entries: list<array<string, mixed>>, places: list<empty>}>
     */
    public function essentialSections(array $entries): array
    {
        $grouped = [];
        foreach (self::SECTIONS as $section) {
            $grouped[$section] = [];
        }
        foreach ($entries as $entry) {
            $key = (string) ($entry['section'] ?? '');
            if ($key === '') {
                continue;
            }
            $grouped[$key] ??= [];
            $grouped[$key][] = $entry;
        }

        $sections = [];
        foreach (self::SECTIONS as $section) {
            $sections[] = [
                'key' => $section,
                'label' => $this->categoryLabel($section),
                'entries' => $grouped[$section],
                'places' => [],
            ];
        }
        foreach ($grouped as $key => $rows) {
            if (in_array($key, self::SECTIONS, true) || $rows === []) {
                continue;
            }
            $sections[] = [
                'key' => $key,
                'label' => $this->categoryLabel($key),
                'entries' => $rows,
                'places' => [],
            ];
        }

        return $sections;
    }

    /** @return list<array<string, mixed>> */
    public function entries(int $communityId, ?string $section = null, ?float $originLat = null, ?float $originLng = null): array
    {
        $query = DB::table('community_essential_entries')
            ->where('community_id', $communityId)
            ->orderBy('title');

        if ($section) {
            $query->where('section', $section);
        }

        return $query->get()->map(function ($row) use ($originLat, $originLng) {
            $latitude = $row->latitude !== null ? (float) $row->latitude : null;
            $longitude = $row->longitude !== null ? (float) $row->longitude : null;
            $meters = null;
            if ($latitude !== null && $longitude !== null && $originLat !== null && $originLng !== null) {
                $meters = (int) round(NearbyDiscovery::metersBetween($originLat, $originLng, $latitude, $longitude));
            }

            return [
                'id' => (int) $row->id,
                'section' => (string) $row->section,
                'title' => (string) $row->title,
                'body' => $row->body,
                'description' => $row->description ?: $row->body,
                'phone' => $row->phone,
                'address' => $row->address,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'distance_meters' => $meters,
                'distance_km' => $meters === null ? null : round($meters / 1000, 2),
                'verified' => (bool) $row->verified,
            ];
        })->all();
    }

    /** @return list<array<string, mixed>> */
    public function suggestionsForCommunity(int $communityId, ?string $status = null): array
    {
        $query = DB::table('nearby_place_suggestions')
            ->where('community_id', $communityId)
            ->orderByDesc('id');

        if ($status) {
            $query->where('status', $status);
        }

        return $query->get()->map(fn ($row) => $this->formatSuggestion($row))->all();
    }

    /** @return list<array<string, mixed>> */
    public function suggestionsForUser(int $communityId, int $userId): array
    {
        return DB::table('nearby_place_suggestions')
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->orderByDesc('id')
            ->get()
            ->map(fn ($row) => $this->formatSuggestion($row))
            ->all();
    }

    public function notifyAdminsOfSuggestion(int $communityId, string $title, string $body): void
    {
        $adminIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->pluck('user_id');

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                (int) $adminId,
                'info',
                $title,
                $body,
                '/screens/property-management/available-services',
                ['kind' => 'nearby_suggestion', 'community_id' => $communityId],
                $communityId,
            );
        }
    }

    public function notifyResident(int $userId, int $communityId, string $title, string $body): void
    {
        NotificationService::send(
            $userId,
            'info',
            $title,
            $body,
            '/screens/discover',
            ['kind' => 'nearby_suggestion_reviewed', 'community_id' => $communityId],
            $communityId,
        );
    }

    public function userCanAccessCommunity(User $user, int $communityId): bool
    {
        if (AdminRoleService::isSystemAdmin($user)) {
            return true;
        }

        return DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();
    }

    /** @param  list<array<string, mixed>>  $places */
    private function forCategory(array $places, string $category): array
    {
        if ($category === '') {
            return $places;
        }

        return array_values(array_filter(
            $places,
            fn ($place) => ($place['category'] ?? '') === $category,
        ));
    }

    private function nameKey(string $name): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', strtolower(trim($name)));
    }

    /** @return array<string, mixed> */
    private function formatCustomPlace(object $row, float $originLat, float $originLng): array
    {
        $placeLat = $row->latitude !== null ? (float) $row->latitude : null;
        $placeLng = $row->longitude !== null ? (float) $row->longitude : null;
        $meters = null;
        if ($placeLat !== null && $placeLng !== null) {
            $meters = (int) round(NearbyDiscovery::metersBetween($originLat, $originLng, $placeLat, $placeLng));
        }

        return [
            'id' => 'community-'.$row->id,
            'name' => (string) $row->name,
            'category' => (string) $row->category,
            'address' => $row->address,
            'phone' => $row->phone,
            'description' => $row->description ?? null,
            'hours' => null,
            'website' => null,
            'latitude' => $placeLat,
            'longitude' => $placeLng,
            'distance_meters' => $meters ?? 0,
            'distance_km' => $meters === null ? null : round($meters / 1000, 2),
            'source' => (string) $row->source,
            'verified' => (bool) $row->verified,
        ];
    }

    /** @return array<string, mixed> */
    private function formatSuggestion(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'user_id' => (int) $row->user_id,
            'kind' => (string) $row->kind,
            'place_id' => $row->place_id,
            'name' => $row->name,
            'category' => $row->category,
            'address' => $row->address,
            'phone' => $row->phone,
            'note' => $row->note,
            'description' => $row->description ?? null,
            'latitude' => isset($row->latitude) && $row->latitude !== null ? (float) $row->latitude : null,
            'longitude' => isset($row->longitude) && $row->longitude !== null ? (float) $row->longitude : null,
            'essential_section' => $row->essential_section ?? null,
            'publish_nearby' => ! isset($row->publish_nearby) || (bool) $row->publish_nearby,
            'publish_essentials' => isset($row->publish_essentials) && (bool) $row->publish_essentials,
            'status' => (string) $row->status,
            'review_note' => $row->review_note,
            'created_at' => $row->created_at,
        ];
    }
}
