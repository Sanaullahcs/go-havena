<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OsmGeocodingService
{
    public function shouldCallRemote(): bool
    {
        if (! app()->environment('testing')) {
            return true;
        }

        return (bool) config('osm.geocode_in_tests');
    }

    /**
     * Photon address suggestions. Do not typeahead against Nominatim.
     *
     * @return list<array{label: string, address: string, latitude: float, longitude: float}>
     */
    public function suggest(string $query, int $limit = 6): array
    {
        $query = trim($query);
        if (strlen($query) < 3 || ! $this->shouldCallRemote()) {
            return [];
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(6)
                ->get((string) config('osm.photon_url'), [
                    'q' => $query,
                    'limit' => $limit,
                    'lang' => 'en',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Photon suggest failed', ['error' => $e->getMessage()]);

            return [];
        }

        if (! $response->successful()) {
            return [];
        }

        $features = $response->json('features');
        if (! is_array($features)) {
            return [];
        }

        $out = [];
        foreach ($features as $feature) {
            if (! is_array($feature)) {
                continue;
            }
            $row = $this->mapPhotonFeature($feature);
            if ($row) {
                $out[] = $row;
            }
        }

        return $out;
    }

    /**
     * One-shot Nominatim geocode when the user typed an address but never picked a suggestion.
     *
     * @return array{latitude: float, longitude: float}|null
     */
    public function geocode(string $address): ?array
    {
        $address = trim($address);
        if ($address === '' || ! $this->shouldCallRemote()) {
            return null;
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(8)
                ->get((string) config('osm.nominatim_url'), [
                    'q' => $address,
                    'format' => 'json',
                    'limit' => 1,
                    'addressdetails' => 0,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Nominatim geocode failed', ['error' => $e->getMessage()]);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $first = $response->json('0');
        if (! is_array($first) || ! isset($first['lat'], $first['lon'])) {
            return null;
        }

        return [
            'latitude' => round((float) $first['lat'], 7),
            'longitude' => round((float) $first['lon'], 7),
        ];
    }

    /**
     * One-shot Nominatim reverse geocode when the user moves the map pin.
     *
     * @return array{address: string, latitude: float, longitude: float}|null
     */
    public function reverse(float $latitude, float $longitude): ?array
    {
        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            return null;
        }

        if (! $this->shouldCallRemote()) {
            return null;
        }

        try {
            $response = Http::withHeaders($this->headers())
                ->timeout(8)
                ->get((string) config('osm.nominatim_reverse_url'), [
                    'lat' => $latitude,
                    'lon' => $longitude,
                    'format' => 'json',
                    'addressdetails' => 1,
                    'zoom' => 18,
                    'accept-language' => 'en',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Nominatim reverse failed', ['error' => $e->getMessage()]);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            return null;
        }

        $address = $this->formatNominatimAddress($payload);
        if ($address === '') {
            return null;
        }

        $lat = isset($payload['lat']) ? (float) $payload['lat'] : $latitude;
        $lng = isset($payload['lon']) ? (float) $payload['lon'] : $longitude;

        return [
            'address' => $address,
            'latitude' => round($lat, 7),
            'longitude' => round($lng, 7),
        ];
    }

    /**
     * @param  array<string, mixed>  $feature
     * @return array{label: string, address: string, latitude: float, longitude: float}|null
     */
    private function mapPhotonFeature(array $feature): ?array
    {
        $coords = $feature['geometry']['coordinates'] ?? null;
        if (! is_array($coords) || count($coords) < 2) {
            return null;
        }

        $lng = (float) $coords[0];
        $lat = (float) $coords[1];
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return null;
        }

        $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
        $label = $this->formatPhotonLabel($props);
        if ($label === '') {
            return null;
        }

        return [
            'label' => $label,
            'address' => $label,
            'latitude' => round($lat, 7),
            'longitude' => round($lng, 7),
        ];
    }

    /** @param  array<string, mixed>  $props */
    private function formatPhotonLabel(array $props): string
    {
        $street = trim(implode(' ', array_filter([
            $props['housenumber'] ?? null,
            $props['street'] ?? null,
        ], fn ($part) => filled($part))));

        $parts = array_values(array_filter([
            $props['name'] ?? null,
            $street !== '' ? $street : null,
            $props['district'] ?? $props['locality'] ?? null,
            $props['city'] ?? $props['town'] ?? $props['village'] ?? null,
            $props['state'] ?? null,
            $props['postcode'] ?? null,
            $props['country'] ?? null,
        ], fn ($part) => filled($part)));

        $unique = [];
        foreach ($parts as $part) {
            $text = trim((string) $part);
            if ($text !== '' && ! in_array($text, $unique, true)) {
                $unique[] = $text;
            }
        }

        return implode(', ', $unique);
    }

    /** @param  array<string, mixed>  $payload */
    private function formatNominatimAddress(array $payload): string
    {
        $addr = is_array($payload['address'] ?? null) ? $payload['address'] : [];

        $street = trim(implode(' ', array_filter([
            $addr['house_number'] ?? null,
            $addr['road'] ?? $addr['pedestrian'] ?? $addr['residential'] ?? null,
        ], fn ($part) => filled($part))));

        $parts = array_values(array_filter([
            $street !== '' ? $street : null,
            $addr['suburb'] ?? $addr['neighbourhood'] ?? $addr['quarter'] ?? $addr['hamlet'] ?? null,
            $addr['city'] ?? $addr['town'] ?? $addr['village'] ?? $addr['municipality'] ?? null,
            $addr['state'] ?? $addr['region'] ?? null,
            $addr['postcode'] ?? null,
            $addr['country'] ?? null,
        ], fn ($part) => filled($part)));

        $unique = [];
        foreach ($parts as $part) {
            $text = trim((string) $part);
            if ($text !== '' && ! in_array($text, $unique, true)) {
                $unique[] = $text;
            }
        }

        if ($unique !== []) {
            return implode(', ', $unique);
        }

        return trim((string) ($payload['display_name'] ?? ''));
    }

    /** @return array<string, string> */
    private function headers(): array
    {
        return [
            'User-Agent' => (string) config('osm.user_agent'),
            'Accept' => 'application/json',
        ];
    }
}
