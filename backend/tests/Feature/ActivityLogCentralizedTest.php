<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\ActivityLogService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ActivityLogCentralizedTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{region: Region, communityA: Community, communityB: Community, adminA: User, adminB: User, residentA: User, residentB: User, guest: User, sa: User}
     */
    private function seedWorld(): array
    {
        config(['billing.enabled' => false, 'billing.enforce' => false]);
        $this->seed(SystemAdminSeeder::class);
        $sa = User::query()->where('email', 'admin@havena.app')->firstOrFail();

        $region = Region::query()->create([
            'title' => 'Audit Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $communityA = Community::query()->create([
            'name' => 'Community Alpha',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $communityB = Community::query()->create([
            'name' => 'Community Beta',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $adminA = $this->makeCommunityAdmin('admin.a@example.com', $communityA);
        $adminB = $this->makeCommunityAdmin('admin.b@example.com', $communityB);
        $residentA = $this->makeResident('resident.a@example.com', $communityA);
        $residentB = $this->makeResident('resident.b@example.com', $communityB);
        $guest = User::factory()->create([
            'role' => 'guest',
            'status' => 'active',
            'email' => 'guest.audit@example.com',
        ]);

        return compact('region', 'communityA', 'communityB', 'adminA', 'adminB', 'residentA', 'residentB', 'guest', 'sa');
    }

    private function makeCommunityAdmin(string $email, Community $community): User
    {
        $admin = User::factory()->create([
            'email' => $email,
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

        return $admin;
    }

    private function makeResident(string $email, Community $community): User
    {
        $resident = User::factory()->create([
            'email' => $email,
            'role' => 'resident',
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return $resident;
    }

    public function test_resident_activity_is_isolated_to_that_resident(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['residentA']);
        ActivityLogService::user('login', 'Signed in to Havena', null, null, 'info', (int) $world['residentA']->id, [
            'community_id' => $world['communityA']->id,
        ]);
        Sanctum::actingAs($world['residentB']);
        ActivityLogService::user('login', 'Signed in to Havena', null, null, 'info', (int) $world['residentB']->id, [
            'community_id' => $world['communityB']->id,
        ]);

        Sanctum::actingAs($world['adminA']);
        $actions = collect($this->getJson("/api/v1/admin/members/{$world['residentA']->id}/activity-logs")
            ->assertOk()
            ->json('data'))->pluck('action');

        $this->assertTrue($actions->contains('login'));
        $this->assertCount(1, $actions);
    }

    public function test_community_admin_cannot_read_another_community_member_logs(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['residentA']);
        ActivityLogService::user('post_created', 'Posted in Alpha', 'Post', 1, 'info', (int) $world['residentA']->id, [
            'community_id' => $world['communityA']->id,
        ]);

        Sanctum::actingAs($world['adminB']);
        $this->getJson("/api/v1/admin/members/{$world['residentA']->id}/activity-logs")
            ->assertNotFound();
    }

    public function test_community_activity_is_isolated_by_community(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminA']);
        ActivityLogService::user('notice_created', 'Published a notice', 'Notice', 9, 'info', (int) $world['adminA']->id, [
            'community_id' => $world['communityA']->id,
            'module' => 'Notice',
        ]);
        Sanctum::actingAs($world['adminB']);
        ActivityLogService::user('notice_created', 'Published a notice', 'Notice', 10, 'info', (int) $world['adminB']->id, [
            'community_id' => $world['communityB']->id,
            'module' => 'Notice',
        ]);

        Sanctum::actingAs($world['sa']);
        $alpha = collect($this->getJson("/api/v1/admin/communities/{$world['communityA']->id}/activity-logs")
            ->assertOk()
            ->json('data'));
        $this->assertTrue($alpha->every(fn ($row) => (int) ($row['community_id'] ?? 0) === $world['communityA']->id
            || ($row['entity_type'] ?? null) === 'Community'));
        $this->assertTrue($alpha->pluck('description')->contains('Published a notice'));
        $this->assertFalse($alpha->contains(fn ($row) => ($row['community_id'] ?? null) === $world['communityB']->id));
    }

    public function test_community_admin_activity_endpoint_is_scoped_to_that_admin(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminA']);
        ActivityLogService::user('member_approved', 'Approved a member', 'User', (int) $world['residentA']->id, 'info', (int) $world['adminA']->id, [
            'community_id' => $world['communityA']->id,
            'affected_user_id' => $world['residentA']->id,
        ]);
        Sanctum::actingAs($world['adminB']);
        ActivityLogService::user('member_rejected', 'Rejected a member', 'User', (int) $world['residentB']->id, 'info', (int) $world['adminB']->id, [
            'community_id' => $world['communityB']->id,
        ]);

        Sanctum::actingAs($world['sa']);
        $actions = collect($this->getJson("/api/v1/admin/community-admins/{$world['adminA']->id}/activity-logs")
            ->assertOk()
            ->json('data'))->pluck('action');

        $this->assertTrue($actions->contains('member_approved'));
        $this->assertFalse($actions->contains('member_rejected'));
    }

    public function test_system_admin_can_read_global_logs_and_filters(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['residentA']);
        ActivityLogService::user('login', 'Signed in to Havena', null, null, 'info', (int) $world['residentA']->id, [
            'community_id' => $world['communityA']->id,
        ]);
        ActivityLogService::system('stripe_webhook_received', 'Stripe webhook processed', 'info', 'Billing', null, [
            'module' => 'Billing',
            'status' => 'processed',
        ]);

        Sanctum::actingAs($world['sa']);
        $this->getJson('/api/v1/activity-logs?tab=residents&per_page=10')
            ->assertOk()
            ->assertJsonPath('current_page', 1);
        $this->getJson('/api/v1/activity-logs?tab=system&search=Stripe')
            ->assertOk()
            ->assertJsonFragment(['action' => 'stripe_webhook_received']);
        $this->getJson('/api/v1/activity-logs?community_id='.$world['communityA']->id)
            ->assertOk();
        $this->getJson('/api/v1/activity-logs?per_page=1')
            ->assertOk()
            ->assertJsonPath('per_page', 1);
    }

    public function test_community_admin_cannot_access_global_activity_api(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminA']);
        $this->getJson('/api/v1/activity-logs')->assertForbidden();
        $this->getJson('/api/v1/activity-logs/stats')->assertForbidden();
        $this->getJson("/api/v1/admin/communities/{$world['communityA']->id}/activity-logs")->assertForbidden();
        $this->postJson('/api/v1/activity-logs', [
            'log_type' => 'user',
            'action' => 'spoofed',
            'description' => 'nope',
        ])->assertForbidden();
    }

    public function test_resident_and_guest_cannot_access_audit_apis(): void
    {
        $world = $this->seedWorld();

        Sanctum::actingAs($world['residentA']);
        $this->getJson('/api/v1/activity-logs')->assertForbidden();
        $this->getJson("/api/v1/admin/members/{$world['residentB']->id}/activity-logs")->assertForbidden();

        Sanctum::actingAs($world['guest']);
        $this->getJson('/api/v1/activity-logs')->assertForbidden();
        $this->getJson("/api/v1/admin/communities/{$world['communityA']->id}/activity-logs")->assertForbidden();
    }

    public function test_sensitive_values_are_never_stored(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['sa']);
        ActivityLogService::system('api_forbidden', 'Permission denied', 'warning', 'Auth', null, [
            'password' => 'super-secret',
            'otp' => '123456',
            'plaid_access_token' => 'access-sandbox-xxx',
            'stripe_secret' => 'sk_test_xxx',
            'authorization' => 'Bearer abc',
            'module' => 'Auth',
        ]);

        $row = \Illuminate\Support\Facades\DB::table('activity_logs')->where('action', 'api_forbidden')->first();
        $this->assertNotNull($row);
        $this->assertStringNotContainsString('super-secret', (string) $row->meta);
        $this->assertStringNotContainsString('123456', (string) $row->meta);
        $this->assertStringNotContainsString('access-sandbox-xxx', (string) $row->meta);
        $this->assertStringNotContainsString('sk_test_xxx', (string) $row->meta);
        $this->assertStringContainsString('[redacted]', (string) $row->meta);
    }

    public function test_important_actions_create_activity_rows(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['adminA']);
        ActivityLogService::user('community_features_updated', 'Updated resident features', 'Community', $world['communityA']->id, 'info', (int) $world['adminA']->id, [
            'community_id' => $world['communityA']->id,
            'module' => 'Community',
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'community_features_updated',
            'community_id' => $world['communityA']->id,
            'actor_type' => 'community_admin',
        ]);
    }

    public function test_filters_and_pagination_are_bounded(): void
    {
        $world = $this->seedWorld();
        Sanctum::actingAs($world['residentA']);
        foreach (['login', 'logout', 'profile_updated'] as $action) {
            ActivityLogService::user($action, $action.' event', 'User', (int) $world['residentA']->id, 'info', (int) $world['residentA']->id, [
                'community_id' => $world['communityA']->id,
                'module' => 'Auth',
                'status' => 'ok',
            ]);
        }

        Sanctum::actingAs($world['sa']);
        $this->getJson('/api/v1/activity-logs?tab=residents&module=Auth&action=login&status=ok&per_page=2')
            ->assertOk()
            ->assertJsonPath('per_page', 2)
            ->assertJsonPath('data.0.action', 'login');

        $page1 = $this->getJson('/api/v1/activity-logs?per_page=2&page=1')->assertOk();
        $this->assertCount(2, $page1->json('data'));
        $this->assertGreaterThanOrEqual(2, (int) $page1->json('last_page'));
    }

    public function test_plaid_webhook_writes_system_activity_without_secrets(): void
    {
        $this->seedWorld();
        config(['plaid.verify_webhooks' => false]);

        $this->postJson('/api/v1/plaid/webhook', [
            'webhook_type' => 'ITEM',
            'webhook_code' => 'ERROR',
            'item_id' => 'item-unknown',
            'access_token' => 'access-sandbox-should-redact',
        ])->assertOk();

        $row = \Illuminate\Support\Facades\DB::table('activity_logs')->where('action', 'plaid_webhook_received')->first();
        $this->assertNotNull($row);
        $this->assertSame('system', $row->log_type);
        $this->assertStringNotContainsString('access-sandbox-should-redact', (string) $row->meta);
    }
}
