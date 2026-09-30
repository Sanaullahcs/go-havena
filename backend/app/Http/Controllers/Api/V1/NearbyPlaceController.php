<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\OsmGeocodingService;
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
    public function index(Request $request, OsmNearbyPlacesService $places, OsmGeocodingService $geocoder): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['nullable', 'string', Rule::in(OsmPlaceCategories::KEYS)],
            'all' => ['sometimes', 'boolean'],
            'community_id' => ['nullable', 'integer'],
        ]);

        $category = $validated['category'] ?? 'restaurants';
        $grouped = $request->boolean('all');
        $communityId = $this->resolveCommunityId($request, $request->user());
        $coords = NearbyDiscovery::resolveCommunityCoordinates($communityId, $geocoder);
        if (function_exists('set_time_limit')) {
            set_time_limit(20);
        }

        if (! $coords) {
            return response()->json([
                'data' => $grouped ? $this->emptyGroups() : [],
                'meta' => [
                    'radius_meters' => (int) config('osm.radius_meters', 3000),
                    'category' => $category,
                    'grouped' => $grouped,
                    'has_coordinates' => false,
                    'overpass_failed' => false,
                    'community_id' => $communityId,
                ],
            ]);
        }

        $data = $grouped
            ? $places->allByCategory($coords[0], $coords[1], $communityId)
            : $places->search($coords[0], $coords[1], $category, $communityId);

        return response()->json([
            'data' => $data,
            'meta' => [
                'radius_meters' => (int) config('osm.radius_meters', 3000),
                'category' => $category,
                'grouped' => $grouped,
                'has_coordinates' => true,
                'overpass_failed' => $places->bundleFailed(),
                'community_id' => $communityId,
                'latitude' => $coords[0],
                'longitude' => $coords[1],
            ],
        ]);
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
            $membership = DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->whereIn('status', ['approved', 'pending'])
                ->orderByRaw("CASE WHEN status = 'approved' THEN 0 ELSE 1 END")
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
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
