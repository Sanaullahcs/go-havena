<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ActivityLogAuditTest extends TestCase
{
    use RefreshDatabase;

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function communityAdmin(): User
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'name' => 'John Smith',
            'email' => 'john.smith@example.com',
            'phone' => '+15555550100',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        Profile::query()->create([
            'user_id' => $admin->id,
            'display_name' => 'John Smith',
            'unit_number' => 'A-1',
            'residence_type' => 'homeowner',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    public function test_system_admin_profile_update_stores_field_level_changes(): void
    {
        $actor = $this->systemAdmin();
        $target = $this->communityAdmin();
        Sanctum::actingAs($actor);

        $this->patchJson("/api/v1/admin/community-admins/{$target->id}", [
            'name' => 'John A. Smith',
            'email' => 'john.a.smith@example.com',
            'phone' => '+15555550999',
        ])->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'community_admin_updated',
            'entity_type' => 'User',
            'entity_id' => $target->id,
        ]);

        $log = $this->getJson('/api/v1/activity-logs?search=John')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('community_admin_updated', $log['action']);
        $this->assertSame('System Admin, '.$actor->name, $log['performed_by']);
        $this->assertSame('John A. Smith', $log['affected_user']);
        $this->assertSame($target->id, $log['affected_user_id']);
        $this->assertSame('User', $log['entity_type']);
        $this->assertSame($target->id, $log['entity_id']);

        $byField = collect($log['changes'])->keyBy('field');
        $this->assertSame('John Smith', $byField['Name']['previous']);
        $this->assertSame('John A. Smith', $byField['Name']['next']);
        $this->assertSame('john.smith@example.com', $byField['Email']['previous']);
        $this->assertSame('john.a.smith@example.com', $byField['Email']['next']);
        $this->assertSame('+15555550100', $byField['Phone']['previous']);
        $this->assertSame('+15555550999', $byField['Phone']['next']);
        $this->assertStringContainsString('System Admin, '.$actor->name, $log['description']);
        $this->assertStringContainsString('Name: John Smith → John A. Smith', $log['description']);
    }

    public function test_self_profile_update_records_old_and_new_values(): void
    {
        $user = User::factory()->create([
            'name' => 'Sana',
            'email' => 'sana@example.com',
            'phone' => '+15555550011',
            'role' => 'resident',
            'status' => 'active',
        ]);
        $user->profile()->create([
            'display_name' => 'Sana',
            'bio' => 'Hello',
            'updated_at' => now()->addMinute(),
        ]);

        Sanctum::actingAs($user);

        $this->putJson('/api/v1/me', [
            'name' => 'Sana Ali',
            'phone' => '+15555550022',
            'bio' => 'Updated bio',
        ])->assertOk();

        Sanctum::actingAs($this->systemAdmin());

        $log = $this->getJson('/api/v1/activity-logs?search=Sana')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('profile_updated', $log['action']);
        $this->assertSame('Resident, Sana Ali', $log['performed_by']);
        $this->assertSame('Sana Ali', $log['affected_user']);

        $byField = collect($log['changes'])->keyBy('field');
        $this->assertSame('Sana', $byField['Name']['previous']);
        $this->assertSame('Sana Ali', $byField['Name']['next']);
        $this->assertSame('+15555550011', $byField['Phone']['previous']);
        $this->assertSame('+15555550022', $byField['Phone']['next']);
        $this->assertSame('Hello', $byField['Bio']['previous']);
        $this->assertSame('Updated bio', $byField['Bio']['next']);
    }

    public function test_member_activity_includes_admin_changes_to_that_user(): void
    {
        $actor = $this->systemAdmin();
        $target = $this->communityAdmin();
        $communityId = CommunityMembership::query()->where('user_id', $target->id)->value('community_id');

        Sanctum::actingAs($actor);
        $this->patchJson("/api/v1/admin/community-admins/{$target->id}", [
            'name' => 'John A. Smith',
        ])->assertOk();

        $response = $this->getJson("/api/v1/admin/members/{$target->id}/activity-logs?community_id={$communityId}")
            ->assertOk();

        $log = collect($response->json('data'))->firstWhere('action', 'community_admin_updated');
        $this->assertNotNull($log);
        $this->assertSame('System Admin, '.$actor->name, $log['performed_by']);
        $this->assertSame('John A. Smith', $log['affected_user']);
        $this->assertSame('John Smith', collect($log['changes'])->firstWhere('field', 'Name')['previous']);
        $this->assertSame('John A. Smith', collect($log['changes'])->firstWhere('field', 'Name')['next']);
    }
}
