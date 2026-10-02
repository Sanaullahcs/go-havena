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

    public function test_community_admin_disable_requires_system_admin_approval(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $systemAdmin = $this->seedSystemAdmin();

        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['feed' => false],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['disable_reasons.feed']);

        $this->postJson('/api/v1/admin/resident-features/disable-requests', [
            'feature_key' => 'feed',
            'reason' => 'Residents are not using the feed this season.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.feature_key', 'feed')
            ->assertJsonPath('features.features.feed', true)
            ->assertJsonPath('features.requests.0.status', 'pending')
            ->assertJsonPath('features.requests.0.action', 'disable')
            ->assertJsonPath('features.pending_requests.0.feature_key', 'feed');

        $this->assertDatabaseHas('community_feature_disable_requests', [
            'community_id' => $community->id,
            'feature_key' => 'feed',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($systemAdmin);
        $requestId = \App\Models\CommunityFeatureDisableRequest::query()->value('id');
        $this->postJson('/api/v1/admin/feature-disable-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertFalse(app(CommunityFeatureService::class)->isEnabled($community->id, 'feed'));
        $this->assertDatabaseHas('community_feature_flags', [
            'community_id' => $community->id,
            'feature_key' => 'feed',
            'enabled' => false,
            'disabled_by' => 'community_admin',
        ]);

        Sanctum::actingAs($admin);
        $catalog = collect($this->getJson('/api/v1/admin/resident-features')->assertOk()->json('data.catalog'));
        $this->assertTrue($catalog->contains(fn ($item) => $item['key'] === 'feed' && $item['disabled_by'] === 'community_admin'));

        $this->postJson('/api/v1/admin/resident-features/enable-requests', [
            'feature_key' => 'feed',
            'reason' => 'Residents asked for the feed to come back.',
        ])->assertOk()
            ->assertJsonPath('data.action', 'enable')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('features.features.feed', false);

        $this->assertFalse(app(CommunityFeatureService::class)->isEnabled($community->id, 'feed'));

        Sanctum::actingAs($systemAdmin);
        $rejectedId = \App\Models\CommunityFeatureDisableRequest::query()->where('action', 'enable')->value('id');
        $this->postJson('/api/v1/admin/feature-disable-requests/'.$rejectedId.'/reject')
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.action', 'enable');
        $this->assertFalse(app(CommunityFeatureService::class)->isEnabled($community->id, 'feed'));

        Sanctum::actingAs($admin);
        $afterReject = $this->getJson('/api/v1/admin/resident-features')->assertOk()->json('data');
        $this->assertSame('rejected', $afterReject['requests'][0]['status']);
        $this->assertSame('enable', $afterReject['requests'][0]['action']);
        $this->assertCount(0, $afterReject['pending_requests']);
        $this->assertFalse($afterReject['features']['feed']);
        $this->assertTrue(collect($afterReject['catalog'])->contains(
            fn ($item) => $item['key'] === 'feed' && $item['disabled_by'] === 'community_admin',
        ));

        $this->postJson('/api/v1/admin/resident-features/enable-requests', [
            'feature_key' => 'feed',
            'reason' => 'Residents asked again for the feed to come back.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('features.features.feed', false);

        Sanctum::actingAs($systemAdmin);
        $enableId = \App\Models\CommunityFeatureDisableRequest::query()
            ->where('action', 'enable')
            ->where('status', 'pending')
            ->value('id');
        $this->postJson('/api/v1/admin/feature-disable-requests/'.$enableId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.action', 'enable');

        $flag = \App\Models\CommunityFeatureFlag::query()
            ->where('community_id', $community->id)
            ->where('feature_key', 'feed')
            ->first();
        $this->assertNotNull($flag);
        $this->assertTrue($flag->enabled);
        $this->assertNull($flag->disabled_by);

        Sanctum::actingAs($admin);
        $afterApprove = $this->getJson('/api/v1/admin/resident-features')->assertOk()->json('data');
        $this->assertTrue($afterApprove['features']['feed']);
        $this->assertSame('approved', $afterApprove['requests'][0]['status']);
        $this->assertSame('enable', $afterApprove['requests'][0]['action']);
        $this->assertTrue(collect($afterApprove['catalog'])->contains(
            fn ($item) => $item['key'] === 'feed' && $item['enabled'] === true,
        ));

        Sanctum::actingAs($systemAdmin);
        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['feed' => true],
        ])->assertOk()
            ->assertJsonPath('data.features.feed', true);
    }

    public function test_system_admin_disable_is_hidden_from_community_admin_and_cannot_be_reenabled(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $resident = $this->seedResident($community);
        $systemAdmin = $this->seedSystemAdmin();

        Sanctum::actingAs($systemAdmin);
        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['marketplace' => false],
        ])->assertOk()
            ->assertJsonPath('data.features.marketplace', false);

        $this->assertDatabaseHas('community_feature_flags', [
            'community_id' => $community->id,
            'feature_key' => 'marketplace',
            'enabled' => false,
            'disabled_by' => 'system_admin',
        ]);

        Sanctum::actingAs($admin);
        $payload = $this->getJson('/api/v1/admin/resident-features')->assertOk()->json('data');
        $this->assertFalse($payload['features']['marketplace']);
        $this->assertFalse(collect($payload['catalog'])->contains(fn ($item) => $item['key'] === 'marketplace'));

        $meCatalog = collect($this->getJson('/api/v1/me')->assertOk()->json('data.resident_features.catalog'));
        $this->assertFalse($meCatalog->contains(fn ($item) => $item['key'] === 'marketplace'));

        $this->postJson('/api/v1/admin/resident-features/enable', [
            'feature_key' => 'marketplace',
        ])->assertUnprocessable();

        $this->postJson('/api/v1/admin/resident-features/enable-requests', [
            'feature_key' => 'marketplace',
            'reason' => 'Please turn marketplace back on.',
        ])->assertUnprocessable();

        $this->putJson('/api/v1/admin/resident-features', [
            'features' => ['marketplace' => true],
        ])->assertUnprocessable();

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.resident_features.features.marketplace', false);

        Sanctum::actingAs($systemAdmin);
        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['marketplace' => true],
        ])->assertOk()
            ->assertJsonPath('data.features.marketplace', true);

        Sanctum::actingAs($admin);
        $restored = $this->getJson('/api/v1/admin/resident-features')->assertOk()->json('data');
        $this->assertTrue($restored['features']['marketplace']);
        $this->assertTrue(collect($restored['catalog'])->contains(
            fn ($item) => $item['key'] === 'marketplace' && $item['enabled'] === true,
        ));
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

        Sanctum::actingAs($this->seedSystemAdmin());
        $this->putJson('/api/v1/admin/communities/'.$alpha->id.'/resident-features', [
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

    public function test_pending_community_does_not_require_resident_features_during_signup(): void
    {
        $community = $this->seedCommunity('Pending Community', 'pending');
        $admin = $this->seedCommunityAdmin($community, 'pending', 'pending');

        $this->assertFalse(app(CommunityFeatureService::class)->requiresOnboardingConfiguration($community->id));

        $access = app(\App\Services\CommunityAdminAccessService::class)->accessPayload($admin->fresh());
        $this->assertNotSame('configure_resident_features', $access['next_step']);
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

        Sanctum::actingAs($this->seedSystemAdmin());
        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
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

        Sanctum::actingAs($this->seedSystemAdmin());
        $this->putJson('/api/v1/admin/communities/'.$community->id.'/resident-features', [
            'features' => ['wellness' => false, 'messages' => false],
        ])->assertOk();

        Sanctum::actingAs($resident);
        $me = $this->getJson('/api/v1/me')->assertOk()->json('data.resident_features');

        $this->assertFalse($me['features']['wellness']);
        $this->assertFalse($me['features']['messages']);
        $this->assertTrue($me['features']['feed']);
        $this->assertNotEmpty($me['catalog']);
        $catalogKeys = collect($me['catalog'])->pluck('key');
        $this->assertFalse($catalogKeys->contains('wellness'));
        $this->assertFalse($catalogKeys->contains('messages'));
        $this->assertTrue($catalogKeys->contains('feed'));
    }
}
