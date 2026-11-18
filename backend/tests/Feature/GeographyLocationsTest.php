<?php

namespace Tests\Feature;

use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeographyLocationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_states_include_states_without_regions(): void
    {
        $country = Country::query()->create([
            'code' => 'ZZ',
            'name' => 'Testland',
            'billing_policy' => 'required',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $state = State::query()->create([
            'country_id' => $country->id,
            'name' => 'Delaware',
            'code' => 'DE',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $this->getJson("/api/v1/countries/{$country->id}/states")
            ->assertOk()
            ->assertJsonFragment([
                'id' => $state->id,
                'name' => 'Delaware',
            ]);
    }

    public function test_cities_are_fetched_from_open_api_and_cached(): void
    {
        $country = Country::query()->create([
            'code' => 'ZY',
            'name' => 'United States',
            'billing_policy' => 'required',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $state = State::query()->create([
            'country_id' => $country->id,
            'name' => 'Delaware',
            'status' => 'active',
        ]);

        Http::fake([
            'countriesnow.space/*' => Http::response([
                'error' => false,
                'data' => ['Wilmington', 'Dover', 'Newark'],
            ], 200),
        ]);

        $this->getJson("/api/v1/states/{$state->id}/cities")
            ->assertOk()
            ->assertJsonFragment(['name' => 'Wilmington'])
            ->assertJsonFragment(['name' => 'Dover']);

        $this->assertDatabaseHas('cities', [
            'state_id' => $state->id,
            'name' => 'Wilmington',
        ]);
    }

    public function test_resolve_location_finds_existing_city_region_without_creating(): void
    {
        $country = Country::query()->where('code', 'US')->firstOrFail();
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Delaware'],
            ['status' => 'active'],
        );

        app(\App\Services\LocationCatalog::class)->ensureCityRegion($state, 'Wilmington');

        $this->postJson('/api/v1/locations/resolve', [
            'country_id' => $country->id,
            'state_id' => $state->id,
            'city' => 'Wilmington',
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'United States - Delaware - Wilmington')
            ->assertJsonPath('data.area', 'Wilmington');

        $this->assertSame(
            1,
            Region::query()->where('state_id', $state->id)->whereRaw('LOWER(area) = ?', ['wilmington'])->count(),
        );
    }

    public function test_resolve_location_does_not_create_missing_city_region(): void
    {
        $country = Country::query()->where('code', 'US')->firstOrFail();
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Delaware'],
            ['status' => 'active'],
        );

        $this->postJson('/api/v1/locations/resolve', [
            'country_id' => $country->id,
            'state_id' => $state->id,
            'city' => 'Wilmington',
        ])->assertStatus(422);

        $this->assertSame(0, Region::query()->where('state_id', $state->id)->count());
    }

    public function test_resolve_location_reuses_seeded_pakistan_city_region(): void
    {
        $country = Country::query()->where('code', 'PK')->firstOrFail();
        $state = State::query()->where('country_id', $country->id)->where('name', 'Punjab')->firstOrFail();
        $seeded = Region::query()->create([
            'state_id' => $state->id,
            'title' => 'Pakistan - Punjab - Lahore',
            'area' => 'Lahore',
            'state' => 'Punjab',
            'users_label' => 'Open',
            'sort_order' => 23,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/locations/resolve', [
            'country_id' => $country->id,
            'state_id' => $state->id,
            'city' => 'Lahore',
        ])
            ->assertOk()
            ->assertJsonPath('data.id', $seeded->id)
            ->assertJsonPath('data.title', 'Pakistan - Punjab - Lahore');

        $this->assertSame(1, Region::query()->where('state_id', $state->id)->where('area', 'Lahore')->count());
    }

    public function test_regions_index_does_not_create_locations_when_filtered(): void
    {
        $country = Country::query()->create([
            'code' => 'QV',
            'name' => 'United States',
            'billing_policy' => 'required',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $state = State::query()->create([
            'country_id' => $country->id,
            'name' => 'Delaware',
            'status' => 'active',
        ]);

        $this->assertSame(0, Region::query()->where('state_id', $state->id)->count());

        $this->getJson("/api/v1/regions?state_id={$state->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertSame(0, Region::query()->where('state_id', $state->id)->count());
    }
}
