<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\CommunityFeatureService;
use App\Services\UserActingContextService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResidentModeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{community: Community, other: Community, admin: User, resident: User}
     */
    private function seedWorld(): array
    {
        config(['billing.enabled' => false, 'billing.enforce' => false]);

        $region = Region::query()->create([
            'title' => 'Mode Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Alpha Heights',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $other = Community::query()->create([
            'name' => 'Beta Gardens',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return compact('community', 'other', 'admin', 'resident');
    }

    public function test_community_admin_can_switch_to_resident_mode_without_new_account(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['admin']);

        $this->putJson('/api/v1/me/active-context', [
            'context' => 'resident',
            'community_id' => $world['community']->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.id', $world['admin']->id)
            ->assertJsonPath('data.role', 'community_admin')
            ->assertJsonPath('data.active_context', 'resident')
            ->assertJsonPath('data.active_mode', 'resident')
            ->assertJsonPath('data.active_context_community_id', $world['community']->id)
            ->assertJsonPath('data.can_use_resident_mode', true)
            ->assertJsonPath('data.can_switch_modes', true)
            ->assertJsonPath('data.can_use_admin_mode', true);

        $this->assertDatabaseHas('users', [
            'id' => $world['admin']->id,
            'role' => 'community_admin',
            'active_context' => 'resident',
        ]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'switched_to_resident_mode',
            'user_id' => $world['admin']->id,
            'community_id' => $world['community']->id,
        ]);
    }

    public function test_resident_mode_blocks_admin_apis(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['admin']);
        UserActingContextService::switch($world['admin'], 'resident', $world['community']->id);

        $this->getJson('/api/v1/admin/members')->assertForbidden()->assertJsonPath('code', 'RESIDENT_MODE_ACTIVE');
        $this->getJson('/api/v1/admin/resident-features')->assertForbidden();
        $this->getJson('/api/v1/plaid/connection')->assertForbidden();
    }

    public function test_resident_mode_respects_community_feature_flags(): void
    {
        $world = $this->seedWorld();
        app(CommunityFeatureService::class)->save($world['community']->id, [
            'feed' => false,
            'marketplace' => false,
            'notices' => true,
        ], $world['admin']);

        Sanctum::actingAs($world['admin']);
        $this->getJson('/api/v1/feed')->assertOk();

        UserActingContextService::switch($world['admin']->fresh(), 'resident', $world['community']->id);
        Sanctum::actingAs($world['admin']->fresh());

        $this->getJson('/api/v1/feed')->assertForbidden();
        $this->getJson('/api/v1/listings')->assertForbidden();
        $this->getJson('/api/v1/notices')->assertOk();
        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.resident_features.features.feed', false)
            ->assertJsonPath('data.resident_features.features.notices', true);
    }

    public function test_resident_mode_actions_log_as_resident_context(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['admin']);
        UserActingContextService::switch($world['admin'], 'resident', $world['community']->id);
        Sanctum::actingAs($world['admin']->fresh());

        ActivityLogService::user('post_created', 'Posted in Resident Mode', 'Post', 9, 'info', (int) $world['admin']->id, [
            'community_id' => $world['community']->id,
            'module' => 'Feed',
        ]);

        $row = DB::table('activity_logs')->where('action', 'post_created')->first();
        $this->assertNotNull($row);
        $this->assertSame((int) $world['admin']->id, (int) $row->actor_user_id);
        $this->assertSame('resident', $row->actor_role);
        $this->assertSame('resident', $row->actor_type);
        $this->assertSame($world['community']->id, (int) $row->community_id);

        $meta = json_decode((string) $row->meta, true);
        $this->assertSame('community_admin', $meta['account_role'] ?? null);
        $this->assertSame('resident', $meta['active_context'] ?? null);
        $this->assertSame('resident', $meta['active_mode'] ?? null);
    }

    public function test_switch_back_to_admin_restores_admin_apis(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['admin']);
        UserActingContextService::switch($world['admin'], 'resident', $world['community']->id);

        $this->putJson('/api/v1/me/active-context', ['context' => 'community_admin'])
            ->assertOk()
            ->assertJsonPath('data.active_context', 'community_admin')
            ->assertJsonPath('data.active_mode', 'community_admin')
            ->assertJsonPath('data.active_context_community_id', $world['community']->id);

        $this->getJson('/api/v1/admin/members')->assertOk();
        $this->assertDatabaseHas('users', [
            'id' => $world['admin']->id,
            'active_context' => 'community_admin',
            'active_context_community_id' => $world['community']->id,
        ]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'switched_to_admin_mode',
            'user_id' => $world['admin']->id,
            'community_id' => $world['community']->id,
        ]);

        Sanctum::actingAs($world['admin']->fresh());
        ActivityLogService::user('member_approved', 'Approved resident', 'User', (int) $world['resident']->id, 'info', (int) $world['admin']->id, [
            'community_id' => $world['community']->id,
            'module' => 'Members',
        ]);
        $adminAction = DB::table('activity_logs')->where('action', 'member_approved')->first();
        $this->assertSame('community_admin', $adminAction->actor_role);
        $this->assertSame('community_admin', $adminAction->actor_type);
        $adminMeta = json_decode((string) $adminAction->meta, true);
        $this->assertSame('community_admin', $adminMeta['account_role'] ?? null);
        $this->assertSame('community_admin', $adminMeta['active_context'] ?? null);
    }

    public function test_mode_switch_keeps_the_same_community_without_explicit_id(): void
    {
        $world = $this->seedWorld();
        CommunityMembership::query()->create([
            'user_id' => $world['admin']->id,
            'community_id' => $world['other']->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        $world['admin']->forceFill([
            'active_context' => 'community_admin',
            'active_context_community_id' => $world['other']->id,
        ])->save();

        Sanctum::actingAs($world['admin']->fresh());

        $this->putJson('/api/v1/me/active-context', ['active_mode' => 'resident'])
            ->assertOk()
            ->assertJsonPath('data.active_mode', 'resident')
            ->assertJsonPath('data.active_context_community_id', $world['other']->id);

        $this->putJson('/api/v1/me/active-context', ['active_mode' => 'community_admin'])
            ->assertOk()
            ->assertJsonPath('data.active_mode', 'community_admin')
            ->assertJsonPath('data.active_context_community_id', $world['other']->id);
    }

    public function test_cannot_enter_another_community_in_resident_mode(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['admin']);

        $this->putJson('/api/v1/me/active-context', [
            'context' => 'resident',
            'community_id' => $world['other']->id,
        ])->assertStatus(422);
    }

    public function test_resident_cannot_use_active_context_switch(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['resident']);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.role', 'resident')
            ->assertJsonPath('data.can_switch_modes', false)
            ->assertJsonPath('data.can_use_admin_mode', false);

        $this->putJson('/api/v1/me/active-context', [
            'context' => 'resident',
            'community_id' => $world['community']->id,
        ])->assertForbidden()->assertJsonPath('code', 'MODE_SWITCH_NOT_ALLOWED');

        $this->putJson('/api/v1/me/active-context', [
            'active_mode' => 'community_admin',
            'community_id' => $world['community']->id,
        ])->assertForbidden()->assertJsonPath('code', 'MODE_SWITCH_NOT_ALLOWED');

        $this->getJson('/api/v1/admin/members')->assertForbidden();
    }
}
