<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityFeatureService;
use App\Support\CommunityFeatureCatalog;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityFeatureManagementTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(string $name = 'Feature Community', string $reviewStatus = 'approved'): Community
    {
        $region = Region::query()->create([
            'title' => $name.' Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => $name,
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => $reviewStatus,
            'estimated_residents' => 40,
        ]);
    }

    private function seedCommunityAdmin(Community $community, string $adminStatus = 'approved', string $membershipStatus = 'approved'): User
    {
        $admin = User::factory()->create([
            'name' => 'Community Admin',
            'role' => 'community_admin',
            'community_admin_status' => $adminStatus,
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => $membershipStatus,
        ]);

        return $admin;
    }

    private function seedResident(Community $community): User
    {
        $resident = User::factory()->create([
            'name' => 'Resident User',
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return $resident;
    }

    private function seedSystemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    public function test_new_community_defaults_to_all_features_on(): void
    {
        $community = $this->seedCommunity();
        $payload = app(CommunityFeatureService::class)->payloadForCommunity($community->id);

        $this->assertFalse($payload['configured']);
        foreach (CommunityFeatureCatalog::keys() as $key) {
            $this->assertTrue($payload['features'][$key], $key.' should default on');
        }
        $this->assertDatabaseCount('community_feature_flags', 0);
    }

    public function test_existing_communities_continue_with_all_features_enabled(): void
    {
        $community = $this->seedCommunity('Legacy Community');
        $resident = $this->seedResident($community);

        Sanctum::actingAs($resident);

        $this->getJson('/api/v1/feed')->assertOk();
        $this->getJson('/api/v1/notices')->assertOk();
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.resident_features.features.feed', true)
            ->assertJsonPath('data.resident_features.features.marketplace', true);
    }

    public function test_community_admin_can_disable_and_enable_features(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['feed' => false, 'marketplace' => true],
        ])->assertOk()
            ->assertJsonPath('data.features.feed', false)
            ->assertJsonPath('data.features.marketplace', true);

        $this->assertNotNull($community->fresh()->resident_features_configured_at);

        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['feed' => true],
        ])->assertOk()
            ->assertJsonPath('data.features.feed', true);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'community_features_updated',
            'entity_id' => $community->id,
        ]);
    }

    public function test_system_admin_can_adjust_feature_sets(): void
    {
        $community = $this->seedCommunity();
        $systemAdmin = $this->seedSystemAdmin();

        Sanctum::actingAs($systemAdmin);

        $this->getJson('/api/v1/admin/communities/'.$community->id.'/resident-features')
            ->assertOk()
            ->assertJsonPath('data.features.events', true);

        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['events' => false],
        ])->assertOk()
            ->assertJsonPath('data.features.events', false);
    }

    public function test_disabled_feature_blocks_resident_api_and_leaves_other_community_unaffected(): void
    {
        $alpha = $this->seedCommunity('Alpha');
        $beta = $this->seedCommunity('Beta');
        $admin = $this->seedCommunityAdmin($alpha);
        $residentA = $this->seedResident($alpha);
        $residentB = $this->seedResident($beta);

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['feed' => false],
        ])->assertOk();

        Sanctum::actingAs($residentA);
        $this->getJson('/api/v1/feed')
            ->assertForbidden()
            ->assertJsonPath('code', 'COMMUNITY_FEATURE_DISABLED');
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.resident_features.features.feed', false);

        Sanctum::actingAs($residentB);
        $this->getJson('/api/v1/feed')->assertOk();
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.resident_features.features.feed', true);
    }

    public function test_pending_community_requires_resident_features_step_after_billing(): void
    {
        $community = $this->seedCommunity('Pending Community', 'pending');
        $admin = $this->seedCommunityAdmin($community, 'pending', 'pending');

        $this->assertTrue(app(CommunityFeatureService::class)->requiresOnboardingConfiguration($community->id));

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/resident-features', [
            'features' => CommunityFeatureCatalog::defaultFlags(),
        ])->assertOk();

        $this->assertFalse(app(CommunityFeatureService::class)->requiresOnboardingConfiguration($community->id));
    }

    public function test_resident_cannot_modify_feature_settings(): void
    {
        $community = $this->seedCommunity();
        $resident = $this->seedResident($community);

        Sanctum::actingAs($resident);

        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['feed' => false],
        ])->assertForbidden();

        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['feed' => false],
        ])->assertForbidden();
    }

    public function test_community_admin_cannot_manage_another_community(): void
    {
        $alpha = $this->seedCommunity('Alpha');
        $beta = $this->seedCommunity('Beta');
        $admin = $this->seedCommunityAdmin($alpha);

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/communities/'.$beta->id.'/resident-features', [
            'features' => ['feed' => false],
        ])->assertForbidden();
    }

    public function test_activity_log_records_previous_and_new_state(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['messages' => false],
        ])->assertOk();

        $log = \Illuminate\Support\Facades\DB::table('activity_logs')
            ->where('action', 'community_features_updated')
            ->where('entity_id', $community->id)
            ->first();

        $this->assertNotNull($log);
        $meta = json_decode((string) $log->meta, true);
        $this->assertIsArray($meta);
        $changes = $meta['changes'] ?? [];
        $this->assertNotEmpty($changes);
        $messages = collect($changes)->firstWhere('key', 'messages');
        $this->assertSame('On', $messages['previous'] ?? null);
        $this->assertSame('Off', $messages['next'] ?? null);
    }

    public function test_mobile_and_web_share_the_same_me_feature_payload(): void
    {
        $community = $this->seedCommunity();
        $resident = $this->seedResident($community);
        $admin = $this->seedCommunityAdmin($community);

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['wellness' => false, 'messages' => false],
        ])->assertOk();

        Sanctum::actingAs($resident);
        $me = $this->getJson('/api/v1/me')->assertOk()->json('data.resident_features');

        $this->assertFalse($me['features']['wellness']);
        $this->assertFalse($me['features']['messages']);
        $this->assertTrue($me['features']['feed']);
        $this->assertNotEmpty($me['catalog']);
        $this->assertSame(count(CommunityFeatureCatalog::keys()), count($me['catalog']));
    }
}
