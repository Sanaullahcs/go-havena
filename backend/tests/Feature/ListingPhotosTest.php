<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ListingPhotosTest extends TestCase
{
    use RefreshDatabase;

    private function seedCommunityWithResident(): array
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

        $resident = User::factory()->create([
            'role'   => 'resident',
            'status' => 'active',
            'phone'  => '+201700000041',
        ]);

        CommunityMembership::query()->create([
            'user_id'      => $resident->id,
            'community_id' => $community->id,
            'role'         => 'member',
            'status'       => 'approved',
        ]);

        return compact('community', 'resident');
    }

    public function test_listing_image_upload_endpoint_returns_url(): void
    {
        Storage::fake('public');
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithResident();

        Sanctum::actingAs($resident);

        $file = UploadedFile::fake()->create('listing.jpg', 100, 'image/jpeg');

        $response = $this->postJson('/api/v1/listings/upload-image', [
            'image' => $file,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertOk();

        $imageUrl = $response->json('data.image_url');
        $this->assertNotEmpty($imageUrl);
        $this->assertStringContainsString('/storage/listings/', $imageUrl);
        Storage::disk('public')->assertExists('listings/'.basename(parse_url($imageUrl, PHP_URL_PATH)));
    }

    public function test_resident_can_create_listing_with_six_images(): void
    {
        Storage::fake('public');
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithResident();

        Sanctum::actingAs($resident);

        $images = [];
        for ($i = 1; $i <= 6; $i++) {
            $upload = $this->postJson('/api/v1/listings/upload-image', [
                'image' => UploadedFile::fake()->create("photo-{$i}.jpg", 100, 'image/jpeg'),
            ], [
                'X-Community-Id' => (string) $community->id,
            ])->assertOk();

            $images[] = $upload->json('data.image_url');
        }

        $create = $this->postJson('/api/v1/listings', [
            'type'        => 'for_sale',
            'title'       => 'Vintage Dining Table',
            'description' => 'Solid wood table in great condition.',
            'price'       => 250,
            'category'    => 'Furniture',
            'condition'   => 'Good',
            'images'      => $images,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertCreated();

        $this->assertSame('pending', $create->json('data.status'));

        $listingId = $create->json('data.id');

        $this->getJson('/api/v1/listings/'.$listingId, [
            'X-Community-Id' => (string) $community->id,
        ])
            ->assertOk()
            ->assertJsonCount(6, 'data.images');
    }

    public function test_create_listing_rejects_more_than_six_images(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithResident();

        Sanctum::actingAs($resident);

        $images = [];
        for ($i = 1; $i <= 7; $i++) {
            $images[] = "/storage/listings/photo-{$i}.jpg";
        }

        $this->postJson('/api/v1/listings', [
            'type'        => 'for_sale',
            'title'       => 'Too many photos',
            'description' => 'Should fail validation.',
            'price'       => 10,
            'category'    => 'Other',
            'condition'   => 'Like New',
            'images'      => $images,
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);
    }

    public function test_create_listing_requires_price_and_category(): void
    {
        ['community' => $community, 'resident' => $resident] = $this->seedCommunityWithResident();

        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/listings', [
            'type'        => 'for_sale',
            'title'       => 'Missing fields',
            'description' => 'No price or category.',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);

        $this->postJson('/api/v1/listings', [
            'type'        => 'wanted',
            'title'       => 'Not allowed type',
            'description' => 'Wanted listings are no longer supported.',
            'price'       => 10,
            'category'    => 'Other',
            'condition'   => 'Good',
        ], [
            'X-Community-Id' => (string) $community->id,
        ])->assertStatus(422);
    }
}
