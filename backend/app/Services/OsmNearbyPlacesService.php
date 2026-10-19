<?php

namespace App\Services;

use App\Support\DemoNearbyPlaces;
use App\Support\NearbyDiscovery;
use App\Support\OsmPlaceCategories;
use App\Support\TlsCaBundle;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OsmNearbyPlacesService
{
    private bool $bundleFailed = false;

    private float $nominatimNotBefore = 0;

    public function bundleFailed(): bool
    {
        return $this->bundleFailed;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function forCommunity(int $communityId, string $category): array
    {
        $coords = NearbyDiscovery::communityCoordinates($communityId);
        if (! $coords) {
            return [];
        }

        return $this->search($coords[0], $coords[1], $category, $communityId);
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    public function allByCategory(float $lat, float $lng, ?int $communityId = null): array
    {
        $grouped = [];
        foreach (OsmPlaceCategories::KEYS as $category) {
            $grouped[$category] = $this->search($lat, $lng, $category, $communityId);
        }

        return $grouped;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function search(float $lat, float $lng, string $category, ?int $communityId = null): array
    {
        if (! OsmPlaceCategories::isValid($category)) {
            $category = 'restaurants';
        }

        $out = [];
        foreach ($this->bundle($lat, $lng, $communityId) as $place) {
            if (! in_array($category, $place['matched_categories'] ?? [], true)) {
                continue;
            }

            $row = $place;
            $row['category'] = $category;
            unset($row['matched_categories']);
            $out[] = $row;
        }

        return array_values($out);
    }

    public function shouldCallRemote(): bool
    {
        if (! app()->environment('testing')) {
            return true;
        }

        return (bool) config('osm.geocode_in_tests');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function bundle(float $lat, float $lng, ?int $communityId = null): array
    {
        if (! $this->shouldCallRemote()) {
            return [];
        }

        $ttl = (int) config('osm.cache_seconds', 3600);
        $cacheKey = sprintf(
            'osm_nearby:v9:%s:%s:%s',
            $communityId ?: 'none',
            round($lat, 4),
            round($lng, 4),
        );

        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            if (($cached['__failed'] ?? false) === true) {
                $this->bundleFailed = true;

                return [];
            }

            $this->bundleFailed = false;

            return $cached;
        }

        $places = $this->fetchPlaces($lat, $lng);
        if ($places === null || $places === []) {
            $fallback = DemoNearbyPlaces::forCommunity($communityId, $lat, $lng);
            if ($fallback !== []) {
                $this->bundleFailed = false;
                Cache::put($cacheKey, $fallback, $ttl);

                return $fallback;
            }
        }

        if ($places === null) {
            $this->bundleFailed = true;
            // Stop a slow Overpass outage from pinning every API worker.
            Cache::put($cacheKey, ['__failed' => true], 180);

            return [];
        }

        $this->bundleFailed = false;

        if ($places !== []) {
            Cache::put($cacheKey, $places, $ttl);
        }

        return $places;
    }

    /**
     * @return list<array<string, mixed>>|null  Null when every Overpass mirror failed.
     */
    private function fetchPlaces(float $lat, float $lng): ?array
    {
        $payload = $this->queryOverpass($this->overpassQuery($lat, $lng));
        if ($payload === null) {
            $fallback = $this->fetchNominatimPlaces($lat, $lng);

            return $fallback === [] ? null : $fallback;
        }

        $elements = is_array($payload['elements'] ?? null) ? $payload['elements'] : [];
        $radius = (int) config('osm.radius_meters', 3000);
        $places = [];
        $seen = [];

        foreach ($elements as $element) {
            if (! is_array($element)) {
                continue;
            }

            $place = $this->mapElement($element, $lat, $lng, $radius);
            if (! $place) {
                continue;
            }

            $id = (string) ($place['id'] ?? '');
            if ($id !== '' && isset($seen[$id])) {
                $places[$seen[$id]]['matched_categories'] = array_values(array_unique(array_merge(
                    $places[$seen[$id]]['matched_categories'] ?? [],
                    $place['matched_categories'] ?? [],
                )));

                continue;
            }

            if ($id !== '') {
                $seen[$id] = count($places);
            }
            $places[] = $place;
        }

        usort($places, fn ($a, $b) => $this->comparePlacesByPhoneThenDistance($a, $b));

        return array_values($places);
    }

    private function overpassQuery(float $lat, float $lng): string
    {
        $radius = (int) config('osm.radius_meters', 3000);
        $timeout = $this->overpassBudgetSeconds();
        $filters = [];

        foreach (OsmPlaceCategories::overpassRegexByKey() as $key => $regex) {
            $filters[] = "  node[\"{$key}\"~\"{$regex}\"](around:{$radius},{$lat},{$lng});";
            $filters[] = "  way[\"{$key}\"~\"{$regex}\"](around:{$radius},{$lat},{$lng});";
        }

        $union = implode("\n", $filters);

        return <<<QL
[out:json][timeout:{$timeout}];
(
{$union}
);
out center tags;
QL;
    }

    /** @return array<string, mixed>|null */
    private function queryOverpass(string $query): ?array
    {
        $urls = array_values(array_filter((array) config('osm.overpass_urls', [])));
        if ($urls === []) {
            return null;
        }

        $timeout = $this->overpassBudgetSeconds();
        $headers = [
            'User-Agent' => (string) config('osm.user_agent'),
            'Accept' => 'application/json',
        ];
        $lastEmpty = null;
        $anyFailure = false;
        $mirrors = array_slice($urls, 0, 2);
        $deadline = microtime(true) + ($timeout * max(1, count($mirrors))) + 2;

        foreach ($mirrors as $url) {
            $remaining = $deadline - microtime(true);
            if ($remaining < 3) {
                break;
            }

            try {
                $response = Http::withHeaders($headers)
                    ->withOptions(TlsCaBundle::httpOptions())
                    ->asForm()
                    ->connectTimeout(3)
                    ->timeout((int) min($timeout, floor($remaining)))
                    ->post((string) $url, [
                        'data' => $query,
                    ]);
            } catch (\Throwable $e) {
                $anyFailure = true;
                Log::warning('Overpass request failed', ['url' => $url, 'error' => $e->getMessage()]);

                continue;
            }

            if (! $response->successful() || ! is_array($response->json())) {
                $anyFailure = true;

                continue;
            }

            $json = $response->json();
            $remark = strtolower((string) ($json['remark'] ?? ''));
            if ($remark !== '' && (str_contains($remark, 'timed out') || str_contains($remark, 'runtime error') || str_contains($remark, 'error'))) {
                $anyFailure = true;
                Log::warning('Overpass query remark', ['url' => $url, 'remark' => $json['remark']]);

                continue;
            }

            if (count($json['elements'] ?? []) > 0) {
                return $json;
            }

            $lastEmpty = $json;
        }

        if (is_array($lastEmpty) && ! $anyFailure) {
            return $lastEmpty;
        }

        Log::warning('All Overpass mirrors failed for nearby places.');

        return null;
    }

    /** Wall-clock budget for one Overpass call. A hung mirror must not eat the request before Nominatim can answer. */
    private function overpassBudgetSeconds(): int
    {
        $configured = (int) config('osm.overpass_timeout', 18);

        return min(6, max(5, $configured));
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>|null
     */
    private function mapElement(array $element, float $originLat, float $originLng, int $radius): ?array
    {
        $placeLat = isset($element['lat']) ? (float) $element['lat'] : (float) ($element['center']['lat'] ?? 0);
        $placeLng = isset($element['lon']) ? (float) $element['lon'] : (float) ($element['center']['lon'] ?? 0);
        if ($placeLat === 0.0 && $placeLng === 0.0) {
            return null;
        }

        $meters = NearbyDiscovery::metersBetween($originLat, $originLng, $placeLat, $placeLng);
        if ($meters > $radius) {
            return null;
        }

        $tags = is_array($element['tags'] ?? null) ? $element['tags'] : [];
        $name = trim((string) ($tags['name'] ?? $tags['brand'] ?? $tags['operator'] ?? ''));
        if ($name === '') {
            return null;
        }

        $matched = OsmPlaceCategories::matchingKeys($tags);
        if ($matched === []) {
            return null;
        }

        $osmType = (string) ($element['type'] ?? 'node');
        $osmId = (int) ($element['id'] ?? 0);

        return [
            'id' => $osmType.'-'.$osmId,
            'name' => $name,
            'category' => $matched[0],
            'matched_categories' => $matched,
            'address' => $this->formatAddress($tags),
            'phone' => $this->extractPhone($tags),
            'hours' => $this->firstTag($tags, ['opening_hours', 'opening_hours:signed', 'opening_hours:covid19']),
            'website' => $this->normalizeUrl($this->firstTag($tags, ['website', 'contact:website', 'url'])),
            'cuisine' => $this->firstTag($tags, ['cuisine']),
            'brand' => $this->firstTag($tags, ['brand']),
            'operator' => $this->firstTag($tags, ['operator']),
            'email' => $this->firstTag($tags, ['email', 'contact:email']),
            'wheelchair' => $this->firstTag($tags, ['wheelchair']),
            'outdoor_seating' => $this->firstTag($tags, ['outdoor_seating']),
            'takeaway' => $this->firstTag($tags, ['takeaway']),
            'delivery' => $this->firstTag($tags, ['delivery']),
            'description' => $this->firstTag($tags, ['description']),
            'facebook' => $this->normalizeUrl($this->firstTag($tags, ['contact:facebook', 'facebook'])),
            'instagram' => $this->normalizeUrl($this->firstTag($tags, ['contact:instagram', 'instagram'])),
            'latitude' => round($placeLat, 7),
            'longitude' => round($placeLng, 7),
            'distance_meters' => (int) round($meters),
            'distance_km' => round($meters / 1000, 2),
        ];
    }

    /**
     * Overpass is often unreachable from the production host. Nominatim search
     * still returns named businesses inside the same radius.
     *
     * @return list<array<string, mixed>>
     */
    private function fetchNominatimPlaces(float $lat, float $lng): array
    {
        $radius = (int) config('osm.radius_meters', 3000);
        $searches = [
            ['restaurants', 'amenity', 'restaurant'],
            ['restaurants', 'amenity', 'fast_food'],
            ['cafes', 'amenity', 'cafe'],
            ['pharmacies', 'amenity', 'pharmacy'],
            ['banks', 'amenity', 'bank'],
            ['gyms', 'amenity', 'gym'],
            ['supermarkets', 'q', 'supermarket'],
            ['supermarkets', 'q', 'convenience store'],
        ];

        $places = [];
        $seen = [];
        foreach ($searches as [$category, $param, $value]) {
            foreach ($this->nominatimSearch($lat, $lng, $radius, $param, $value) as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $place = $this->mapNominatimRow($row, $lat, $lng, $radius, $category);
                if (! $place) {
                    continue;
                }
                $id = (string) $place['id'];
                if (isset($seen[$id])) {
                    $places[$seen[$id]]['matched_categories'] = array_values(array_unique(array_merge(
                        $places[$seen[$id]]['matched_categories'] ?? [],
                        $place['matched_categories'] ?? [],
                    )));

                    continue;
                }
                $seen[$id] = count($places);
                $places[] = $place;
            }
        }

        usort($places, fn ($a, $b) => $this->comparePlacesByPhoneThenDistance($a, $b));

        return array_values($places);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function nominatimSearch(float $lat, float $lng, int $radius, string $param, string $value): array
    {
        $latDelta = $radius / 111320;
        $lngDelta = $radius / (111320 * max(0.2, cos(deg2rad($lat))));
        $query = [
            'format' => 'jsonv2',
            'limit' => 20,
            'viewbox' => implode(',', [
                round($lng - $lngDelta, 6),
                round($lat + $latDelta, 6),
                round($lng + $lngDelta, 6),
                round($lat - $latDelta, 6),
            ]),
            'bounded' => 1,
            'addressdetails' => 1,
            'extratags' => 1,
            'namedetails' => 1,
            $param => $value,
        ];

        if (! app()->environment('testing')) {
            $wait = $this->nominatimNotBefore - microtime(true);
            if ($wait > 0) {
                usleep((int) round($wait * 1000000));
            }
        }

        try {
            $response = Http::withHeaders([
                'User-Agent' => (string) config('osm.user_agent'),
                'Accept' => 'application/json',
                'Accept-Language' => 'en',
            ])->withOptions(TlsCaBundle::httpOptions())
                ->connectTimeout(4)
                ->timeout(12)
                ->get((string) config('osm.nominatim_url'), $query);
        } catch (\Throwable $e) {
            Log::warning('Nominatim nearby search failed', ['error' => $e->getMessage()]);
            $this->nominatimNotBefore = microtime(true) + 1.1;

            return [];
        }

        $this->nominatimNotBefore = microtime(true) + 1.1;
        $json = $response->json();
        if (! $response->successful() || ! is_array($json) || ! array_is_list($json)) {
            return [];
        }

        return $json;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>|null
     */
    private function mapNominatimRow(array $row, float $originLat, float $originLng, int $radius, string $category): ?array
    {
        $class = strtolower((string) ($row['category'] ?? ''));
        $type = strtolower((string) ($row['type'] ?? ''));
        if (! $this->nominatimTypeMatches($category, $class, $type)) {
            return null;
        }

        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '' && is_array($row['namedetails'] ?? null)) {
            $name = trim((string) ($row['namedetails']['name'] ?? ''));
        }
        if ($name === '') {
            return null;
        }

        $placeLat = isset($row['lat']) ? (float) $row['lat'] : 0.0;
        $placeLng = isset($row['lon']) ? (float) $row['lon'] : 0.0;
        if ($placeLat === 0.0 && $placeLng === 0.0) {
            return null;
        }

        $meters = NearbyDiscovery::metersBetween($originLat, $originLng, $placeLat, $placeLng);
        if ($meters > $radius) {
            return null;
        }

        $extras = is_array($row['extratags'] ?? null) ? $row['extratags'] : [];
        $tags = $extras;
        if ($class !== '' && $type !== '') {
            $tags[$class] = $type;
        }
        $matched = OsmPlaceCategories::matchingKeys($tags);
        if (! in_array($category, $matched, true)) {
            $matched[] = $category;
        }

        return [
            'id' => 'nominatim-'.(string) ($row['place_id'] ?? md5($name.$placeLat.$placeLng)),
            'name' => $name,
            'category' => $category,
            'matched_categories' => array_values(array_unique($matched)),
            'address' => $this->formatNominatimAddress($row),
            'phone' => $this->extractPhone($extras),
            'hours' => $this->firstTag($extras, ['opening_hours']),
            'website' => $this->normalizeUrl($this->firstTag($extras, ['website', 'contact:website', 'url'])),
            'cuisine' => $this->firstTag($extras, ['cuisine']),
            'brand' => $this->firstTag($extras, ['brand']),
            'operator' => $this->firstTag($extras, ['operator']),
            'email' => $this->firstTag($extras, ['email', 'contact:email']),
            'wheelchair' => $this->firstTag($extras, ['wheelchair']),
            'outdoor_seating' => $this->firstTag($extras, ['outdoor_seating']),
            'takeaway' => $this->firstTag($extras, ['takeaway']),
            'delivery' => $this->firstTag($extras, ['delivery']),
            'description' => $this->firstTag($extras, ['description']),
            'facebook' => $this->normalizeUrl($this->firstTag($extras, ['contact:facebook', 'facebook'])),
            'instagram' => $this->normalizeUrl($this->firstTag($extras, ['contact:instagram', 'instagram'])),
            'latitude' => round($placeLat, 7),
            'longitude' => round($placeLng, 7),
            'distance_meters' => (int) round($meters),
            'distance_km' => round($meters / 1000, 2),
        ];
    }

    private function nominatimTypeMatches(string $category, string $class, string $type): bool
    {
        return match ($category) {
            'restaurants' => in_array($type, ['restaurant', 'fast_food', 'food_court'], true),
            'cafes' => in_array($type, ['cafe', 'ice_cream', 'coffee_shop'], true),
            'pharmacies' => in_array($type, ['pharmacy', 'chemist'], true),
            'banks' => $type === 'bank',
            'gyms' => in_array($type, ['gym', 'fitness_centre', 'fitness_center', 'sports_centre'], true),
            'supermarkets' => in_array($type, ['supermarket', 'convenience', 'grocery', 'greengrocer'], true),
            default => false,
        };
    }

    /** @param  array<string, mixed>  $row */
    private function formatNominatimAddress(array $row): ?string
    {
        $address = is_array($row['address'] ?? null) ? $row['address'] : [];
        $street = trim(implode(' ', array_filter([
            $address['house_number'] ?? null,
            $address['road'] ?? null,
        ], fn ($part) => filled($part))));
        $parts = array_values(array_filter([
            $street !== '' ? $street : null,
            $address['suburb'] ?? $address['neighbourhood'] ?? null,
            $address['town'] ?? $address['city'] ?? $address['village'] ?? null,
            $address['state'] ?? null,
            $address['postcode'] ?? null,
        ], fn ($part) => filled($part)));

        return $parts === [] ? null : implode(', ', $parts);
    }

    /** @param  array<string, mixed>  $tags */
    private function formatAddress(array $tags): ?string
    {
        if (filled($tags['addr:full'] ?? null)) {
            return trim((string) $tags['addr:full']);
        }

        $street = trim(implode(' ', array_filter([
            $tags['addr:housenumber'] ?? null,
            $tags['addr:street'] ?? null,
        ])));

        $parts = array_values(array_filter([
            $street !== '' ? $street : null,
            $tags['addr:unit'] ?? null,
            $tags['addr:place'] ?? null,
            $tags['addr:city'] ?? $tags['addr:town'] ?? $tags['addr:suburb'] ?? null,
            $tags['addr:state'] ?? null,
            $tags['addr:postcode'] ?? null,
        ], fn ($part) => filled($part)));

        return $parts === [] ? null : implode(', ', $parts);
    }

    /** @param  array<string, mixed>  $tags */
    private function extractPhone(array $tags): ?string
    {
        $preferred = [
            'phone',
            'contact:phone',
            'telephone',
            'phone:mobile',
            'mobile',
            'contact:mobile',
            'contact:cellphone',
            'phone:cell',
            'phone:national',
            'phone:US',
        ];

        $candidates = [];
        foreach ($preferred as $key) {
            if (filled($tags[$key] ?? null)) {
                $candidates[] = (string) $tags[$key];
            }
        }

        foreach ($tags as $key => $value) {
            if (! filled($value)) {
                continue;
            }
            $name = strtolower((string) $key);
            if (str_contains($name, 'fax')) {
                continue;
            }
            if (
                str_contains($name, 'phone')
                || str_contains($name, 'mobile')
                || str_contains($name, 'telephone')
                || str_contains($name, 'cellphone')
            ) {
                $candidates[] = (string) $value;
            }
        }

        foreach ($candidates as $raw) {
            $normalized = $this->normalizePhone($raw);
            if ($normalized) {
                return $normalized;
            }
        }

        return null;
    }

    private function normalizePhone(string $raw): ?string
    {
        $parts = preg_split('/[;|,\/]/', $raw) ?: [];
        $first = trim((string) ($parts[0] ?? ''));
        if ($first === '') {
            return null;
        }

        $digits = preg_replace('/[^\d+]/', '', $first) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = '+'.substr($digits, 2);
        }

        $count = preg_match_all('/\d/', $digits);
        if ($count < 7) {
            return null;
        }

        return $first;
    }

    /**
     * @param  array<string, mixed>  $tags
     * @param  list<string>  $keys
     */
    private function firstTag(array $tags, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (filled($tags[$key] ?? null)) {
                return trim((string) $tags[$key]);
            }
        }

        return null;
    }

    private function normalizeUrl(?string $value): ?string
    {
        if (! filled($value)) {
            return null;
        }

        $url = trim((string) $value);
        if ($url === '') {
            return null;
        }

        if (str_starts_with($url, '//')) {
            return 'https:'.$url;
        }

        if (! preg_match('/^[a-z][a-z0-9+.-]*:/i', $url)) {
            return 'https://'.$url;
        }

        return $url;
    }

    /**
     * @param  array<string, mixed>  $a
     * @param  array<string, mixed>  $b
     */
    private function comparePlacesByPhoneThenDistance(array $a, array $b): int
    {
        $phoneCmp = $this->placeHasPhone($b) <=> $this->placeHasPhone($a);
        if ($phoneCmp !== 0) {
            return $phoneCmp;
        }

        return ($a['distance_meters'] ?? 0) <=> ($b['distance_meters'] ?? 0);
    }

    /**
     * @param  array<string, mixed>  $place
     */
    private function placeHasPhone(array $place): bool
    {
        return trim((string) ($place['phone'] ?? '')) !== '';
    }
}
