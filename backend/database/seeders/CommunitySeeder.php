<?php

namespace Database\Seeders;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\InviteCode;
use App\Models\Region;
use App\Models\User;
use App\Services\CommunityLifecycleService;
use App\Services\MembershipService;
use Illuminate\Database\Seeder;

class CommunitySeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RegionSeeder::class);

        $regions = Region::query()
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->get()
            ->keyBy('title');

        // Only use an admin who does not already manage an approved community.
        // Attaching a second pending community to the demo admin breaks the mobile dashboard.
        $requester = User::query()
            ->where('role', 'community_admin')
            ->where('community_admin_status', 'approved')
            ->whereDoesntHave('memberships', function ($query) {
                $query->where('status', 'approved')
                    ->whereIn('role', ['admin', 'moderator']);
            })
            ->orderBy('id')
            ->first();

        $activeCommunities = [
            [
                'name' => 'Harbor Point Residences',
                'region_title' => 'Massachusetts - Boston',
                'address' => '50 Liberty Drive, Boston, MA 02210',
                'description' => 'Waterfront residences in Boston’s Seaport District with a fitness studio, courtyard garden, lounge, and 24-hour concierge.',
                'invite_code' => 'HARBOR-2026',
                'latitude' => 42.34955,
                'longitude' => -71.04185,
            ],
            [
                'name' => 'Oak Valley Residences',
                'region_title' => 'Florida - Miami-Dade County',
                'address' => '1200 Oak Valley Blvd, Miami, FL 33101',
                'description' => 'Gated community with pool, gym, and 24/7 security.',
                'invite_code' => 'MAPLE-2024-XYZ',
            ],
            [
                'name' => 'Sunset Gardens',
                'region_title' => 'Florida - Miami-Dade County',
                'address' => '450 Sunset Ave, Coral Gables, FL 33134',
                'description' => 'Family-friendly townhomes near schools and parks.',
            ],
            [
                'name' => 'Brickell Heights',
                'region_title' => 'Florida - Miami-Dade County',
                'address' => '88 Brickell Plaza, Miami, FL 33131',
                'description' => 'High-rise living in the heart of Brickell.',
            ],
            [
                'name' => 'Maple Grove Apartments',
                'region_title' => 'Florida - Tampa Bay',
                'address' => '220 Maple Grove Dr, Tampa, FL 33602',
                'description' => 'Modern apartments with rooftop lounge.',
                'invite_code' => 'TAMPA-GROVE-24',
            ],
            [
                'name' => 'Harbor View Condos',
                'region_title' => 'Florida - Tampa Bay',
                'address' => '15 Harbor View Ln, St. Petersburg, FL 33701',
                'description' => 'Waterfront condos with marina access.',
            ],
            [
                'name' => 'Lake Eola Towers',
                'region_title' => 'Florida - Orlando',
                'address' => '300 Eola Dr, Orlando, FL 32801',
                'description' => 'Downtown Orlando high-rise community.',
            ],
            [
                'name' => 'Sunflower Heights Estate',
                'region_title' => 'New York - NYC',
                'address' => '742 Riverside Dr, New York, NY 10031',
                'description' => 'Premium residential community in upper Manhattan.',
                'invite_code' => 'NYC-SUNFLOWER',
            ],
            [
                'name' => 'Brooklyn Commons',
                'region_title' => 'New York - NYC',
                'address' => '180 Atlantic Ave, Brooklyn, NY 11201',
                'description' => 'Mixed-use building with co-working and fitness center.',
            ],
            [
                'name' => 'Bay Area Tech Park',
                'region_title' => 'California - Bay Area',
                'address' => '500 Innovation Way, San Jose, CA 95110',
                'description' => 'Live-work community near major tech campuses.',
            ],
            [
                'name' => 'Pacific Heights Residences',
                'region_title' => 'California - Bay Area',
                'address' => '2100 Pacific Ave, San Francisco, CA 94115',
                'description' => 'Historic neighborhood luxury apartments.',
            ],
            [
                'name' => 'Austin Ridge',
                'region_title' => 'Texas - Austin',
                'address' => '8900 Ridge Rd, Austin, TX 78749',
                'description' => 'Hill Country views with trail access.',
            ],
            [
                'name' => 'Lone Star Lofts',
                'region_title' => 'Texas - Houston',
                'address' => '1200 Main St, Houston, TX 77002',
                'description' => 'Converted warehouse lofts downtown.',
            ],
            [
                'name' => 'Midtown Atlanta Flats',
                'region_title' => 'Georgia - Atlanta',
                'address' => '950 Peachtree St NE, Atlanta, GA 30309',
                'description' => 'Walkable midtown living near arts district.',
            ],
            [
                'name' => 'Windy City Lofts',
                'region_title' => 'Illinois - Chicago',
                'address' => '400 W Chicago Ave, Chicago, IL 60654',
                'description' => 'River North loft community with dog park.',
            ],
        ];

        foreach ($activeCommunities as $data) {
            $region = $regions->get($data['region_title']);
            if (! $region) {
                continue;
            }

            $community = Community::query()->updateOrCreate(
                ['name' => $data['name']],
                [
                    'region' => $region->title,
                    'region_id' => $region->id,
                    'address' => $data['address'],
                    'description' => $data['description'],
                    'timezone' => $this->timezoneForState($region->state),
                    'status' => 'active',
                    'review_status' => 'approved',
                    'reviewed_at' => now()->subDays(rand(5, 60)),
                    'latitude' => $data['latitude'] ?? null,
                    'longitude' => $data['longitude'] ?? null,
                ],
            );

            if (! empty($data['invite_code'])) {
                InviteCode::query()->firstOrCreate(
                    ['code' => $data['invite_code']],
                    [
                        'community_id' => $community->id,
                        'created_by' => null,
                        'max_uses' => null,
                        'used_count' => 0,
                        'expires_at' => null,
                    ],
                );
            }
        }

        $pendingRequests = [
            [
                'name' => 'Palm Coast Villas',
                'region_title' => 'Florida - Jacksonville',
                'address' => '55 Coastal Hwy, Jacksonville, FL 32250',
                'description' => 'New beachside community request awaiting approval.',
            ],
            [
                'name' => 'Desert Bloom Estates',
                'region_title' => 'Arizona - Phoenix',
                'address' => '7800 Desert Bloom Rd, Scottsdale, AZ 85251',
                'description' => 'Master-planned community with golf course.',
            ],
            [
                'name' => 'Rocky Mountain View',
                'region_title' => 'Colorado - Denver',
                'address' => '1600 Mountain View Dr, Denver, CO 80202',
                'description' => 'Mountain-view townhomes near downtown Denver.',
            ],
            [
                'name' => 'Vegas Skyline Towers',
                'region_title' => 'Nevada - Las Vegas',
                'address' => '3300 Las Vegas Blvd S, Las Vegas, NV 89109',
                'description' => 'Strip-adjacent residential tower request.',
            ],
        ];

        $assignedPendingRequest = false;

        foreach ($pendingRequests as $data) {
            $region = $regions->get($data['region_title']);
            if (! $region) {
                continue;
            }

            // Demo data: only one pending request per phone — extras stay unassigned samples.
            $assignRequester = $requester && ! $assignedPendingRequest;

            $community = Community::query()->updateOrCreate(
                ['name' => $data['name']],
                [
                    'region' => $region->title,
                    'region_id' => $region->id,
                    'address' => $data['address'],
                    'description' => $data['description'],
                    'timezone' => $this->timezoneForState($region->state),
                    'status' => 'inactive',
                    'review_status' => 'pending',
                    'requested_by_user_id' => $assignRequester ? $requester->id : null,
                ],
            );

            if ($assignRequester) {
                CommunityMembership::query()->firstOrCreate(
                    [
                        'user_id'      => $requester->id,
                        'community_id' => $community->id,
                    ],
                    [
                        'role'   => MembershipService::membershipRoleFor($requester),
                        'status' => 'pending',
                    ],
                );
                $assignedPendingRequest = true;
            }
        }

        app(CommunityLifecycleService::class)->dedupePendingCommunityRequests();

        $rejected = [
            [
                'name' => 'Duplicate Harbor Place',
                'region_title' => 'Florida - Tampa Bay',
                'address' => '999 Duplicate St, Tampa, FL 33602',
                'description' => 'Rejected — duplicate community name in region.',
                'rejection_reason' => 'A community with a similar name already exists in this region.',
            ],
        ];

        foreach ($rejected as $data) {
            $region = $regions->get($data['region_title']);
            if (! $region) {
                continue;
            }

            Community::query()->updateOrCreate(
                ['name' => $data['name']],
                [
                    'region' => $region->title,
                    'region_id' => $region->id,
                    'address' => $data['address'],
                    'description' => $data['description'],
                    'timezone' => $this->timezoneForState($region->state),
                    'status' => 'inactive',
                    'review_status' => 'rejected',
                    'rejection_reason' => $data['rejection_reason'],
                    'reviewed_at' => now()->subDays(3),
                    'requested_by_user_id' => $requester?->id,
                ],
            );
        }

        $this->command?->info('CommunitySeeder: regions linked and dummy communities seeded.');
    }

    private function timezoneForState(?string $state): string
    {
        return match ($state) {
            'California', 'Washington', 'Nevada' => 'America/Los_Angeles',
            'Texas', 'Illinois' => 'America/Chicago',
            'New York', 'Florida', 'Georgia', 'Virginia', 'Massachusetts', 'Pennsylvania', 'North Carolina' => 'America/New_York',
            'Colorado', 'Arizona' => 'America/Denver',
            default => 'America/New_York',
        };
    }
}
