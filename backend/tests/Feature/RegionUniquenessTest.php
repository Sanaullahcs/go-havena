<?php

namespace Tests\Feature;

use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Services\LocationCatalog;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RegionUniquenessTest extends TestCase
{
    use RefreshDatabase;

    public function test_ensure_city_region_reuses_state_region_when_city_equals_state(): void
    {
        $country = Country::query()->where('code', 'AE')->firstOrFail();
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Dubai'],
            ['status' => 'active'],
        );
        $catalog = app(LocationCatalog::class);

        $stateRegion = $catalog->ensureStateRegion($state);
        $cityRegion = $catalog->ensureCityRegion($state, 'Dubai');

        $this->assertSame($stateRegion->id, $cityRegion->id);
        $this->assertSame(
            1,
            Region::query()->where('state_id', $state->id)->whereRaw('LOWER(area) = ?', ['dubai'])->count(),
        );
    }

    public function test_ensure_city_region_does_not_create_duplicate_for_same_state_and_city(): void
    {
        $state = $this->punjabState();
        $catalog = app(LocationCatalog::class);

        $first = $catalog->ensureCityRegion($state, 'Lahore');
        $second = $catalog->ensureCityRegion($state, 'Lahore');

        $this->assertSame($first->id, $second->id);
        $this->assertSame(
            1,
            Region::query()->where('state_id', $state->id)->whereRaw('LOWER(area) = ?', ['lahore'])->count(),
        );
    }

    public function test_admin_can_restore_soft_deleted_city_region_slot(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $country = Country::query()->where('code', 'AE')->firstOrFail();
        $state = State::query()->firstOrCreate(
            ['country_id' => $country->id, 'name' => 'Dubai'],
            ['status' => 'active'],
        );

        $deleted = Region::query()->create([
            'state_id' => $state->id,
            'title' => 'Old Dubai',
            'area' => 'Dubai',
            'state' => $state->name,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $deleted->delete();

        $this->postJson('/api/v1/admin/regions', [
            'title' => 'United Arab Emirates - Dubai - Dubai',
            'area' => 'Dubai',
            'state_id' => $state->id,
            'status' => 'active',
        ])
            ->assertCreated()
            ->assertJsonPath('data.id', $deleted->id)
            ->assertJsonPath('data.title', 'United Arab Emirates - Dubai - Dubai');

        $this->assertNull($deleted->fresh()->deleted_at);
    }

    public function test_admin_cannot_create_duplicate_city_region(): void
    {
        Sanctum::actingAs($this->systemAdmin());
        $state = $this->punjabState();
        $catalog = app(LocationCatalog::class);
        $catalog->ensureCityRegion($state, 'Lahore');

        $this->postJson('/api/v1/admin/regions', [
            'title' => 'Pakistan - Punjab - Lahore',
            'area' => 'Lahore',
            'state_id' => $state->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['area']);
    }

    private function punjabState(): State
    {
        $country = Country::query()->where('code', 'PK')->firstOrFail();

        return State::query()->where('country_id', $country->id)->where('name', 'Punjab')->firstOrFail();
    }

    private function systemAdmin()
    {
        $this->seed(SystemAdminSeeder::class);

        return \App\Models\User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }
}