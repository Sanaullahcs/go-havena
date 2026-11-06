<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CommunityDirectoryService;
use App\Services\OsmGeocodingService;
use App\Services\UserActingContextService;
use App\Services\OsmNearbyPlacesService;
use App\Support\NearbyDiscovery;
use App\Support\OsmPlaceCategories;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NearbyPlaceController extends Controller
{
    /** GET /v1/nearby-places?category= */
    public function index(Request $request, OsmNearbyPlacesService $places, OsmGeocodingService $geocoder, CommunityDirectoryService $directory): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['nullable', 'string', Rule::in(OsmPlaceCategories::KEYS)],
            'all' => ['sometimes', 'boolean'],
            'community_id' => ['nullable', 'integer'],
            'radius_meters' => ['nullable', 'integer', Rule::in(OsmNearbyPlacesService::allowedRadiusMeters())],
            'page' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $category = $validated['category'] ?? 'restaurants';
        $radius = OsmNearbyPlacesService::normalizeRadiusMeters($validated['radius_meters'] ?? null);
        $grouped = $request->boolean('all');
        $communityId = $this->resolveCommunityId($request, $request->user());
        $coords = NearbyDiscovery::resolveCommunityCoordinates($communityId, $geocoder);
        if (function_exists('set_time_limit')) {
            set_time_limit(60);
        }

        if (! $coords) {
            return response()->json([
                'data' => $grouped ? $this->emptyGroups() : [],
                'meta' => [
                    'radius_meters' => $radius,
                    'category' => $category,
                    'grouped' => $grouped,
                    'has_coordinates' => false,
                    'overpass_failed' => false,
                    'community_id' => $communityId,
                ],
            ]);
        }

        if ($grouped && isset($validated['page'])) {
            $paged = $places->groupedPage($coords[0], $coords[1], $communityId, $radius, (int) $validated['page']);
            $data = $directory->overlay($communityId, $coords[0], $coords[1], $paged['groups'], true, null);
            $data = $this->withinRadius($data, true, $radius);

            return response()->json([
                'data' => $data,
                'meta' => [
                    'radius_meters' => $radius,
                    'category' => $category,
                    'grouped' => true,
                    'has_coordinates' => true,
                    'overpass_failed' => false,
                    'community_id' => $communityId,
                    'latitude' => $coords[0],
                    'longitude' => $coords[1],
                    'page' => $paged['page'],
                    'page_count' => $paged['page_count'],
                    'has_more' => $paged['has_more'],
                    'next_page' => $paged['has_more'] ? $paged['page'] + 1 : null,
                ],
            ]);
        }

        $data = $grouped
            ? $places->allByCategory($coords[0], $coords[1], $communityId, $radius)
            : $places->search($coords[0], $coords[1], $category, $communityId, $radius);
        $data = $directory->overlay($communityId, $coords[0], $coords[1], $data, $grouped, $category);
        $data = $this->withinRadius($data, $grouped, $radius);

        return response()->json([
            'data' => $data,
            'meta' => [
                'radius_meters' => $radius,
                'category' => $category,
                'grouped' => $grouped,
                'has_coordinates' => true,
                'overpass_failed' => $places->bundleFailed(),
                'community_id' => $communityId,
                'latitude' => $coords[0],
                'longitude' => $coords[1],
                'page' => 1,
                'page_count' => 1,
                'has_more' => false,
                'next_page' => null,
            ],
        ]);
    }

    /**
     * @param  list<array<string, mixed>>|array<string, list<array<string, mixed>>>  $data
     * @return list<array<string, mixed>>|array<string, list<array<string, mixed>>>
     */
    private function withinRadius(array $data, bool $grouped, int $radius): array
    {
        $keep = function ($place) use ($radius) {
            if (! is_array($place)) {
                return false;
            }
            $meters = $place['distance_meters'] ?? null;
            if ($meters === null) {
                return true;
            }

            return (int) $meters <= $radius;
        };

        if ($grouped) {
            foreach ($data as $key => $rows) {
                $data[$key] = array_values(array_filter(is_array($rows) ? $rows : [], $keep));
            }

            return $data;
        }

        return array_values(array_filter($data, $keep));
    }

    /** @return array<string, list<mixed>> */
    private function emptyGroups(): array
    {
        $groups = [];
        foreach (OsmPlaceCategories::KEYS as $key) {
            $groups[$key] = [];
        }

        return $groups;
    }

    private function resolveCommunityId(Request $request, $user): int
    {
        $requested = 0;
        if ($request->filled('community_id')) {
            $requested = (int) $request->community_id;
        } elseif ($request->header('X-Community-Id')) {
            $requested = (int) $request->header('X-Community-Id');
        }

        if ($user && $requested > 0 && $this->userBelongsToCommunity($user->id, $requested)) {
            return $requested;
        }

        if ($user) {
            $current = UserActingContextService::currentCommunityId($user);
            if ($current) {
                return $current;
            }

            $membership = DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->whereIn('status', ['approved', 'pending'])
                ->orderByRaw("CASE WHEN status = 'approved' THEN 0 ELSE 1 END")
                ->orderBy('created_at')
                ->orderBy('id')
                ->first();

            if ($membership) {
                return (int) $membership->community_id;
            }
        }

        abort(422, 'No community is assigned to your account.');
    }

    private function userBelongsToCommunity(int $userId, int $communityId): bool
    {
        return DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();
    }
}
