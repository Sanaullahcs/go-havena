<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationCommunityScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
    }

    public function test_community_admins_only_see_their_current_community_notifications(): void
    {
        [$region] = $this->region();
        $oak = $this->community($region, 'Oak Valley');
        $pine = $this->community($region, 'Pine Court');
        $oakAdmin = $this->admin($oak, '+201711000001', 'oak.admin@havena.test');
        $pineAdmin = $this->admin($pine, '+201711000002', 'pine.admin@havena.test');

        $oakNotice = $this->storeNotification($oakAdmin->id, 'Oak pool booking', $oak->id);
        $leaked = $this->storeNotification($oakAdmin->id, 'Pine moderation report', $pine->id);
        $historical = $this->storeNotification($oakAdmin->id, 'Old marketplace listing', null, null, now()->subYear());
        $this->storeNotification($pineAdmin->id, 'Pine membership approved', $pine->id);

        Sanctum::actingAs($oakAdmin);

        $titles = $this->getJson('/api/v1/notifications?community_id='.$pine->id)
            ->assertOk()
            ->json('data');

        $this->assertSame(['Oak pool booking'], array_column($titles, 'title'));
        $this->assertSame(1, $this->getJson('/api/v1/notifications')->json('unread'));

        $this->postJson('/api/v1/notifications/'.$leaked.'/read')->assertNotFound();
        $this->assertNull(DB::table('app_notifications')->where('id', $leaked)->value('read_at'));

        $this->postJson('/api/v1/notifications/read-all')->assertOk();
        $this->assertNotNull(DB::table('app_notifications')->where('id', $oakNotice)->value('read_at'));
        $this->assertNull(DB::table('app_notifications')->where('id', $historical)->value('read_at'));
        $this->assertNull(DB::table('app_notifications')->where('id', $leaked)->value('read_at'));

        Sanctum::actingAs($pineAdmin);
        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Pine membership approved')
            ->assertJsonPath('unread', 1);
    }

    public function test_reassignment_suspension_and_reactivation_follow_the_current_assignment(): void
    {
        [$region] = $this->region();
        $oak = $this->community($region, 'Oak Valley');
        $pine = $this->community($region, 'Pine Court');
        $admin = $this->admin($oak, '+201711000011', 'moving.admin@havena.test');
        $this->admin($pine, '+201711000012', 'pine.holder@havena.test');

        $oakNotice = $this->storeNotification($admin->id, 'Oak amenity request', $oak->id);
        $account = $this->storeNotification($admin->id, 'Admin access suspended', null, 'account');

        $lifecycle = app(CommunityLifecycleService::class);
        $lifecycle->releaseCommunityAdmin($oak);
        $lifecycle->assignCommunityAdmin($pine, $admin->fresh());

        $pineNotice = $this->storeNotification($admin->id, 'Pine notice pending', $pine->id);

        Sanctum::actingAs($admin->fresh());
        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Pine notice pending'])
            ->assertJsonMissing(['title' => 'Oak amenity request']);

        $admin->update(['status' => 'suspended']);
        Sanctum::actingAs($admin->fresh());
        $this->getJson('/api/v1/notifications')->assertForbidden();

        $admin->update(['status' => 'active', 'suspension_reason' => null]);
        Sanctum::actingAs($admin->fresh());
        $restored = collect($this->getJson('/api/v1/notifications')->assertOk()->json('data'))->pluck('title');
        $this->assertTrue($restored->contains('Pine notice pending'));
        $this->assertFalse($restored->contains('Oak amenity request'));

        $this->postJson('/api/v1/notifications/'.$oakNotice.'/read')->assertNotFound();
        $this->postJson('/api/v1/notifications/'.$account.'/read')->assertOk();
        $this->postJson('/api/v1/notifications/'.$pineNotice.'/read')->assertOk();
    }

    public function test_resident_and_system_admin_notifications_stay_unscoped(): void
    {
        [$region] = $this->region();
        $oak = $this->community($region, 'Oak Valley');
        $admin = $this->admin($oak, '+201711000021', 'mode.admin@havena.test');
        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201711000022',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $oak->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);
        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201711000023',
        ]);

        $this->storeNotification($resident->id, 'Resident faucet repair', null, null, now()->subYear());
        $this->storeNotification($resident->id, 'Resident other community', 999);
        $this->storeNotification($systemAdmin->id, 'Platform billing alert', 999);
        $this->storeNotification($admin->id, 'Before this assignment', null, null, now()->subYear());

        Sanctum::actingAs($resident);
        $residentTitles = collect($this->getJson('/api/v1/notifications')->assertOk()->json('data'))->pluck('title');
        $this->assertTrue($residentTitles->contains('Resident faucet repair'));
        $this->assertTrue($residentTitles->contains('Resident other community'));

        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Platform billing alert');

        $admin->update(['active_context' => 'resident']);
        Sanctum::actingAs($admin->fresh());
        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Before this assignment']);
    }

    private function region(): array
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);

        return [$region];
    }

    private function community(Region $region, string $name): Community
    {
        return Community::query()->create([
            'name'          => $name,
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
    }

    private function admin(Community $community, string $phone, string $email): User
    {
        $admin = User::factory()->create([
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'active',
            'phone'                  => $phone,
            'email'                  => $email,
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return $admin;
    }

    private function storeNotification(
        int $userId,
        string $title,
        ?int $communityId = null,
        ?string $scope = null,
        mixed $createdAt = null,
    ): int {
        $data = array_filter([
            'community_id' => $communityId,
            'scope'        => $scope,
        ], static fn ($value) => $value !== null);

        return (int) DB::table('app_notifications')->insertGetId([
            'user_id'    => $userId,
            'type'       => 'info',
            'title'      => $title,
            'body'       => $title,
            'data'       => $data === [] ? null : json_encode($data),
            'read_at'    => null,
            'created_at' => $createdAt ?? now(),
            'updated_at' => $createdAt ?? now(),
        ]);
    }
}
