<?php

namespace Database\Seeders;

use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use Illuminate\Database\Seeder;

class RegionSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(GeographySeeder::class);

        $pk = Country::query()->where('code', 'PK')->firstOrFail();

        $stateLookup = State::query()
            ->get()
            ->groupBy('country_id')
            ->map(fn ($states) => $states->keyBy('name'));

        $regions = [
            ['title' => 'Pakistan - Lahore', 'area' => 'Lahore', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '3,240 users', 'sort_order' => 1],
            ['title' => 'Pakistan - Karachi', 'area' => 'Karachi', 'state' => 'Sindh', 'country' => $pk, 'users_label' => '4,860 users', 'sort_order' => 2],
            ['title' => 'Pakistan - Islamabad', 'area' => 'Islamabad', 'state' => 'Islamabad', 'country' => $pk, 'users_label' => '1,920 users', 'sort_order' => 3],
            ['title' => 'Pakistan - Rawalpindi', 'area' => 'Rawalpindi', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '2,150 users', 'sort_order' => 4],
            ['title' => 'Pakistan - Faisalabad', 'area' => 'Faisalabad', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '1,780 users', 'sort_order' => 5],
        ];

        $liveTitles = [
            'Pakistan - Lahore',
            'Pakistan - Islamabad',
            'Pakistan - Karachi',
        ];

        foreach ($regions as $region) {
            /** @var Country $country */
            $country = $region['country'];
            $stateName = $region['state'];
            $state = $stateLookup->get($country->id)?->get($stateName);

            Region::query()->updateOrCreate(
                ['title' => $region['title']],
                [
                    'area' => $region['area'],
                    'state' => $stateName,
                    'state_id' => $state?->id,
                    'users_label' => $region['users_label'],
                    'sort_order' => $region['sort_order'],
                    'status' => in_array($region['title'], $liveTitles, true) ? 'active' : 'inactive',
                ],
            );
        }

        $curatedTitles = array_column($regions, 'title');
        Region::query()
            ->whereIn('title', $liveTitles)
            ->update(['status' => 'active']);
        Region::query()
            ->whereIn('title', $curatedTitles)
            ->whereNotIn('title', $liveTitles)
            ->update(['status' => 'inactive']);
    }
}
