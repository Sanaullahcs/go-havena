<?php

namespace Database\Seeders;

use App\Models\Country;
use App\Models\State;
use App\Support\CountriesData;
use Illuminate\Database\Seeder;

class GeographySeeder extends Seeder
{
    public function run(): void
    {
        $exemptCodes = CountriesData::exemptCodes();
        $priorityCodes = ['US', 'PK', 'GB', 'CA', 'AE', 'SA', 'IN'];

        foreach (CountriesData::all() as $index => $row) {
            $code = strtoupper($row['code']);
            $priority = array_search($code, $priorityCodes, true);

            Country::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $row['name'],
                    'billing_policy' => in_array($code, $exemptCodes, true)
                        ? Country::BILLING_EXEMPT
                        : Country::BILLING_REQUIRED,
                    'sort_order' => $priority !== false ? $priority + 1 : 100 + $index,
                    'status' => 'active',
                ],
            );
        }

        $this->seedSubdivisions();
    }

    private function seedSubdivisions(): void
    {
        $countries = Country::query()->get()->keyBy('code');

        foreach (CountriesData::statesByCountry() as $countryCode => $states) {
            $country = $countries->get(strtoupper((string) $countryCode));
            if (! $country) {
                continue;
            }

            foreach ($states as $i => $state) {
                $name = trim((string) ($state['name'] ?? ''));
                if ($name === '') {
                    continue;
                }

                State::query()->updateOrCreate(
                    ['country_id' => $country->id, 'name' => $name],
                    [
                        'code' => $state['code'] ?? null,
                        'sort_order' => $i + 1,
                        'status' => 'active',
                    ],
                );
            }
        }
    }
}
