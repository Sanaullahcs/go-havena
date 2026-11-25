<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunitySearchByCityRegionTest extends TestCase
{
    use RefreshDatabase;

    public function test_search_finds_communities_when_region_id_is_duplicate_city_region(): void
    {
        $country = Country::query()->where('code', 'PK')->firstOrFail();
        $state = State::query()->where('country_id', $country->id)->where('name', 'Punjab')->firstOrFail();
        $region = app(\App\Services\LocationCatalog::class)->ensureCityRegion($state, 'Lahore');

        $community = Community::query()->create([
            'name' => 'TGI Residences',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $this->getJson('/api/v1/communities/search?'.http_build_query(['region_id' => $region->id]))
            ->assertOk()
            ->assertJsonPath('data.0.id', $community->id)
            ->assertJsonPath('data.0.name', 'TGI Residences');
    }
}
