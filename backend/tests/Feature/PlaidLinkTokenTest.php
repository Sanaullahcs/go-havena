<?php

namespace Tests\Feature;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\PlaidService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class PlaidLinkTokenTest extends TestCase
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
        $this->postJson('/api/v1/plaid/link-token')
            ->assertUnauthorized();
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

        $this->postJson('/api/v1/plaid/link-token')
            ->assertForbidden();
    }

    public function test_system_admin_cannot_create_link_token(): void
    {
        $systemAdmin = User::factory()->create([
            'role' => 'system_admin',
            'email' => 'sysadmin@havena.test',
            'status' => 'active',
        ]);

        Sanctum::actingAs($systemAdmin);

        $this->postJson('/api/v1/plaid/link-token')
            ->assertForbidden();
    }

    public function test_valid_community_admin_receives_link_token_payload(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => false, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        $this->mock(PlaidService::class, function ($mock) use ($admin) {
            $mock->shouldReceive('createLinkToken')
                ->once()
                ->with(Mockery::on(fn ($user) => $user instanceof User && $user->id === $admin->id))
                ->andReturn([
                    'link_token' => 'link-sandbox-test-token',
                    'expiration' => '2026-08-25T12:00:00Z',
                ]);
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/link-token')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.link_token', 'link-sandbox-test-token')
            ->assertJsonPath('data.expiration', '2026-08-25T12:00:00Z')
            ->assertJsonMissingPath('data.secret')
            ->assertJsonMissingPath('data.access_token');
    }

    public function test_authenticated_user_id_is_used_instead_of_request_input(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => false, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        $this->mock(PlaidService::class, function ($mock) use ($admin) {
            $mock->shouldReceive('createLinkToken')
                ->once()
                ->with(Mockery::on(fn ($user) => $user instanceof User && $user->id === $admin->id))
                ->andReturn([
                    'link_token' => 'link-sandbox-test-token',
                    'expiration' => '2026-08-25T12:00:00Z',
                ]);
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/link-token', [
            'user_id' => 999999,
            'community_id' => 888888,
        ])
            ->assertOk()
            ->assertJsonPath('data.link_token', 'link-sandbox-test-token');
    }

    public function test_plaid_failure_is_handled_safely(): void
    {
        config(['billing.enabled' => true, 'billing.enforce' => false, 'billing.driver' => 'manual']);

        $community = $this->seedCommunity();
        $admin = $this->seedCommunityAdmin($community);
        $this->seedActiveSubscription($community);

        $this->mock(PlaidService::class, function ($mock) {
            $mock->shouldReceive('createLinkToken')
                ->once()
                ->andThrow(PlaidException::linkTokenFailed('Plaid is temporarily unavailable.'));
        });

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/plaid/link-token')
            ->assertStatus(502)
            ->assertJsonPath('code', 'PLAID_LINK_TOKEN_FAILED')
            ->assertJsonPath('message', 'Plaid is temporarily unavailable.')
            ->assertJsonMissingPath('meta.secret')
            ->assertJsonMissingPath('trace');
    }
}
