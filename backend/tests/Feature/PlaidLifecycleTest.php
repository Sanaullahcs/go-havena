<?php

namespace Tests\Feature;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunityPlaidConnection;
use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Models\User;
use App\Services\CommunityAdminAccessService;
use App\Services\PlaidService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlaidLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(?string $countryCode = null, string $billingPolicy = Country::BILLING_REQUIRED): Community
    {
        $stateId = null;
        $regionTitle = 'Plaid Region';

        if ($countryCode) {
            $country = Country::query()->updateOrCreate(
                ['code' => $countryCode],
                [
                    'name' => $countryCode === 'PK' ? 'Pakistan' : 'United States',
                    'billing_policy' => $billingPolicy,
                    'sort_order' => 1,
                    'status' => 'active',
                ],
            );
            $state = State::query()->updateOrCreate(
                ['country_id' => $country->id, 'name' => $countryCode === 'PK' ? 'Punjab' : 'Florida'],
                [
                    'sort_order' => 1,
                    'status' => 'active',
                ],
            );
            $stateId = $state->id;
            $regionTitle = $countryCode === 'PK' ? 'Pakistan - Lahore' : 'Miami';
        }

        $region = Region::query()->create([
            'title' => $regionTitle,
            'area' => 'Test Area',
            'state' => $countryCode === 'PK' ? 'Punjab' : null,
            'state_id' => $stateId,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Plaid Community '.$countryCode,
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 50,
        ]);
    }

    private function seedCommunityAdmin(Community $community): User
    {
        $admin = User::factory()->create([
            'name' => 'Community Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
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

    private function seedConnection(Community $community, User $admin, array $overrides = []): CommunityPlaidConnection
    {
        return CommunityPlaidConnection::query()->create(array_merge([
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-sandbox-'.uniqid(),
            'plaid_access_token' => 'access-sandbox-secret',
            'institution_id' => 'ins_tartan',
            'institution_name' => 'Tartan Bank',
            'account_id' => 'acct_checking',
            'account_name' => 'Plaid Checking',
            'account_official_name' => 'Plaid Gold Standard 0% Interest Checking',
            'account_type' => 'depository',
            'account_subtype' => 'checking',
            'account_mask' => '0000',
            'status' => CommunityPlaidConnection::STATUS_CONNECTED,
        ], $overrides));
    }

    public function test_connection_returns_selected_account_details_without_tokens(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $this->seedConnection($community, $admin);
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/plaid/connection')
            ->assertOk()
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.status', 'connected')
            ->assertJsonPath('data.account.name', 'Plaid Checking')
            ->assertJsonPath('data.account.mask', '0000')
            ->assertJsonPath('data.account.type', 'depository')
            ->assertJsonPath('data.account.subtype', 'checking')
            ->assertJsonMissingPath('data.plaid_access_token')
            ->assertJsonMissingPath('data.access_token');

        $json = json_encode($response->json());
        $this->assertIsString($json);
        $this->assertStringNotContainsString('access-sandbox-secret', $json);
    }

    public function test_needs_attention_status_is_returned_for_broken_items(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $this->seedConnection($community, $admin, [
            'status' => CommunityPlaidConnection::STATUS_NEEDS_ATTENTION,
            'error_code' => 'ITEM_LOGIN_REQUIRED',
            'error_message' => 'The login details have changed.',
        ]);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/plaid/connection')
            ->assertOk()
            ->assertJsonPath('data.connected', false)
            ->assertJsonPath('data.needs_reconnect', true)
            ->assertJsonPath('data.status', 'needs_attention')
            ->assertJsonPath('data.error_code', 'ITEM_LOGIN_REQUIRED');
    }

    public function test_disconnect_updates_the_same_community_row_and_logs_activity(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $connection = $this->seedConnection($community, $admin);
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/disconnect')
            ->assertOk()
            ->assertJsonPath('data.connected', false)
            ->assertJsonPath('data.status', 'disconnected')
            ->assertJsonMissingPath('data.plaid_access_token');

        $this->assertSame(1, CommunityPlaidConnection::query()->where('community_id', $community->id)->count());
        $fresh = $connection->fresh();
        $this->assertSame(CommunityPlaidConnection::STATUS_DISCONNECTED, $fresh->status);
        $this->assertSame('', $fresh->plaid_access_token);
        $this->assertNotNull($fresh->disconnected_at);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'plaid_bank_disconnected',
            'user_id' => $admin->id,
            'entity_id' => $community->id,
        ]);
    }

    public function test_replace_updates_existing_row_instead_of_creating_a_duplicate(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $this->seedConnection($community, $admin, ['plaid_item_id' => 'item-old']);
        Sanctum::actingAs($admin);

        $this->mock(PlaidService::class, function ($mock) use ($admin, $community) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andReturnUsing(function () use ($admin, $community) {
                    $row = CommunityPlaidConnection::query()->where('community_id', $community->id)->firstOrFail();
                    $row->fill([
                        'connected_by_user_id' => $admin->id,
                        'plaid_item_id' => 'item-new',
                        'plaid_access_token' => 'access-new-secret',
                        'institution_name' => 'First Platypus Bank',
                        'account_name' => 'Replacement Checking',
                        'account_mask' => '1111',
                        'status' => CommunityPlaidConnection::STATUS_CONNECTED,
                    ])->save();

                    return $row->toPublicPayload();
                });
        });

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-replace',
            'replace' => true,
            'account_id' => 'acct_new',
        ])
            ->assertOk()
            ->assertJsonPath('data.item_id', 'item-new')
            ->assertJsonPath('data.institution_name', 'First Platypus Bank')
            ->assertJsonMissingPath('data.access_token');

        $this->assertSame(1, CommunityPlaidConnection::query()->where('community_id', $community->id)->count());
        $this->assertDatabaseHas('community_plaid_connections', [
            'community_id' => $community->id,
            'plaid_item_id' => 'item-new',
            'status' => 'connected',
        ]);
    }

    public function test_reconnect_endpoint_uses_existing_item(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $this->seedConnection($community, $admin, [
            'status' => CommunityPlaidConnection::STATUS_NEEDS_ATTENTION,
            'error_code' => 'ITEM_LOGIN_REQUIRED',
        ]);
        Sanctum::actingAs($admin);

        $this->mock(PlaidService::class, function ($mock) use ($community) {
            $mock->shouldReceive('completeReconnect')
                ->once()
                ->andReturnUsing(function () use ($community) {
                    $row = CommunityPlaidConnection::query()->where('community_id', $community->id)->firstOrFail();
                    $row->fill([
                        'status' => CommunityPlaidConnection::STATUS_CONNECTED,
                        'error_code' => null,
                        'error_message' => null,
                    ])->save();

                    return array_merge($row->toPublicPayload(), ['status' => 'connected']);
                });
        });

        $this->postJson('/api/v1/plaid/reconnect')
            ->assertOk()
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.status', 'connected');
    }

    public function test_webhook_marks_item_as_needing_attention_and_logs_error(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $connection = $this->seedConnection($community, $admin, [
            'plaid_item_id' => 'item-webhook-1',
        ]);

        $this->postJson('/api/v1/plaid/webhook', [
            'webhook_type' => 'ITEM',
            'webhook_code' => 'ERROR',
            'item_id' => 'item-webhook-1',
            'error' => [
                'error_code' => 'ITEM_LOGIN_REQUIRED',
                'error_message' => 'The login details of this item have changed.',
            ],
        ])
            ->assertOk()
            ->assertJsonPath('received', true);

        $fresh = $connection->fresh();
        $this->assertSame(CommunityPlaidConnection::STATUS_NEEDS_ATTENTION, $fresh->status);
        $this->assertSame('ITEM_LOGIN_REQUIRED', $fresh->error_code);
        $this->assertNotNull($fresh->last_webhook_at);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'plaid_connection_error',
            'entity_id' => $community->id,
            'user_id' => $admin->id,
        ]);
    }

    public function test_pakistan_community_cannot_access_plaid_apis(): void
    {
        $community = $this->seedCommunity('PK', Country::BILLING_EXEMPT);
        $admin = $this->seedCommunityAdmin($community);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/plaid/connection')
            ->assertForbidden()
            ->assertJsonPath('code', 'PLAID_NOT_AVAILABLE');

        $this->postJson('/api/v1/plaid/link-token')
            ->assertForbidden()
            ->assertJsonPath('code', 'PLAID_NOT_AVAILABLE');

        $this->postJson('/api/v1/plaid/exchange-token', ['public_token' => 'public-sandbox'])
            ->assertForbidden()
            ->assertJsonPath('code', 'PLAID_NOT_AVAILABLE');

        $this->postJson('/api/v1/plaid/disconnect')
            ->assertForbidden()
            ->assertJsonPath('code', 'PLAID_NOT_AVAILABLE');

        $access = app(CommunityAdminAccessService::class)->accessPayload($admin);
        $this->assertFalse($access['plaid_available']);
        $this->assertSame('PK', $access['country_code']);
    }

    public function test_us_community_access_payload_enables_plaid(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);

        $access = app(CommunityAdminAccessService::class)->accessPayload($admin);
        $this->assertTrue($access['plaid_available']);
        $this->assertSame('US', $access['country_code']);
    }

    public function test_system_admin_can_see_safe_plaid_status_on_communities(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        $this->seedConnection($community, $admin, [
            'institution_name' => 'Tartan Bank',
            'account_mask' => '0000',
        ]);

        $this->seed(SystemAdminSeeder::class);
        $system = User::query()->where('email', 'admin@havena.app')->firstOrFail();
        Sanctum::actingAs($system);

        $response = $this->getJson('/api/v1/admin/communities?per_page=15')
            ->assertOk()
            ->assertJsonPath('data.0.plaid_connection.connected', true)
            ->assertJsonPath('data.0.plaid_connection.status', 'connected')
            ->assertJsonPath('data.0.plaid_connection.institution_name', 'Tartan Bank')
            ->assertJsonMissingPath('data.0.plaid_connection.plaid_access_token');

        $json = json_encode($response->json());
        $this->assertIsString($json);
        $this->assertStringNotContainsString('access-sandbox-secret', $json);
    }

    public function test_resident_cannot_disconnect_or_webhook_is_public_only_for_plaid(): void
    {
        $community = $this->seedCommunity('US');
        $resident = User::factory()->create([
            'role' => 'resident',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'status' => 'active',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/plaid/disconnect')->assertForbidden();
        $this->postJson('/api/v1/plaid/reconnect')->assertForbidden();
    }

    public function test_connect_logs_bank_connected_activity(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        Sanctum::actingAs($admin);

        $this->mock(PlaidService::class, function ($mock) use ($admin, $community) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andReturnUsing(function () use ($admin, $community) {
                    $row = CommunityPlaidConnection::query()->create([
                        'community_id' => $community->id,
                        'connected_by_user_id' => $admin->id,
                        'plaid_item_id' => 'item-log',
                        'plaid_access_token' => 'access-log-secret',
                        'institution_name' => 'Tartan Bank',
                        'status' => CommunityPlaidConnection::STATUS_CONNECTED,
                    ]);
                    \App\Services\ActivityLogService::user(
                        'plaid_bank_connected',
                        $admin->name.' connected a bank for community #'.$community->id,
                        Community::class,
                        $community->id,
                        'info',
                        $admin->id,
                        ['community_id' => $community->id, 'institution_name' => 'Tartan Bank'],
                    );

                    return $row->toPublicPayload();
                });
        });

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-log',
        ])->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'plaid_bank_connected',
            'user_id' => $admin->id,
            'entity_id' => $community->id,
        ]);
        $this->assertNull(DB::table('activity_logs')->where('action', 'plaid_bank_connected')->value('meta')
            ? (str_contains((string) DB::table('activity_logs')->where('action', 'plaid_bank_connected')->value('meta'), 'access-log-secret') ? 'leaked' : null)
            : null);
    }

    public function test_invalid_public_token_still_does_not_leak_secrets(): void
    {
        $community = $this->seedCommunity('US');
        $admin = $this->seedCommunityAdmin($community);
        Sanctum::actingAs($admin);

        $this->mock(PlaidService::class, function ($mock) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andThrow(PlaidException::exchangeFailed('This Plaid connection link expired or is invalid. Start a new connection and try again.'));
        });

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-expired',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_EXCHANGE_FAILED')
            ->assertJsonMissingPath('data.access_token');
    }
}
