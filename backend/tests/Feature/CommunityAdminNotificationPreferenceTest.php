<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminNotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_preferences_persist_and_block_only_the_matching_category(): void
    {
        $admin = $this->communityAdmin();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/me/notification-preferences')
            ->assertOk()
            ->assertJsonPath('data.new_member_alerts', true)
            ->assertJsonPath('data.moderation_alerts', true)
            ->assertJsonPath('data.system_alerts', true)
            ->assertJsonPath('data.weekly_digest', false);

        $communityId = (int) CommunityMembership::query()->where('user_id', $admin->id)->value('community_id');

        DB::table('app_notifications')->insert([
            'user_id'    => $admin->id,
            'type'       => 'info',
            'title'      => 'Earlier member request',
            'body'       => 'Already in the inbox.',
            'action_url' => '/admin/members?status=pending',
            'data'       => json_encode([
                'kind'         => 'family_join_pending_admin',
                'community_id' => $communityId,
            ]),
            'created_at' => now()->subMinute(),
            'updated_at' => now()->subMinute(),
        ]);

        $this->patchJson('/api/v1/me/notification-preferences', [
            'new_member_alerts' => false,
            'weekly_digest'     => true,
        ])->assertOk()
            ->assertJsonPath('data.new_member_alerts', false)
            ->assertJsonPath('data.moderation_alerts', true)
            ->assertJsonPath('data.weekly_digest', true);

        $this->getJson('/api/v1/me/notification-preferences')
            ->assertOk()
            ->assertJsonPath('data.new_member_alerts', false)
            ->assertJsonPath('data.weekly_digest', true);

        NotificationService::send(
            $admin->id,
            'info',
            'Membership approval needed',
            'A resident is waiting.',
            '/admin/members?status=pending',
            ['kind' => 'family_join_pending_admin', 'community_id' => $communityId],
        );
        NotificationService::send(
            $admin->id,
            'warning',
            'New report filed',
            'Review the moderation queue.',
            '/admin/moderation',
            ['kind' => 'ugc_report', 'community_id' => $communityId],
        );
        NotificationService::send(
            $admin->id,
            'info',
            'Weekly summary',
            'Here is this week.',
            null,
            ['kind' => 'weekly_digest'],
        );
        NotificationService::send(
            $admin->id,
            'info',
            'Pool booking',
            'A resident booked the pool.',
            '/admin/bookings',
            ['community_id' => $communityId],
        );

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Membership approval needed',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Earlier member request',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'New report filed',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Weekly summary',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Pool booking',
        ]);

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonFragment(['title' => 'Earlier member request']);
    }

    public function test_residents_are_not_gated_and_cannot_change_admin_preferences(): void
    {
        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201722000010',
            'email'  => 'resident.prefs@havena.test',
        ]);

        Sanctum::actingAs($resident);
        $this->patchJson('/api/v1/me/notification-preferences', [
            'new_member_alerts' => false,
        ])->assertForbidden();

        NotificationService::send(
            $resident->id,
            'info',
            'Membership approval needed',
            'Your family request moved forward.',
            '/screens/pending-community',
            ['kind' => 'family_join_pending_admin'],
        );

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title'   => 'Membership approval needed',
        ]);
    }

    public function test_system_alerts_off_keeps_other_categories(): void
    {
        $admin = $this->communityAdmin('cedar.prefs@havena.test', '+201722000011');
        $admin->forceFill([
            'admin_notification_preferences' => [
                'new_member_alerts' => true,
                'moderation_alerts' => true,
                'system_alerts'     => false,
                'weekly_digest'     => false,
            ],
        ])->save();

        NotificationService::send(
            $admin->id,
            'warning',
            'Admin access suspended',
            'Your access was suspended.',
            null,
            ['scope' => 'account'],
        );
        NotificationService::send(
            $admin->id,
            'warning',
            'New report filed',
            'A resident filed a report.',
            '/admin/moderation',
            ['kind' => 'ugc_report'],
        );

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Admin access suspended',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'New report filed',
        ]);

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201722000012',
            'email'  => 'system.prefs@havena.test',
            'admin_notification_preferences' => [
                'new_member_alerts' => true,
                'moderation_alerts' => false,
                'system_alerts'     => true,
                'weekly_digest'     => false,
            ],
        ]);
        NotificationService::send(
            $systemAdmin->id,
            'warning',
            'Platform report',
            'A report needs review.',
            '/admin/moderation',
            ['kind' => 'ugc_report'],
        );
        NotificationService::send(
            $systemAdmin->id,
            'info',
            'Platform booking',
            'A booking was requested.',
            '/admin/bookings',
        );
        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $systemAdmin->id,
            'title'   => 'Platform report',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $systemAdmin->id,
            'title'   => 'Platform booking',
        ]);
    }

    private function communityAdmin(string $email = 'oak.prefs@havena.test', string $phone = '+201722000009'): User
    {
        $region = Region::query()->create([
            'title'       => 'Cairo Metro',
            'area'        => 'Cairo',
            'users_label' => '0 users',
            'sort_order'  => 1,
            'status'      => 'active',
        ]);
        $community = Community::query()->create([
            'name'          => 'Oak Valley',
            'region_id'     => $region->id,
            'region'        => $region->title,
            'status'        => 'active',
            'review_status' => 'approved',
        ]);
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
}
