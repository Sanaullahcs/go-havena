<?php

namespace App\Services;

use App\Support\NearbyDiscovery;
use App\Support\OsmPlaceCategories;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OsmNearbyPlacesService
{
    private bool $bundleFailed = false;

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
            'osm_nearby:v6:%s:%s:%s',
            $communityId ?: 'none',
            round($lat, 4),
            round($lng, 4),
        );

        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            $this->bundleFailed = false;

            return $cached;
        }

        $places = $this->fetchPlaces($lat, $lng);
        if ($places === null) {
            $this->bundleFailed = true;

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
            return null;
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
        $filters = [];

        foreach (OsmPlaceCategories::overpassRegexByKey() as $key => $regex) {
            $filters[] = "  node[\"{$key}\"~\"{$regex}\"](around:{$radius},{$lat},{$lng});";
            $filters[] = "  way[\"{$key}\"~\"{$regex}\"](around:{$radius},{$lat},{$lng});";
        }

        $union = implode("\n", $filters);
        $timeout = (int) config('osm.overpass_timeout', 25);

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

        $timeout = (int) config('osm.overpass_timeout', 25);
        $headers = [
            'User-Agent' => (string) config('osm.user_agent'),
            'Accept' => 'application/json',
        ];
        $lastEmpty = null;
        $anyFailure = false;
        $started = microtime(true);

        foreach ($urls as $url) {
            if ((microtime(true) - $started) > ($timeout + 12)) {
                break;
            }

            try {
                $response = Http::withHeaders($headers)
                    ->asForm()
                    ->connectTimeout(5)
                    ->timeout($timeout + 5)
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
