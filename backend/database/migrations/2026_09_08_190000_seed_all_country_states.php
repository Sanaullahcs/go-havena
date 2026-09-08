<?php

use App\Models\Country;
use App\Models\State;
use App\Support\CountriesData;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('countries') || ! Schema::hasTable('states')) {
            return;
        }

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

    public function down(): void
    {
        // Keep seeded states — they are reference data.
    }
};
