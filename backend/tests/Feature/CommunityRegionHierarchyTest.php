<?php

namespace Tests\Feature;

use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Models\User;
use App\Services\LocationCatalog;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityRegionHierarchyTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_cannot_create_community_on_state_level_region(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $state = $this->punjabState();
        $stateRegion = app(LocationCatalog::class)->ensureStateRegion($state);

        $this
            ->postJson('/api/v1/admin/communities', [
                'name' => 'State Only Towers',
                'region_id' => $stateRegion->id,
                'address' => '123 Main Road, Lahore, Punjab, Pakistan',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['region_id', 'city']);
    }

    public function test_admin_create_normalizes_city_region_title(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $state = $this->punjabState();
        $legacy = Region::query()->create([
            'state_id' => $state->id,
            'title' => 'Punjab - Lahore',
            'area' => 'Lahore',
            'state' => 'Punjab',
            'users_label' => 'Open',
            'sort_order' => 23,
            'status' => 'active',
        ]);

        $this
            ->postJson('/api/v1/admin/communities', [
                'name' => 'Canonical City Community',
                'region_id' => $legacy->id,
                'address' => 'Emporium, Abdul Haq Road, Lahore, Punjab, Pakistan',
            ])
            ->assertCreated()
            ->assertJsonPath('data.region_title', 'Pakistan - Punjab - Lahore');

        $legacy->refresh();
        $this->assertSame('Pakistan - Punjab - Lahore', $legacy->title);
    }

    public function test_admin_create_resolves_pakistan_address_over_mismatched_region_state_id(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $state = $this->punjabState();
        $broken = Region::query()->create([
            'state_id' => State::query()->whereHas('country', fn ($c) => $c->where('code', 'AF'))->firstOrFail()->id,
            'title' => 'Punjab - Lahore',
            'area' => 'Lahore',
            'state' => 'Punjab',
            'users_label' => 'Open',
            'sort_order' => 99,
            'status' => 'active',
        ]);

        $this
            ->postJson('/api/v1/admin/communities', [
                'name' => 'Emporium Test',
                'region_id' => $broken->id,
                'address' => 'Emporium Mall, Abdul Haq Road, Johar Town, Lahore, Punjab 54700, Pakistan',
            ])
            ->assertCreated()
            ->assertJsonPath('data.region_title', 'Pakistan - Punjab - Lahore');
    }

    public function test_inferred_city_from_region_when_city_matches_emirate_name(): void
    {
        $country = Country::query()->where('code', 'AE')->firstOrFail();
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Dubai'],
            ['status' => 'active'],
        );

        $region = Region::query()->create([
            'state_id' => $state->id,
            'title' => 'United Arab Emirates - Dubai - Dubai',
            'area' => 'Dubai',
            'state' => 'Dubai',
            'users_label' => 'Open',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $region->load('stateRecord');

        $this->assertFalse(\App\Support\RegionHierarchy::isCityLevelRegion($region));
        $this->assertSame('Dubai', \App\Support\RegionHierarchy::inferredCityFromRegion($region));

        $resolved = \App\Support\RegionHierarchy::assignRegionForCommunity(
            $region,
            null,
            app(LocationCatalog::class),
        );
        $this->assertSame($region->id, $resolved->id);
    }

    public function test_admin_regions_city_level_filter_does_not_error(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $state = $this->punjabState();
        Region::query()->create([
            'title' => 'Pakistan - Punjab - Lahore',
            'area' => 'Lahore',
            'state_id' => $state->id,
            'state' => 'Punjab',
            'users_label' => 'Open',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $this
            ->getJson('/api/v1/admin/regions?status=active&city_level=1&per_page=100')
            ->assertOk()
            ->assertJsonPath('meta.stats.active', 1)
            ->assertJsonCount(1, 'data');
    }

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function punjabState(): State
    {
        $country = Country::query()->where('code', 'PK')->firstOrFail();

        return State::query()->where('country_id', $country->id)->where('name', 'Punjab')->firstOrFail();
    }
}