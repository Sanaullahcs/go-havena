<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\CommunityDirectoryController;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\CommunityDirectoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommunityDirectoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_approved_suggestion_stays_inside_its_community_and_reports_can_hide_a_place(): void
    {
        [$community, $resident, $admin] = $this->communityWithPeople('Haly Tower');
        [, $otherResident] = $this->communityWithPeople('Other Tower');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/nearby-places/suggestions', [
            'kind' => 'suggest',
            'name' => 'DHA Medical Centre',
            'category' => 'hospitals',
            'address' => 'Sector H',
            'latitude' => 31.47,
            'longitude' => 74.41,
            'phone' => '+92421110000',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $suggestionId = (int) $this->getJson('/api/v1/nearby-places/suggestions')->json('data.0.id');

        Sanctum::actingAs($otherResident);
        $this->getJson('/api/v1/nearby-places/suggestions')->assertOk()->assertJsonCount(0, 'data');

        $this->asUser($admin, function (Request $request) use ($suggestionId) {
            app(CommunityDirectoryController::class)->approveSuggestion($request, $suggestionId);
        });

        Sanctum::actingAs($resident);
        $hospitals = collect($this->getJson('/api/v1/nearby-places?all=1')->assertOk()->json('data.hospitals'));
        $this->assertFalse($hospitals->pluck('name')->contains('DHA Medical Centre'));
        $this->getJson('/api/v1/essentials')
            ->assertOk()
            ->assertJsonFragment(['title' => 'DHA Medical Centre', 'section' => 'hospitals']);

        Sanctum::actingAs($otherResident);
        $this->getJson('/api/v1/nearby-places?all=1')
            ->assertOk()
            ->assertJsonPath('data.hospitals', []);

        $directory = app(CommunityDirectoryService::class);
        $this->asUser($admin, function (Request $request) use ($community) {
            $request->merge([
                'section' => 'burial',
                'title' => 'Community focal point',
                'phone' => '+92422220000',
                'body' => 'Call before arranging burial.',
                'verified' => true,
            ]);
            app(CommunityDirectoryController::class)->adminStore($request);
        });

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/essentials')
            ->assertOk()
            ->assertJsonPath('data.sections.1.entries.0.title', 'Community focal point');

        Sanctum::actingAs($otherResident);
        $this->getJson('/api/v1/essentials')
            ->assertOk()
            ->assertJsonPath('data.sections.1.entries', []);

        $hidden = $directory->mergeList(
            [['id' => 'node-9', 'name' => 'Old Clinic', 'phone' => null, 'distance_meters' => 10]],
            [],
            ['node-9' => true],
        );
        $this->assertSame([], $hidden);
        $this->assertNotEmpty($community->id);
    }

    public function test_suggestion_can_publish_to_essentials_and_nearby_with_coordinates(): void
    {
        [, $resident, $admin] = $this->communityWithPeople('Food Tower');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/nearby-places/suggestions', [
            'kind' => 'suggest',
            'name' => 'Tower Kitchen',
            'publish_nearby' => true,
            'publish_essentials' => true,
            'category' => 'restaurants',
            'essential_section' => 'food',
            'description' => 'Home-style meals after 7 pm.',
            'address' => 'Lobby counter',
            'latitude' => 31.47,
            'longitude' => 74.41,
            'phone' => '+92423330000',
        ])->assertCreated();

        $suggestionId = (int) $this->getJson('/api/v1/nearby-places/suggestions')->json('data.0.id');
        $this->asUser($admin, function (Request $request) use ($suggestionId) {
            app(CommunityDirectoryController::class)->approveSuggestion($request, $suggestionId);
        });

        Sanctum::actingAs($resident);
        $restaurants = collect($this->getJson('/api/v1/nearby-places?all=1')->assertOk()->json('data.restaurants'));
        $this->assertFalse($restaurants->pluck('name')->contains('Tower Kitchen'));

        $this->getJson('/api/v1/essentials')
            ->assertOk()
            ->assertJsonPath('data.sections.4.entries.0.title', 'Tower Kitchen')
            ->assertJsonPath('data.sections.4.entries.0.description', 'Home-style meals after 7 pm.')
            ->assertJsonPath('data.sections.4.places', []);

        $this->postJson('/api/v1/nearby-places/suggestions', [
            'kind' => 'suggest',
            'name' => 'Corner Shop',
            'new_category' => 'Shopping Point',
            'address' => 'Main boulevard',
            'latitude' => 31.4701,
            'longitude' => 74.4125,
            'phone' => '+92424440000',
        ])->assertCreated();

        $secondId = (int) $this->getJson('/api/v1/nearby-places/suggestions')->json('data.0.id');
        $this->asUser($admin, function (Request $request) use ($secondId) {
            app(CommunityDirectoryController::class)->approveSuggestion($request, $secondId);
        });

        Sanctum::actingAs($resident);
        $created = collect($this->getJson('/api/v1/essentials')->assertOk()->json('data.sections'))
            ->firstWhere('key', 'shopping_point');
        $this->assertNotNull($created);
        $this->assertSame('Corner Shop', $created['entries'][0]['title']);
        $this->assertNotNull($created['entries'][0]['distance_meters']);

        $this->postJson('/api/v1/nearby-places/suggestions', [
            'kind' => 'suggest',
            'name' => 'Second Shop',
            'essential_section' => 'shopping_point',
            'address' => 'Main boulevard',
            'latitude' => 31.4702,
            'longitude' => 74.4126,
            'phone' => '+92425550000',
        ])->assertCreated();
        $thirdId = (int) $this->getJson('/api/v1/nearby-places/suggestions')->json('data.0.id');
        $this->asUser($admin, function (Request $request) use ($thirdId) {
            app(CommunityDirectoryController::class)->approveSuggestion($request, $thirdId);
        });

        Sanctum::actingAs($resident);
        $again = collect($this->getJson('/api/v1/essentials')->json('data.sections'))
            ->where('key', 'shopping_point')
            ->values();
        $this->assertCount(1, $again);
        $this->assertCount(2, $again[0]['entries']);
    }

    /** @return array{0: Community, 1: User, 2: User} */
    private function communityWithPeople(string $name): array
    {
        $community = Community::query()->create([
            'name' => $name,
            'region' => 'Pakistan - Lahore',
            'address' => 'DHA Phase 2, Lahore',
            'latitude' => 31.4697,
            'longitude' => 74.4122,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $resident = User::factory()->create(['role' => 'resident', 'status' => 'active']);
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return [$community, $resident, $admin];
    }

    private function asUser(User $user, callable $callback): void
    {
        $request = Request::create('/api/v1/admin/essentials', 'POST');
        $request->setUserResolver(fn () => $user);
        $callback($request);
    }
}
