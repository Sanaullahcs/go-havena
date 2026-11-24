<?php

namespace Tests\Feature;

use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CityRegionEnsureTest extends TestCase
{
    use RefreshDatabase;

    public function test_community_admin_can_ensure_missing_city_region_without_duplicates(): void
    {
        $state = $this->omanMuscatState();
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
        ]);
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/locations/ensure', [
            'state_id' => $state->id,
            'country_id' => $state->country_id,
            'city' => 'Muscat Governorate',
        ])
            ->assertOk()
            ->assertJsonPath('data.type', 'region')
            ->assertJsonPath('data.area', 'Muscat Governorate')
            ->assertJsonPath('meta.created', true);

        $regionId = (int) $this->postJson('/api/v1/locations/ensure', [
            'state_id' => $state->id,
            'city' => 'Muscat Governorate',
        ])
            ->assertOk()
            ->assertJsonPath('meta.created', false)
            ->json('data.id');

        $this->assertSame(
            1,
            Region::query()
                ->where('state_id', $state->id)
                ->whereRaw('LOWER(TRIM(area)) = ?', ['muscat governorate'])
                ->count(),
        );

        $firstId = (int) Region::query()
            ->where('state_id', $state->id)
            ->whereRaw('LOWER(TRIM(area)) = ?', ['muscat governorate'])
            ->value('id');
        $this->assertSame($firstId, $regionId);
    }

    public function test_resident_cannot_ensure_city_region(): void
    {
        $state = $this->omanMuscatState();
        $resident = User::factory()->create(['role' => 'resident']);
        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/locations/ensure', [
            'state_id' => $state->id,
            'city' => 'Muscat Governorate',
        ])->assertForbidden();

        $this->assertSame(0, Region::query()->where('state_id', $state->id)->count());
    }

    public function test_public_resolve_still_does_not_create_regions(): void
    {
        $state = $this->omanMuscatState();

        $this->postJson('/api/v1/locations/resolve', [
            'state_id' => $state->id,
            'city' => 'Salalah',
        ])->assertStatus(422);

        $this->assertSame(0, Region::query()->where('state_id', $state->id)->count());
    }

    private function omanMuscatState(): State
    {
        $country = Country::query()->firstOrCreate(
            ['code' => 'OM'],
            [
                'name' => 'Oman',
                'billing_policy' => 'required',
                'sort_order' => 500,
                'status' => 'active',
            ],
        );

        return State::query()->firstOrCreate(
            [
                'country_id' => $country->id,
                'name' => 'Muscat',
            ],
            [
                'code' => 'MA',
                'sort_order' => 1,
                'status' => 'active',
            ],
        );
    }
}