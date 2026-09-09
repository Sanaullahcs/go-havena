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

        $us = Country::query()->where('code', 'US')->firstOrFail();
        $pk = Country::query()->where('code', 'PK')->firstOrFail();

        $stateLookup = State::query()
            ->get()
            ->groupBy('country_id')
            ->map(fn ($states) => $states->keyBy('name'));

        $regions = [
            ['title' => 'Florida - Miami-Dade County', 'area' => 'Miami-Dade County', 'state' => 'Florida', 'country' => $us, 'users_label' => '12,450 users', 'sort_order' => 1],
            ['title' => 'Florida - Tampa Bay', 'area' => 'Tampa Bay Area', 'state' => 'Florida', 'country' => $us, 'users_label' => '8,920 users', 'sort_order' => 2],
            ['title' => 'Florida - Orlando', 'area' => 'Orlando Metro', 'state' => 'Florida', 'country' => $us, 'users_label' => '7,340 users', 'sort_order' => 3],
            ['title' => 'Florida - Jacksonville', 'area' => 'Jacksonville Metro', 'state' => 'Florida', 'country' => $us, 'users_label' => '4,180 users', 'sort_order' => 4],
            ['title' => 'California - Bay Area', 'area' => 'San Francisco Bay Area', 'state' => 'California', 'country' => $us, 'users_label' => '15,800 users', 'sort_order' => 5],
            ['title' => 'California - Los Angeles', 'area' => 'Los Angeles County', 'state' => 'California', 'country' => $us, 'users_label' => '18,200 users', 'sort_order' => 6],
            ['title' => 'California - San Diego', 'area' => 'San Diego County', 'state' => 'California', 'country' => $us, 'users_label' => '6,740 users', 'sort_order' => 7],
            ['title' => 'Texas - Austin', 'area' => 'Austin Metro', 'state' => 'Texas', 'country' => $us, 'users_label' => '9,560 users', 'sort_order' => 8],
            ['title' => 'Texas - Houston', 'area' => 'Houston Area', 'state' => 'Texas', 'country' => $us, 'users_label' => '11,300 users', 'sort_order' => 9],
            ['title' => 'Texas - Dallas-Fort Worth', 'area' => 'DFW Metroplex', 'state' => 'Texas', 'country' => $us, 'users_label' => '10,850 users', 'sort_order' => 10],
            ['title' => 'New York - NYC', 'area' => 'New York City', 'state' => 'New York', 'country' => $us, 'users_label' => '21,400 users', 'sort_order' => 11],
            ['title' => 'New York - Long Island', 'area' => 'Nassau & Suffolk Counties', 'state' => 'New York', 'country' => $us, 'users_label' => '5,920 users', 'sort_order' => 12],
            ['title' => 'Georgia - Atlanta', 'area' => 'Atlanta Metro', 'state' => 'Georgia', 'country' => $us, 'users_label' => '8,640 users', 'sort_order' => 13],
            ['title' => 'Illinois - Chicago', 'area' => 'Chicagoland', 'state' => 'Illinois', 'country' => $us, 'users_label' => '14,200 users', 'sort_order' => 14],
            ['title' => 'Washington - Seattle', 'area' => 'Puget Sound Region', 'state' => 'Washington', 'country' => $us, 'users_label' => '7,890 users', 'sort_order' => 15],
            ['title' => 'Arizona - Phoenix', 'area' => 'Phoenix', 'state' => 'Arizona', 'country' => $us, 'users_label' => '6,510 users', 'sort_order' => 16],
            ['title' => 'Colorado - Denver', 'area' => 'Denver Metro', 'state' => 'Colorado', 'country' => $us, 'users_label' => '5,430 users', 'sort_order' => 17],
            ['title' => 'Nevada - Las Vegas', 'area' => 'Las Vegas Valley', 'state' => 'Nevada', 'country' => $us, 'users_label' => '4,980 users', 'sort_order' => 18],
            ['title' => 'Massachusetts - Boston', 'area' => 'Boston', 'state' => 'Massachusetts', 'country' => $us, 'users_label' => '2,840 residents', 'sort_order' => 0],
            ['title' => 'Pennsylvania - Philadelphia', 'area' => 'Philadelphia Metro', 'state' => 'Pennsylvania', 'country' => $us, 'users_label' => '5,760 users', 'sort_order' => 20],
            ['title' => 'North Carolina - Charlotte', 'area' => 'Charlotte Metro', 'state' => 'North Carolina', 'country' => $us, 'users_label' => '4,650 users', 'sort_order' => 21],
            ['title' => 'Virginia - Northern Virginia', 'area' => 'NoVA / DC Metro', 'state' => 'Virginia', 'country' => $us, 'users_label' => '7,110 users', 'sort_order' => 22],
            ['title' => 'Pakistan - Lahore', 'area' => 'Lahore', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '3,240 users', 'sort_order' => 23],
            ['title' => 'Pakistan - Karachi', 'area' => 'Karachi', 'state' => 'Sindh', 'country' => $pk, 'users_label' => '4,860 users', 'sort_order' => 24],
            ['title' => 'Pakistan - Islamabad', 'area' => 'Islamabad', 'state' => 'Islamabad', 'country' => $pk, 'users_label' => '1,920 users', 'sort_order' => 25],
            ['title' => 'Pakistan - Rawalpindi', 'area' => 'Rawalpindi Division', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '2,150 users', 'sort_order' => 26],
            ['title' => 'Pakistan - Faisalabad', 'area' => 'Faisalabad Division', 'state' => 'Punjab', 'country' => $pk, 'users_label' => '1,780 users', 'sort_order' => 27],
        ];

        $liveTitles = [
            'Florida - Miami-Dade County',
            'Florida - Tampa Bay',
            'Florida - Orlando',
            'Florida - Jacksonville',
            'Arizona - Phoenix',
            'Massachusetts - Boston',
            'Pakistan - Lahore',
            'Pakistan - Islamabad',
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

        Region::query()
            ->where(function ($query) {
                $query->where('title', 'like', 'Florida%')
                    ->orWhereIn('title', [
                        'Arizona - Phoenix',
                        'Massachusetts - Boston',
                        'Pakistan - Lahore',
                        'Pakistan - Islamabad',
                    ]);
            })
            ->update(['status' => 'active']);

        Region::query()
            ->where('title', 'not like', 'Florida%')
            ->whereNotIn('title', [
                'Arizona - Phoenix',
                'Massachusetts - Boston',
                'Pakistan - Lahore',
                'Pakistan - Islamabad',
            ])
            ->update(['status' => 'inactive']);

        State::query()
            ->where('name', 'Massachusetts')
            ->whereHas('country', fn ($country) => $country->where('code', 'US'))
            ->update(['code' => 'MA']);
    }
}
