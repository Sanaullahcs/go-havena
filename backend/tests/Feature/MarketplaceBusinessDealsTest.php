<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MarketplaceBusinessDealsTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithUsers(): array
    {
        $region = Region::query()->create([
            'title'       => 'Test Region',
            'area'        => 'Area',
            'state'       => 'ST',
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
        ]);

        $residentA = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $residentB = User::factory()->create(['role' => 'resident', 'status' => 'active']);

        CommunityMembership::query()->create([
            'user_id'      => $admin->id,
            'community_id' => $community->id,
            'role'         => 'admin',
            'status'       => 'approved',
        ]);

        foreach ([$residentA, $residentB] as $resident) {
            CommunityMembership::query()->create([
                'user_id'      => $resident->id,
                'community_id' => $community->id,
                'role'         => 'member',
                'status'       => 'approved',
            ]);
        }

        return compact('community', 'admin', 'residentA', 'residentB');
    }

    private function businessPayload(): array
    {
        return [
            'name'        => 'The Daily Grind',
            'category'    => 'Coffee Shop',
            'description' => 'Great coffee in the neighborhood.',
            'address'     => '123 Main Street',
            'phone'       => '(305) 555-0101',
            'hours'       => '7:00 AM - 6:00 PM',
            'amenities'   => 'WiFi, Outdoor Seating',
        ];
    }

    private function dealPayload(array $overrides = []): array
    {
        return array_merge([
            'title'          => 'Sample Deal',
            'description'    => 'A great limited-time offer.',
            'discount_label' => '10% OFF',
            'category'       => 'Retail',
            'image_url'      => 'https://example.com/storage/deals/sample.jpg',
            'type'           => 'deal',
        ], $overrides);
    }

    public function test_resident_business_submission_is_pending_and_admin_can_approve(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);

        $create = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ]);

        $create->assertCreated();
        $create->assertJsonPath('data.status', 'pending');
        $businessId = $create->json('data.id');

        Sanctum::actingAs($admin);

        $manage = $this->getJson('/api/v1/businesses?scope=manage', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $manage->assertOk();
        $this->assertSame(1, $manage->json('meta.total'));

        $approve = $this->patchJson("/api/v1/admin/businesses/{$businessId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ]);
        $approve->assertOk();
        $approve->assertJsonPath('data.status', 'approved');

        Sanctum::actingAs($resident);

        $browse = $this->getJson('/api/v1/businesses', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $browse->assertOk();
        $this->assertSame(1, $browse->json('meta.total'));
    }

    public function test_admin_sees_all_businesses_resident_sees_only_own(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $residentA, 'residentB' => $residentB] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($residentA);
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($residentB);
        $this->postJson('/api/v1/businesses', array_merge($this->businessPayload(), ['name' => 'Green Bowl']), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $adminList = $this->getJson('/api/v1/businesses?scope=manage', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $adminList->assertOk();
        $this->assertSame(2, $adminList->json('meta.total'));

        Sanctum::actingAs($residentA);
        $residentList = $this->getJson('/api/v1/businesses?scope=manage', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $residentList->assertOk();
        $this->assertSame(1, $residentList->json('meta.total'));
        $this->assertSame('The Daily Grind', $residentList->json('data.0.name'));
    }

    public function test_admin_creates_business_as_approved(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.status', 'approved');
    }

    public function test_resident_can_create_and_manage_own_deals_only(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $residentA, 'residentB' => $residentB] = $this->seedCommunityWithUsers();

        // Each resident must have a business before they can create deals
        Sanctum::actingAs($residentA);
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $dealA = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Coffee Duo',
            'description'    => 'Buy one get one free.',
            'discount_label' => 'BOGO',
            'category'       => 'Coffee',
        ]), ['X-Community-Id' => (string) $community->id]);
        $dealA->assertCreated();

        Sanctum::actingAs($residentB);
        $this->postJson('/api/v1/businesses', array_merge($this->businessPayload(), ['name' => 'Burger Barn']), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Burger Combo',
            'description'    => '20% off combo meals.',
            'discount_label' => '20% OFF',
            'category'       => 'Food',
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated();

        Sanctum::actingAs($admin);
        $adminDeals = $this->getJson('/api/v1/deals?scope=manage', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $adminDeals->assertOk();
        $this->assertSame(2, $adminDeals->json('meta.total'));

        Sanctum::actingAs($residentA);
        $ownDeals = $this->getJson('/api/v1/deals?scope=manage', [
            'X-Community-Id' => (string) $community->id,
        ]);
        $ownDeals->assertOk();
        $this->assertSame(1, $ownDeals->json('meta.total'));
        $this->assertSame('Coffee Duo', $ownDeals->json('data.0.title'));

        $dealId = $dealA->json('data.id');
        $this->patchJson("/api/v1/deals/{$dealId}", [
            'title' => 'Updated Coffee Duo',
        ], ['X-Community-Id' => (string) $community->id])->assertOk();

        Sanctum::actingAs($residentB);
        $this->patchJson("/api/v1/deals/{$dealId}", [
            'title' => 'Hacked title',
        ], ['X-Community-Id' => (string) $community->id])->assertForbidden();
    }

    public function test_resident_cannot_delete_another_residents_business(): void
    {
        ['community' => $community, 'residentA' => $residentA, 'residentB' => $residentB] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($residentA);
        $businessId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($residentB);
        $this->deleteJson("/api/v1/businesses/{$businessId}", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertForbidden();

        $this->assertDatabaseHas('businesses', ['id' => $businessId, 'deleted_at' => null]);
    }

    public function test_resident_cannot_create_second_business(): void
    {
        ['community' => $community, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);

        // First business — should succeed
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        // Second business — must be rejected with 422
        $second = $this->postJson('/api/v1/businesses', array_merge($this->businessPayload(), ['name' => 'Second Shop']), [
            'X-Community-Id' => (string) $community->id,
        ]);

        $second->assertUnprocessable();
        $second->assertJsonPath('error', 'one_business_per_user');

        // Only one business exists for this resident
        $this->assertSame(
            1,
            DB::table('businesses')->where('owner_id', $resident->id)->whereNull('deleted_at')->count()
        );
    }

    public function test_admin_cannot_create_second_business(): void
    {
        ['community' => $community, 'admin' => $admin] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $second = $this->postJson('/api/v1/businesses', array_merge($this->businessPayload(), ['name' => 'Admin Second Shop']), [
            'X-Community-Id' => (string) $community->id,
        ]);

        $second->assertUnprocessable();
        $second->assertJsonPath('error', 'one_business_per_user');

        $this->assertSame(
            1,
            DB::table('businesses')->where('owner_id', $admin->id)->whereNull('deleted_at')->count()
        );
    }

    public function test_resident_can_create_multiple_deals_for_their_business(): void
    {
        ['community' => $community, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);

        // Create business
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $dealPayload = $this->dealPayload([
            'title'          => '20% Off Coffee',
            'description'    => 'Show this coupon for a discount.',
            'discount_label' => '20% OFF',
            'category'       => 'Coffee',
        ]);

        // First deal
        $this->postJson('/api/v1/deals', $dealPayload, [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        // Second deal — also allowed
        $this->postJson('/api/v1/deals', array_merge($dealPayload, ['title' => 'Free Pastry']), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertSame(
            2,
            DB::table('deals')->where('created_by', $resident->id)->whereNull('deleted_at')->count()
        );
    }

    public function test_resident_with_rejected_business_cannot_create_deals(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        // Resident creates a business
        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        // Admin rejects the business
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reject", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        // Resident tries to create a deal — blocked
        Sanctum::actingAs($resident);
        $response = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'My Deal',
            'description'    => 'Great deal.',
            'discount_label' => '10% OFF',
            'category'       => 'Retail',
        ]), ['X-Community-Id' => (string) $community->id]);

        $response->assertUnprocessable();
        $response->assertJsonPath('error', 'business_rejected');
    }

    public function test_deal_requires_discount_label_and_category(): void
    {
        ['community' => $community, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->postJson('/api/v1/deals', [
            'title'       => 'Incomplete Deal',
            'description' => 'Missing discount and category.',
            'type'        => 'deal',
        ], ['X-Community-Id' => (string) $community->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['discount_label', 'category', 'image_url']);
    }

    public function test_deal_requires_image_url(): void
    {
        ['community' => $community, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->postJson('/api/v1/deals', $this->dealPayload(['image_url' => '']), [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image_url']);
    }

    public function test_rejecting_business_disables_existing_deals(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $dealId = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Summer Special',
            'description'    => 'Limited time offer.',
            'discount_label' => '15% OFF',
            'category'       => 'Retail',
            'business_id'    => $bizId,
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated()->json('data.id');

        $this->assertSame('active', DB::table('deals')->where('id', $dealId)->value('status'));

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reject", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertSame('inactive', DB::table('deals')->where('id', $dealId)->value('status'));

        $this->getJson('/api/v1/deals', [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->assertJsonMissing(['id' => $dealId]);
    }

    public function test_admin_can_reapprove_rejected_business(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $dealId = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Back in Business Deal',
            'description'    => 'We are open again.',
            'discount_label' => 'BOGO',
            'category'       => 'Food',
            'business_id'    => $bizId,
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);

        // Reject first
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reject", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->assertJsonPath('data.status', 'rejected');

        $this->assertSame('inactive', DB::table('deals')->where('id', $dealId)->value('status'));

        // Re-approve via the reapprove route
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reapprove", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertSame('active', DB::table('deals')->where('id', $dealId)->value('status'));

        // Resident can now create a deal
        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Another Deal',
            'description'    => 'We are open again.',
            'discount_label' => '10% OFF',
            'category'       => 'Food',
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated();
    }

    public function test_setting_business_inactive_disables_existing_deals(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $dealId = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Weekend Special',
            'description'    => 'Limited offer.',
            'discount_label' => '25% OFF',
            'category'       => 'Retail',
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reject", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('meta.deals_disabled', 1);

        $this->assertSame('inactive', DB::table('deals')->where('id', $dealId)->value('status'));
    }

    public function test_reapprove_restores_deals_after_rejection(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/approve", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        Sanctum::actingAs($resident);
        $dealId = $this->postJson('/api/v1/deals', $this->dealPayload([
            'title'          => 'Fresh Deal',
            'description'    => 'Back soon.',
            'discount_label' => '5% OFF',
            'category'       => 'Retail',
        ]), ['X-Community-Id' => (string) $community->id])->assertCreated()->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reject", [], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $this->assertSame('inactive', DB::table('deals')->where('id', $dealId)->value('status'));

        $this->patchJson("/api/v1/admin/businesses/{$bizId}/reapprove", [], [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonPath('meta.deals_reactivated', 1);

        $this->assertSame('active', DB::table('deals')->where('id', $dealId)->value('status'));
    }

    public function test_admin_cannot_edit_resident_business_profile(): void
    {
        ['community' => $community, 'admin' => $admin, 'residentA' => $resident] = $this->seedCommunityWithUsers();

        Sanctum::actingAs($resident);
        $bizId = $this->postJson('/api/v1/businesses', $this->businessPayload(), [
            'X-Community-Id' => (string) $community->id,
        ])->json('data.id');

        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/businesses/{$bizId}", [
            'name' => 'Admin Override Name',
        ], ['X-Community-Id' => (string) $community->id])
            ->assertForbidden();
    }
}
