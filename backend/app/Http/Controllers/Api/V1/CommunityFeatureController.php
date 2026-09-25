<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\CommunityFeatureException;
use App\Http\Controllers\Controller;
use App\Services\CommunityFeatureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommunityFeatureController extends Controller
{
    public function __construct(private readonly CommunityFeatureService $features)
    {
    }

    /** GET /v1/admin/resident-features */
    public function showMine(Request $request): JsonResponse
    {
        $communityId = $this->features->communityIdForUser($request->user());
        if (! $communityId) {
            throw CommunityFeatureException::forbidden();
        }

        return $this->show($request, $communityId);
    }

    /** PUT /v1/admin/resident-features */
    public function updateMine(Request $request): JsonResponse
    {
        $communityId = $this->features->communityIdForUser($request->user());
        if (! $communityId) {
            throw CommunityFeatureException::forbidden();
        }

        return $this->update($request, $communityId);
    }

    /** GET /v1/admin/communities/{id}/resident-features */
    public function show(Request $request, int $id): JsonResponse
    {
        $this->features->assertCanManage($request->user(), $id);

        return response()->json([
            'success' => true,
            'data' => $this->features->payloadForCommunity($id),
        ]);
    }

    /** PUT /v1/admin/communities/{id}/resident-features */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->features->assertCanManage($request->user(), $id);

        $validated = $request->validate([
            'features' => ['required', 'array'],
            'features.*' => ['boolean'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->features->save($id, $validated['features'], $request->user()),
        ]);
    }
}
