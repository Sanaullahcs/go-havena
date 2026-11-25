<?php

namespace Tests\Feature;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunityPlaidConnection;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\PlaidService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class PlaidExchangeTokenTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunity(): Community
    {
        $region = Region::query()->create([
            'title' => 'Plaid Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => 'Plaid Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 50,
        ]);
    }

    private function seedCommunityAdmin(Community $community, array $overrides = []): User
    {
        $admin = User::factory()->create(array_merge([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'phone' => '+1'.fake()->unique()->numerify('##########'),
            'phone_verified_at' => now(),
            'email' => fake()->unique()->safeEmail(),
            'status' => 'active',
        ], $overrides));

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return $admin;
    }

    private function seedActiveSubscription(Community $community): void
    {
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'status' => 'active',
            'billing_interval' => 'month',
            'seat_limit' => 150,
            'seats_used' => 0,
            'current_period_start' => now()->subDay(),
            'current_period_end' => now()->addMonth(),
        ]);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-test',
        ])->assertUnauthorized();
    }

    public function test_non_community_admin_request_is_rejected(): void
    {
        $community = $this->seedCommunity();
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

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-test',
        ])->assertForbidden();
    }

    public function test_missing_public_token_is_rejected(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['public_token']);
    }

    public function test_invalid_public_token_is_handled_safely(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        $this->mock(PlaidService::class, function ($mock) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andThrow(PlaidException::exchangeFailed(
                    'This Plaid connection link expired or is invalid. Start a new connection and try again.'
                ));
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-invalid',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_EXCHANGE_FAILED')
            ->assertJsonMissingPath('data.access_token')
            ->assertJsonMissingPath('trace');
    }

    public function test_valid_community_admin_exchange_returns_safe_payload(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => false, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        $this->mock(PlaidService::class, function ($mock) use ($admin, $community) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->with(
                    Mockery::on(fn ($user) => $user instanceof User && $user->id === $admin->id),
                    'public-sandbox-test',
                )
                ->andReturnUsing(function () use ($admin, $community) {
                    return CommunityPlaidConnection::query()->create([
                        'community_id' => $community->id,
                        'connected_by_user_id' => $admin->id,
                        'plaid_item_id' => 'item-sandbox-test',
                        'plaid_access_token' => 'access-sandbox-secret',
                        'institution_id' => 'ins_123',
                        'institution_name' => 'Sandbox Bank',
                        'status' => 'connected',
                    ])->toPublicPayload();
                });
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-test',
            'user_id' => 999999,
            'community_id' => 888888,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.connected', true)
            ->assertJsonPath('data.item_id', 'item-sandbox-test')
            ->assertJsonPath('data.institution_name', 'Sandbox Bank')
            ->assertJsonMissingPath('data.access_token')
            ->assertJsonMissingPath('data.public_token');
    }

    public function test_authenticated_user_and_community_mapping_is_used(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        $this->mock(PlaidService::class, function ($mock) use ($admin, $community) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->with(
                    Mockery::on(fn ($user) => $user instanceof User && $user->id === $admin->id),
                    'public-sandbox-map',
                )
                ->andReturnUsing(function () use ($admin, $community) {
                    return CommunityPlaidConnection::query()->create([
                        'community_id' => $community->id,
                        'connected_by_user_id' => $admin->id,
                        'plaid_item_id' => 'item-sandbox-map',
                        'plaid_access_token' => 'access-sandbox-map',
                        'institution_name' => 'Mapped Bank',
                        'status' => 'connected',
                    ])->toPublicPayload();
                });
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-map',
            'community_id' => 424242,
        ])->assertOk();

        $this->assertDatabaseHas('community_plaid_connections', [
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-sandbox-map',
            'status' => 'connected',
        ]);
    }

    public function test_access_token_is_stored_encrypted(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        $connection = CommunityPlaidConnection::query()->create([
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-encrypt-test',
            'plaid_access_token' => 'access-sandbox-secret-value',
            'status' => 'connected',
        ]);

        $raw = DB::table('community_plaid_connections')
            ->where('id', $connection->id)
            ->value('plaid_access_token');

        $this->assertNotSame('access-sandbox-secret-value', $raw);
        $this->assertSame('access-sandbox-secret-value', $connection->fresh()->plaid_access_token);
    }

    public function test_access_token_is_never_returned_in_api_response(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        $this->mock(PlaidService::class, function ($mock) use ($admin, $community) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andReturn(
                    CommunityPlaidConnection::query()->create([
                        'community_id' => $community->id,
                        'connected_by_user_id' => $admin->id,
                        'plaid_item_id' => 'item-hidden-token',
                        'plaid_access_token' => 'access-sandbox-hidden',
                        'status' => 'connected',
                    ])->toPublicPayload()
                );
        });

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-hidden',
        ])->assertOk();

        $json = json_encode($response->json());
        $this->assertIsString($json);
        $this->assertStringNotContainsString('access-sandbox-hidden', $json);
    }

    public function test_duplicate_connection_is_rejected(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        CommunityPlaidConnection::query()->create([
            'community_id' => $community->id,
            'connected_by_user_id' => $admin->id,
            'plaid_item_id' => 'item-existing',
            'plaid_access_token' => 'access-existing',
            'institution_name' => 'Existing Bank',
            'status' => 'connected',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-new',
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'PLAID_ALREADY_CONNECTED')
            ->assertJsonMissingPath('data.access_token');
    }

    public function test_plaid_failure_is_handled_safely(): void
    {
        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);

        $this->mock(PlaidService::class, function ($mock) {
            $mock->shouldReceive('connectCommunityAccount')
                ->once()
                ->andThrow(PlaidException::exchangeFailed('Plaid is temporarily unavailable.'));
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/exchange-token', [
            'public_token' => 'public-sandbox-test',
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'PLAID_EXCHANGE_FAILED')
            ->assertJsonPath('message', 'Plaid is temporarily unavailable.')
            ->assertJsonMissingPath('meta.secret');
    }
}
