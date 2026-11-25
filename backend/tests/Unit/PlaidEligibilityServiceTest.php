<?php

namespace Tests\Unit;

use App\Exceptions\PlaidException;
use App\Models\Community;
use App\Models\Country;
use App\Models\Region;
use App\Models\State;
use App\Services\PlaidEligibilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlaidEligibilityServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_pakistan_communities_are_not_eligible(): void
    {
        $community = $this->seedCommunity('PK', Country::BILLING_EXEMPT, 'Pakistan - Lahore');
        $service = app(PlaidEligibilityService::class);

        $this->assertFalse($service->isCommunityEligible($community->id));
        $this->expectException(PlaidException::class);
        $service->assertCommunityEligible($community->id);
    }

    public function test_us_communities_are_eligible(): void
    {
        $community = $this->seedCommunity('US', Country::BILLING_REQUIRED, 'Florida');
        $service = app(PlaidEligibilityService::class);

        $this->assertTrue($service->isCommunityEligible($community->id));
        $service->assertCommunityEligible($community->id);
        $this->assertContains('US', $service->supportedCountryCodes());
    }

    public function test_unsupported_country_is_rejected_without_hardcoding_pk_only(): void
    {
        config(['plaid.supported_country_codes' => ['US']]);
        $community = $this->seedCommunity('CA', Country::BILLING_REQUIRED, 'Ontario');
        $service = app(PlaidEligibilityService::class);

        $this->assertFalse($service->isCommunityEligible($community->id));
    }

    public function test_legacy_community_without_country_remains_eligible(): void
    {
        $region = Region::query()->create([
            'title' => 'Unspecified Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Legacy Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 20,
        ]);

        $this->assertTrue(app(PlaidEligibilityService::class)->isCommunityEligible($community->id));
    }

    private function seedCommunity(string $countryCode, string $billingPolicy, string $regionTitle): Community
    {
        $country = Country::query()->updateOrCreate(
            ['code' => $countryCode],
            [
                'name' => $countryCode === 'PK' ? 'Pakistan' : $countryCode,
                'billing_policy' => $billingPolicy,
                'sort_order' => 1,
                'status' => 'active',
            ],
        );

        $state = State::query()->updateOrCreate(
            ['country_id' => $country->id, 'name' => 'Test State'],
            [
                'sort_order' => 1,
                'status' => 'active',
            ],
        );

        $region = Region::query()->create([
            'title' => $regionTitle,
            'area' => 'Test Area',
            'state' => $state->name,
            'state_id' => $state->id,
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        return Community::query()->create([
            'name' => $countryCode.' Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => '100 Test Lane',
            'status' => 'active',
            'review_status' => 'approved',
            'estimated_residents' => 40,
        ]);
    }
}
