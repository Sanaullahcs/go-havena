<?php

namespace App\Services;

use App\Models\City;
use App\Models\State;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class OpenCityDirectory
{
    /** @var array<string, list<string>> */
    private const COUNTRY_ALIASES = [
        'US' => ['United States', 'United States of America', 'USA'],
        'GB' => ['United Kingdom', 'UK', 'Great Britain'],
        'PK' => ['Pakistan'],
        'AE' => ['United Arab Emirates', 'UAE'],
        'KR' => ['South Korea', 'Korea, Republic of'],
        'RU' => ['Russia', 'Russian Federation'],
    ];

    /** @var array<string, list<string>> */
    private const STATE_ALIASES = [
        'punjab' => ['Punjab', 'Punjab Province', 'Punjab, Pakistan'],
        'sindh' => ['Sindh', 'Sindh Province'],
        'khyber pakhtunkhwa' => ['Khyber Pakhtunkhwa', 'KPK', 'NWFP'],
        'balochistan' => ['Balochistan', 'Baluchistan'],
        'islamabad' => ['Islamabad', 'Islamabad Capital Territory'],
        'california' => ['California', 'CA'],
        'new york' => ['New York', 'NY', 'New York State'],
    ];

    /**
     * Cities for a state, cached locally after the first open-data fetch.
     *
     * @return list<array{id: int, state_id: int, name: string}>
     */
    public function citiesForState(State $state, ?string $query = null): array
    {
        $state->loadMissing('country');

        if (! Schema::hasTable('cities')) {
            return [];
        }

        if (! City::query()->where('state_id', $state->id)->exists()) {
            $this->hydrateState($state);
        }

        $cities = City::query()
            ->where('state_id', $state->id)
            ->where('status', 'active')
            ->when($query !== null && trim($query) !== '', function ($builder) use ($query) {
                $builder->where('name', 'like', '%'.trim($query).'%');
            })
            ->orderBy('name')
            ->get();

        return $cities->map(fn (City $city) => [
            'id' => $city->id,
            'state_id' => $city->state_id,
            'name' => $city->name,
        ])->all();
    }

    public function hydrateState(State $state): int
    {
        $names = $this->fetchRemoteCityNames($state);
        $count = 0;

        foreach ($names as $index => $name) {
            City::query()->updateOrCreate(
                ['state_id' => $state->id, 'name' => $name],
                [
                    'sort_order' => $index + 1,
                    'status' => 'active',
                ],
            );
            $count++;
        }

        return $count;
    }

    /**
     * @return list<string>
     */
    private function fetchRemoteCityNames(State $state): array
    {
        $fromCountriesNow = $this->fetchCountriesNow($state);
        if ($fromCountriesNow !== []) {
            return $fromCountriesNow;
        }

        $fromNominatim = $this->fetchNominatim($state);
        if ($fromNominatim !== []) {
            return $fromNominatim;
        }

        return $this->bundledCities($state);
    }

    private function httpClient()
    {
        $client = Http::acceptJson()
            ->timeout(15)
            ->withHeaders([
                'User-Agent' => 'Havena/1.0 (hello@gohavena.com)',
                'Accept' => 'application/json',
            ]);

        if (app()->environment('local', 'testing')) {
            $client = $client->withoutVerifying();
        }

        return $client;
    }

    /**
     * @return list<string>
     */
    private function fetchCountriesNow(State $state): array
    {
        $country = $state->country;
        if (! $country) {
            return [];
        }

        foreach ($this->countryNames($country->code, $country->name) as $countryName) {
            foreach ($this->stateNames($state->name) as $stateName) {
                try {
                    $response = $this->httpClient()->post('https://countriesnow.space/api/v0.1/countries/state/cities', [
                        'country' => $countryName,
                        'state' => $stateName,
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('countriesnow cities failed', [
                        'country' => $countryName,
                        'state' => $stateName,
                        'error' => $e->getMessage(),
                    ]);
                    continue;
                }

                if (! $response->successful() || $response->json('error') === true) {
                    continue;
                }

                $names = $this->normalizeNames($response->json('data'));
                if ($names !== []) {
                    return $names;
                }
            }
        }

        return [];
    }

    /**
     * @return list<string>
     */
    private function fetchNominatim(State $state): array
    {
        $country = $state->country;
        if (! $country) {
            return [];
        }

        try {
            $response = $this->httpClient()
                ->withHeaders(['Accept-Language' => 'en'])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'format' => 'jsonv2',
                    'addressdetails' => 1,
                    'limit' => 80,
                    'country' => $country->name,
                    'state' => $state->name,
                    'featuretype' => 'settlement',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Nominatim city search failed', [
                'state' => $state->name,
                'error' => $e->getMessage(),
            ]);

            return [];
        }

        if (! $response->successful()) {
            return [];
        }

        $names = [];
        foreach ((array) $response->json() as $row) {
            if (! is_array($row)) {
                continue;
            }
            $address = is_array($row['address'] ?? null) ? $row['address'] : [];
            $name = $address['city']
                ?? $address['town']
                ?? $address['village']
                ?? $address['municipality']
                ?? ($row['name'] ?? null);
            if (is_string($name) && trim($name) !== '') {
                $names[] = trim($name);
            }
        }

        return $this->normalizeNames($names);
    }

    /**
     * @return list<string>
     */
    private function countryNames(string $code, string $name): array
    {
        $aliases = self::COUNTRY_ALIASES[strtoupper($code)] ?? [];

        return array_values(array_unique(array_filter([$name, ...$aliases])));
    }

    /** @return list<string> */
    private function stateNames(string $name): array
    {
        $aliases = self::STATE_ALIASES[strtolower(trim($name))] ?? [];

        return array_values(array_unique(array_filter([$name, ...$aliases])));
    }

    /** @return list<string> */
    private function bundledCities(State $state): array
    {
        $path = database_path('data/open-cities.json');
        if (! is_file($path)) {
            return [];
        }

        $payload = json_decode((string) file_get_contents($path), true);
        if (! is_array($payload)) {
            return [];
        }

        $countryCode = strtoupper((string) ($state->country?->code ?? ''));
        $stateKey = strtolower(trim($state->name));
        $names = $payload[$countryCode][$stateKey] ?? [];

        return $this->normalizeNames($names);
    }

    /**
     * @param  mixed  $raw
     * @return list<string>
     */
    private function normalizeNames($raw): array
    {
        $items = Collection::make(is_array($raw) ? $raw : [])
            ->map(function ($value) {
                if (is_string($value)) {
                    return trim($value);
                }
                if (is_array($value)) {
                    return trim((string) ($value['name'] ?? ''));
                }

                return '';
            })
            ->filter(fn ($name) => $name !== '' && mb_strlen($name) <= 150)
            ->unique(fn ($name) => mb_strtolower($name))
            ->sort()
            ->values();

        return $items->all();
    }
}
