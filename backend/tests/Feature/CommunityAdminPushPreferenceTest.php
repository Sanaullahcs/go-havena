<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityAdminPushPreferenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
        Http::fake([
            'https://exp.host/*' => Http::response(['data' => []], 200),
        ]);
    }

    public function test_community_admin_push_toggle_is_saved_and_blocks_delivery_only(): void
    {
        $admin = $this->communityAdmin();
        $this->registerDevices($admin->id, ['ExponentPushToken[phone-one]', 'ExponentPushToken[phone-two]']);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/me/push-notifications')
            ->assertOk()
            ->assertJsonPath('data.enabled', true);

        $this->patchJson('/api/v1/me/push-notifications', ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.enabled', false);

        $this->getJson('/api/v1/me/push-notifications')
            ->assertOk()
            ->assertJsonPath('data.enabled', false);
        $this->assertFalse((bool) $admin->fresh()->push_notifications_enabled);

        NotificationService::send(
            $admin->id,
            'info',
            'Oak booking request',
            'A resident requested the pool.',
            '/admin/bookings',
            ['community_id' => $this->communityIdFor($admin)],
        );

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'title'   => 'Oak booking request',
        ]);
        Http::assertNothingSent();

        $this->getJson('/api/v1/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Oak booking request');

        $this->patchJson('/api/v1/me/push-notifications', ['enabled' => true])->assertOk();
        NotificationService::send(
            $admin->id,
            'info',
            'Oak booking resumed',
            'Push is on again.',
            '/admin/bookings',
            ['community_id' => $this->communityIdFor($admin)],
        );

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'exp.host')) {
                return false;
            }
            $tokens = array_column($request->data(), 'to');

            return in_array('ExponentPushToken[phone-one]', $tokens, true)
                && in_array('ExponentPushToken[phone-two]', $tokens, true);
        });
    }

    public function test_disabling_push_keeps_the_browser_token_and_registration_replaces_stale_tokens(): void
    {
        $admin = $this->communityAdmin();
        $now = now();
        DB::table('devices')->insert([
            [
                'user_id'         => $admin->id,
                'platform'        => 'web',
                'expo_push_token' => null,
                'fcm_token'       => 'web-token-stale',
                'created_at'      => $now,
                'updated_at'      => $now,
            ],
            [
                'user_id'         => $admin->id,
                'platform'        => 'web',
                'expo_push_token' => null,
                'fcm_token'       => 'web-token-older',
                'created_at'      => $now,
                'updated_at'      => $now,
            ],
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/devices', [
            'fcm_token' => 'web-token-current',
            'platform'  => 'web',
        ])->assertOk();

        $this->assertSame(
            ['web-token-current'],
            DB::table('devices')->where('user_id', $admin->id)->orderBy('id')->pluck('fcm_token')->all(),
        );

        $this->patchJson('/api/v1/me/push-notifications', ['enabled' => false])->assertOk();
        $this->assertFalse((bool) $admin->fresh()->push_notifications_enabled);
        $this->assertSame(
            ['web-token-current'],
            DB::table('devices')->where('user_id', $admin->id)->pluck('fcm_token')->all(),
        );

        $this->patchJson('/api/v1/me/push-notifications', ['enabled' => true])->assertOk();
        $this->assertSame(
            ['web-token-current'],
            DB::table('devices')->where('user_id', $admin->id)->pluck('fcm_token')->all(),
        );
    }

    public function test_other_community_push_stays_blocked_and_other_roles_are_unchanged(): void
    {
        $admin = $this->communityAdmin();
        $this->registerDevices($admin->id, ['ExponentPushToken[admin-phone]']);
        NotificationService::send(
            $admin->id,
            'warning',
            'Other community report',
            'This belongs somewhere else.',
            '/admin/moderation',
            ['community_id' => 999999],
        );
        Http::assertNothingSent();

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201722000002',
            'email'  => 'resident.push@havena.test',
            'push_notifications_enabled' => false,
        ]);
        $this->registerDevices($resident->id, ['ExponentPushToken[resident-phone]']);
        NotificationService::send($resident->id, 'info', 'Resident faucet', 'Your repair is today.');
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'exp.host')
            && in_array('ExponentPushToken[resident-phone]', array_column($request->data(), 'to'), true));

        Sanctum::actingAs($resident);
        $this->patchJson('/api/v1/me/push-notifications', ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('data.enabled', true);
        NotificationService::send($resident->id, 'info', 'Resident faucet resumed', 'Push is on again.');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'exp.host')
            && in_array('ExponentPushToken[resident-phone]', array_column($request->data(), 'to'), true));

        $systemAdmin = User::factory()->create([
            'role'   => 'system_admin',
            'status' => 'active',
            'phone'  => '+201722000003',
            'email'  => 'system.push@havena.test',
            'push_notifications_enabled' => false,
        ]);
        Sanctum::actingAs($systemAdmin);
        $this->getJson('/api/v1/me/push-notifications')->assertForbidden();

        $this->registerDevices($systemAdmin->id, ['ExponentPushToken[system-phone]']);
        NotificationService::send($systemAdmin->id, 'system', 'Platform notice', 'Services are healthy.');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'exp.host')
            && in_array('ExponentPushToken[system-phone]', array_column($request->data(), 'to'), true));
    }

    private function communityAdmin(): User
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
            'phone'                  => '+201722000001',
            'email'                  => 'oak.push@havena.test',
        ]);
        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        return $admin;
    }

    private function communityIdFor(User $admin): int
    {
        return (int) CommunityMembership::query()->where('user_id', $admin->id)->value('community_id');
    }

    /** @param list<string> $tokens */
    private function registerDevices(int $userId, array $tokens): void
    {
        foreach ($tokens as $token) {
            DB::table('devices')->insert([
                'user_id'          => $userId,
                'platform'         => 'ios',
                'expo_push_token'  => $token,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
        }
    }
}
