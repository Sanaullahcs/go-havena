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

    public function test_resolve_location_opens_a_city_region(): void
    {
        $country = Country::query()->create([
            'code' => 'ZX',
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

        $this->postJson('/api/v1/locations/resolve', [
            'country_id' => $country->id,
            'state_id' => $state->id,
            'city' => 'Wilmington',
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Delaware - Wilmington')
            ->assertJsonPath('data.area', 'Wilmington');

        $this->assertDatabaseHas('regions', [
            'state_id' => $state->id,
            'title' => 'Delaware - Wilmington',
            'status' => 'active',
        ]);
    }

    public function test_regions_index_creates_statewide_location_when_filtered(): void
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
            ->assertJsonFragment(['title' => 'United States - Delaware']);
    }
}
