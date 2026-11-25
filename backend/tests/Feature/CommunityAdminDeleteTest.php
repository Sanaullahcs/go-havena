<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);
    }

    private function seedCommunityWithAdmin(Region $region): array
    {
        $admin = User::factory()->create([
            'name'                   => 'Palm Admin',
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => '+201555000111',
            'email'                  => 'admin.palm@example.com',
        ]);

        $community = Community::query()->create([
            'name'                 => 'Palm Heights',
            'region_id'            => $region->id,
            'region'               => $region->title,
            'status'               => 'active',
            'review_status'        => 'approved',
            'requested_by_user_id' => $admin->id,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return compact('community', 'admin');
    }

    private function systemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    public function test_system_admin_can_delete_assigned_admin_without_removing_community_data(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);

        $resident = User::factory()->create([
            'name'  => 'Palm Resident',
            'role'  => 'resident',
            'status' => 'active',
            'email' => 'resident.palm@example.com',
            'phone' => '+201555000333',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        $now = now();
        $noticeId = DB::table('notices')->insertGetId([
            'community_id'  => $community->id,
            'author_id'     => $admin->id,
            'title'         => 'Pool hours',
            'body'          => 'Opens at 8 AM',
            'category'      => 'general',
            'status'        => 'published',
            'review_status' => 'approved',
            'published_at'  => $now,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);
        $documentId = DB::table('community_documents')->insertGetId([
            'community_id' => $community->id,
            'created_by'   => $admin->id,
            'title'        => 'Bylaws',
            'category'     => 'rules',
            'file_path'    => 'documents/bylaws.pdf',
            'file_name'    => 'bylaws.pdf',
            'file_size'    => 1024,
            'status'       => 'active',
            'created_at'   => $now,
            'updated_at'   => $now,
        ]);

        $actor = $this->systemAdmin();
        Sanctum::actingAs($actor);

        $response = $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", [
            'confirmation' => 'DELETE',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Community Admin deleted successfully.');

        $this->assertSoftDeleted('users', ['id' => $admin->id]);
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'status' => 'deleted']);
        $this->assertNull(User::query()->find($admin->id));

        $community = $community->fresh();
        $this->assertNotNull($community);
        $this->assertSame('active', $community->status);
        $this->assertSame($admin->id, $community->requested_by_user_id);
        $this->assertFalse(app(\App\Services\CommunityLifecycleService::class)->hasCommunityAdminAssigned($community));

        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'banned',
        ]);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);
        $this->assertDatabaseHas('notices', ['id' => $noticeId, 'community_id' => $community->id]);
        $this->assertDatabaseHas('community_documents', ['id' => $documentId, 'community_id' => $community->id]);

        $approved = $this->getJson('/api/v1/admin/community-admins?status=approved')
            ->assertOk()
            ->json('data');
        $this->assertNull(collect($approved)->firstWhere('id', $admin->id));

        $log = DB::table('activity_logs')
            ->where('action', 'community_admin_deleted')
            ->where('entity_id', $admin->id)
            ->first();
        $this->assertNotNull($log);
        $this->assertSame($actor->id, $log->user_id);
        $meta = json_decode($log->meta, true);
        $this->assertSame($admin->id, $meta['deleted_admin']['id']);
        $this->assertSame($admin->name, $meta['deleted_admin']['name']);
        $this->assertSame($community->id, $meta['communities'][0]['id']);
        $this->assertSame('Palm Heights', $meta['communities'][0]['name']);
        $this->assertSame($actor->id, $meta['performed_by']['id']);
        $this->assertNotEmpty($meta['performed_at']);
    }

    public function test_system_admin_can_delete_unassigned_community_admin(): void
    {
        $admin = User::factory()->create([
            'name'                   => 'Free Admin',
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'email'                  => 'free.admin@example.com',
        ]);
        $actor = $this->systemAdmin();
        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", [
            'confirmation' => 'DELETE',
        ])->assertOk();

        $this->assertSoftDeleted('users', ['id' => $admin->id]);

        $log = DB::table('activity_logs')
            ->where('action', 'community_admin_deleted')
            ->where('entity_id', $admin->id)
            ->first();
        $this->assertNotNull($log);
        $meta = json_decode($log->meta, true);
        $this->assertSame([], $meta['communities']);
        $this->assertSame($actor->id, $meta['performed_by']['id']);
    }

    public function test_delete_requires_delete_confirmation_token(): void
    {
        $region = $this->seedRegion();
        ['admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}")
            ->assertUnprocessable();
        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", [
            'confirmation' => 'delete',
        ])->assertUnprocessable();

        $this->assertDatabaseHas('users', [
            'id'     => $admin->id,
            'status' => 'active',
        ]);
        $this->assertNull($admin->fresh()->deleted_at);
    }

    public function test_system_admin_cannot_delete_own_account(): void
    {
        $actor = $this->systemAdmin();
        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/admin/community-admins/{$actor->id}", [
            'confirmation' => 'DELETE',
        ])->assertForbidden()
            ->assertJsonPath('message', 'You cannot delete your own account.');

        $this->assertDatabaseHas('users', [
            'id'     => $actor->id,
            'status' => 'active',
        ]);
    }

    public function test_cannot_delete_non_community_admin_user(): void
    {
        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'email'  => 'plain.resident@example.com',
        ]);
        Sanctum::actingAs($this->systemAdmin());

        $this->deleteJson("/api/v1/admin/community-admins/{$resident->id}", [
            'confirmation' => 'DELETE',
        ])->assertNotFound();

        $this->assertDatabaseHas('users', [
            'id'     => $resident->id,
            'status' => 'active',
        ]);
        $this->assertNull($resident->fresh()->deleted_at);
    }

    public function test_community_admin_cannot_delete_another_admin(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        $other = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'email'                  => 'other.admin@example.com',
            'phone'                  => '+201555000444',
        ]);
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/admin/community-admins/{$other->id}", [
            'confirmation' => 'DELETE',
        ])->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $other->id, 'status' => 'active']);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);
    }

    public function test_guest_cannot_delete_community_admin(): void
    {
        $region = $this->seedRegion();
        ['admin' => $admin] = $this->seedCommunityWithAdmin($region);

        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", [
            'confirmation' => 'DELETE',
        ])->assertUnauthorized();

        $this->assertNull($admin->fresh()->deleted_at);
    }

    public function test_failed_delete_rolls_back_assignment_and_account(): void
    {
        $region = $this->seedRegion();
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithAdmin($region);
        Sanctum::actingAs($this->systemAdmin());

        User::deleting(function (User $user) use ($admin) {
            if ((int) $user->id === (int) $admin->id) {
                throw new \RuntimeException('forced delete failure');
            }
        });

        $this->deleteJson("/api/v1/admin/community-admins/{$admin->id}", [
            'confirmation' => 'DELETE',
        ])->assertStatus(500);

        $this->assertNull($admin->fresh()->deleted_at);
        $this->assertSame('active', $admin->fresh()->status);
        $this->assertDatabaseHas('community_memberships', [
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);
        $this->assertDatabaseHas('communities', [
            'id'     => $community->id,
            'status' => 'active',
        ]);
        $this->assertDatabaseMissing('activity_logs', [
            'action'    => 'community_admin_deleted',
            'entity_id' => $admin->id,
        ]);
    }
}
