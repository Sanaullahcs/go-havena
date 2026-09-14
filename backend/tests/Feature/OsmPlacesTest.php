<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OsmPlacesTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function activeRegion(): Region
    {
        return Region::query()->create([
            'title' => 'Boston Harbor',
            'area' => 'Boston',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
    }

    private function fakeOsmApis(): void
    {
        config(['osm.geocode_in_tests' => true]);

        Http::fake([
            'photon.komoot.io/*' => Http::response([
                'features' => [[
                    'geometry' => ['coordinates' => [-71.04185, 42.34955]],
                    'properties' => [
                        'name' => 'Harbor Point',
                        'housenumber' => '1',
                        'street' => 'Seaport Blvd',
                        'city' => 'Boston',
                        'state' => 'MA',
                        'country' => 'USA',
                    ],
                ]],
            ]),
            'nominatim.openstreetmap.org/reverse*' => Http::response([
                'lat' => '42.35100',
                'lon' => '-71.04000',
                'display_name' => '12 Harbor Way, Boston, Suffolk County, Massachusetts, USA',
                'address' => [
                    'house_number' => '12',
                    'road' => 'Harbor Way',
                    'city' => 'Boston',
                    'state' => 'Massachusetts',
                    'country' => 'USA',
                ],
            ]),
            'nominatim.openstreetmap.org/*' => Http::response([
                [
                    'lat' => '42.34955',
                    'lon' => '-71.04185',
                    'display_name' => '1 Seaport Blvd, Boston, MA',
                ],
            ]),
            'overpass-api.de/*' => Http::response([
                'elements' => [
                    [
                        'type' => 'node',
                        'id' => 111,
                        'lat' => 42.35000,
                        'lon' => -71.04185,
                        'tags' => [
                            'name' => 'Harbor Cafe',
                            'amenity' => 'cafe',
                            'phone' => '+16175550100',
                            'opening_hours' => 'Mo-Fr 07:00-19:00',
                            'website' => 'https://harbor.example',
                            'cuisine' => 'coffee_shop',
                            'email' => 'hello@harbor.example',
                            'brand' => 'Harbor',
                            'wheelchair' => 'yes',
                            'addr:housenumber' => '10',
                            'addr:street' => 'Seaport Blvd',
                            'addr:city' => 'Boston',
                        ],
                    ],
                    [
                        'type' => 'node',
                        'id' => 222,
                        'lat' => 42.40000,
                        'lon' => -71.04185,
                        'tags' => [
                            'name' => 'Too Far Cafe',
                            'amenity' => 'cafe',
                        ],
                    ],
                    [
                        'type' => 'way',
                        'id' => 333,
                        'center' => ['lat' => 42.35020, 'lon' => -71.04140],
                        'tags' => [
                            'name' => 'Harbor Gym',
                            'leisure' => 'sports_centre',
                            'contact:mobile' => '+1 617-555-0199',
                        ],
                    ],
                ],
            ]),
            'overpass.kumi.systems/*' => Http::response(['elements' => []]),
            'overpass.private.coffee/*' => Http::response(['elements' => []]),
        ]);
    }

    public function test_address_suggest_returns_photon_results(): void
    {
        $this->fakeOsmApis();
        Sanctum::actingAs($this->systemAdmin());

        $response = $this->getJson('/api/v1/geo/address-suggest?q=harbor');

        $response->assertOk()
            ->assertJsonPath('data.0.label', 'Harbor Point, 1 Seaport Blvd, Boston, MA, USA')
            ->assertJsonPath('data.0.latitude', 42.34955)
            ->assertJsonPath('data.0.longitude', -71.04185);
    }

    public function test_address_reverse_returns_nominatim_result(): void
    {
        $this->fakeOsmApis();
        Sanctum::actingAs($this->systemAdmin());

        $response = $this->getJson('/api/v1/geo/address-reverse?lat=42.351&lng=-71.04');

        $response->assertOk()
            ->assertJsonPath('data.address', '12 Harbor Way, Boston, Massachusetts, USA')
            ->assertJsonPath('data.latitude', 42.351)
            ->assertJsonPath('data.longitude', -71.04);
    }

    public function test_creating_community_saves_map_pin(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $region = $this->activeRegion();

        $response = $this->postJson('/api/v1/admin/communities', [
            'name' => 'Seaport Residences',
            'region_id' => $region->id,
            'address' => '1 Seaport Blvd, Boston, MA',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.latitude', 42.34955)
            ->assertJsonPath('data.longitude', -71.04185);

        $this->assertDatabaseHas('communities', [
            'name' => 'Seaport Residences',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
        ]);
    }

    public function test_creating_community_geocodes_typed_address_without_pin(): void
    {
        $this->fakeOsmApis();
        Sanctum::actingAs($this->systemAdmin());
        $region = $this->activeRegion();

        $response = $this->postJson('/api/v1/admin/communities', [
            'name' => 'Typed Address Place',
            'region_id' => $region->id,
            'address' => '1 Seaport Blvd, Boston, MA',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.latitude', 42.34955)
            ->assertJsonPath('data.longitude', -71.04185);
    }

    public function test_nearby_places_filters_results_beyond_3km(): void
    {
        $this->fakeOsmApis();

        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'Harbor Homes',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Seaport Blvd',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $response = $this->getJson('/api/v1/nearby-places?category=cafes');

        $response->assertOk()
            ->assertJsonPath('meta.has_coordinates', true)
            ->assertJsonPath('data.0.name', 'Harbor Cafe')
            ->assertJsonPath('data.0.phone', '+16175550100')
            ->assertJsonPath('data.0.hours', 'Mo-Fr 07:00-19:00')
            ->assertJsonPath('data.0.website', 'https://harbor.example')
            ->assertJsonPath('data.0.cuisine', 'coffee_shop')
            ->assertJsonPath('data.0.email', 'hello@harbor.example')
            ->assertJsonPath('data.0.brand', 'Harbor')
            ->assertJsonMissing(['name' => 'Too Far Cafe']);

        $this->assertLessThanOrEqual(3000, $response->json('data.0.distance_meters'));
        $this->assertCount(1, $response->json('data'));
    }

    public function test_nearby_places_includes_expanded_gym_tags(): void
    {
        $this->fakeOsmApis();

        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'Harbor Homes',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Seaport Blvd',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/nearby-places?category=gyms')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Harbor Gym')
            ->assertJsonPath('data.0.phone', '+1 617-555-0199');
    }

    public function test_nearby_places_can_return_all_categories_in_one_payload(): void
    {
        $this->fakeOsmApis();

        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'Harbor Homes',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Seaport Blvd',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $response = $this->getJson('/api/v1/nearby-places?all=1');

        $response->assertOk()
            ->assertJsonPath('meta.grouped', true)
            ->assertJsonPath('data.cafes.0.name', 'Harbor Cafe')
            ->assertJsonPath('data.gyms.0.name', 'Harbor Gym')
            ->assertJsonPath('data.restaurants', []);
    }

    public function test_nearby_places_empty_when_community_has_no_pin(): void
    {
        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'No Pin Place',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/nearby-places?category=restaurants')
            ->assertOk()
            ->assertJsonPath('meta.has_coordinates', false)
            ->assertJsonPath('data', []);
    }

    public function test_nearby_places_uses_requested_community_pin_not_first_membership(): void
    {
        config(['osm.geocode_in_tests' => true]);

        Http::fake(function (\Illuminate\Http\Client\Request $request) {
            $query = (string) ($request->data()['data'] ?? '');
            if (! str_contains($request->url(), 'overpass')) {
                return Http::response(['elements' => []]);
            }

            if (str_contains($query, '24.4685')) {
                return Http::response([
                    'elements' => [[
                        'type' => 'node',
                        'id' => 801,
                        'lat' => 24.4686,
                        'lon' => 39.6104,
                        'tags' => [
                            'name' => 'Haram Cafe',
                            'amenity' => 'cafe',
                            'addr:city' => 'Medina',
                        ],
                    ]],
                ]);
            }

            if (str_contains($query, '31.4683')) {
                return Http::response([
                    'elements' => [[
                        'type' => 'node',
                        'id' => 802,
                        'lat' => 31.4684,
                        'lon' => 74.4008,
                        'tags' => [
                            'name' => 'Lahore Cafe',
                            'amenity' => 'cafe',
                            'addr:city' => 'Lahore',
                        ],
                    ]],
                ]);
            }

            return Http::response(['elements' => []]);
        });

        $region = $this->activeRegion();
        $lahore = Community::query()->create([
            'name' => 'Richest town',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => 'DHA Phase V, Lahore',
            'latitude' => 31.4683957,
            'longitude' => 74.4007613,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $madina = Community::query()->create([
            'name' => 'Madina Munavra',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => 'Al Haram Al Sharif, Medina',
            'latitude' => 24.4685666,
            'longitude' => 39.6104228,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $lahore->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $madina->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/nearby-places?all=1&community_id='.$madina->id)
            ->assertOk()
            ->assertJsonPath('meta.community_id', $madina->id)
            ->assertJsonPath('meta.latitude', 24.4685666)
            ->assertJsonPath('data.cafes.0.name', 'Haram Cafe')
            ->assertJsonMissing(['name' => 'Lahore Cafe']);

        $this->withHeaders(['X-Community-Id' => (string) $lahore->id])
            ->getJson('/api/v1/nearby-places?all=1')
            ->assertOk()
            ->assertJsonPath('meta.community_id', $lahore->id)
            ->assertJsonPath('data.cafes.0.name', 'Lahore Cafe')
            ->assertJsonMissing(['name' => 'Haram Cafe']);
    }

    public function test_pending_membership_can_load_nearby_places(): void
    {
        $this->fakeOsmApis();

        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'Harbor Homes',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Seaport Blvd',
            'latitude' => 42.34955,
            'longitude' => -71.04185,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/nearby-places?all=1')
            ->assertOk()
            ->assertJsonPath('meta.community_id', $community->id)
            ->assertJsonPath('meta.has_coordinates', true)
            ->assertJsonPath('data.cafes.0.name', 'Harbor Cafe');
    }

    public function test_nearby_places_geocodes_community_address_when_pin_missing(): void
    {
        $this->fakeOsmApis();

        $region = $this->activeRegion();
        $community = Community::query()->create([
            'name' => 'Harbor Homes',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '1 Seaport Blvd, Boston, MA',
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/nearby-places?category=cafes')
            ->assertOk()
            ->assertJsonPath('meta.has_coordinates', true)
            ->assertJsonPath('data.0.name', 'Harbor Cafe');

        $community->refresh();
        $this->assertSame(42.34955, (float) $community->latitude);
        $this->assertSame(-71.04185, (float) $community->longitude);
    }
}
