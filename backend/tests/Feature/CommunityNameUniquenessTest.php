<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityNameUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function region(string $title): Region
    {
        return Region::query()->create([
            'title' => $title,
            'area' => $title,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
    }

    public function test_rejects_case_insensitive_duplicate_in_same_region(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = $this->region('Florida');

        $this->postJson('/api/v1/admin/communities', [
            'name' => 'Green Valley',
            'region_id' => $region->id,
            'address' => '100 Green Valley Rd, Miami, FL',
        ])->assertCreated();

        $this->postJson('/api/v1/admin/communities', [
            'name' => 'green valley',
            'region_id' => $region->id,
            'address' => '200 Green Valley Rd, Miami, FL',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['name']);

        $this->assertSame(1, Community::query()->where('region_id', $region->id)->count());
    }

    public function test_allows_same_name_in_different_regions(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $florida = $this->region('Florida');
        $texas = $this->region('Texas');

        $this->postJson('/api/v1/admin/communities', [
            'name' => 'Green Valley',
            'region_id' => $florida->id,
            'address' => '100 Green Valley Rd, Miami, FL',
        ])->assertCreated();

        $this->postJson('/api/v1/admin/communities', [
            'name' => 'GREEN VALLEY',
            'region_id' => $texas->id,
            'address' => '100 Green Valley Rd, Austin, TX',
        ])->assertCreated();

        $this->assertSame(1, Community::query()->where('region_id', $florida->id)->count());
        $this->assertSame(1, Community::query()->where('region_id', $texas->id)->count());
    }

    public function test_self_serve_rejects_pending_duplicate_in_same_region(): void
    {
        $region = $this->region('Florida');

        Community::query()->create([
            'name' => 'Green Valley',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Green Valley Rd, Miami, FL',
            'status' => 'inactive',
            'review_status' => 'pending',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/communities/self-serve', [
            'community_name' => 'GREEN VALLEY',
            'address' => '200 Green Valley Rd, Miami, FL',
            'region_id' => $region->id,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['community_name']);
    }

    public function test_admin_update_rejects_rename_to_existing_name_in_region(): void
    {
        Sanctum::actingAs($this->systemAdmin());

        $region = $this->region('Florida');

        $existing = Community::query()->create([
            'name' => 'Green Valley',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Green Valley Rd, Miami, FL',
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $target = Community::query()->create([
            'name' => 'Sunset Ridge',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '500 Sunset Ridge Dr, Miami, FL',
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $this->putJson("/api/v1/admin/communities/{$target->id}", [
            'name' => 'green valley',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['name']);

        $target->refresh();
        $this->assertSame('Sunset Ridge', $target->name);
        $this->assertSame($existing->id, Community::query()->whereRaw('LOWER(TRIM(name)) = ?', ['green valley'])->value('id'));
    }
}
