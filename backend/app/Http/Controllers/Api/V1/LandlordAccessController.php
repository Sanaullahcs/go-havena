<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Landlord\LandlordAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LandlordAccessController extends Controller
{
    public function show(Request $request, LandlordAccessService $access): JsonResponse
    {
        $user = $request->user();
        $communityId = (int) ($request->input('community_id')
            ?: $user->active_context_community_id
            ?: 0);

        if ($communityId <= 0) {
            return response()->json([
                'message' => 'community_id is required.',
            ], 422);
        }

        $snapshot = $access->resolve((int) $user->id, $communityId);

        $landlordCommunities = $access->landlordCommunityIds((int) $user->id);

        return response()->json([
            'data' => $snapshot,
            'meta' => [
                'landlord_community_ids' => $landlordCommunities,
                'landlord_community_picker' => count($landlordCommunities) > 1,
            ],
        ]);
    }
}