<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\CommunityFeatureException;
use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
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
            'data' => $this->features->payloadForCommunity($id, $request->user()),
        ]);
    }

    /** PUT /v1/admin/communities/{id}/resident-features */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->features->assertCanManage($request->user(), $id);

        $validated = $request->validate([
            'features' => ['required', 'array'],
            'features.*' => ['boolean'],
            'disable_reasons' => ['sometimes', 'array'],
            'disable_reasons.*' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        if (AdminRoleService::isSystemAdmin($user)) {
            $this->features->save($id, $validated['features'], $user);
        } else {
            $this->features->saveAsCommunityAdmin(
                $id,
                $validated['features'],
                $validated['disable_reasons'] ?? [],
                $user,
            );
        }

        return response()->json([
            'success' => true,
            'data' => $this->features->payloadForCommunity($id, $user),
        ]);
    }

    /** POST /v1/admin/resident-features/enable-requests */
    public function requestEnable(Request $request): JsonResponse
    {
        $communityId = $this->features->communityIdForUser($request->user());
        if (! $communityId) {
            throw CommunityFeatureException::forbidden();
        }

        $this->features->assertCanManage($request->user(), $communityId);

        $validated = $request->validate([
            'feature_key' => ['required', 'string', 'max:64'],
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $requestRow = $this->features->requestEnable(
            $communityId,
            $validated['feature_key'],
            $validated['reason'],
            $request->user(),
        );

        return response()->json([
            'success' => true,
            'data' => $requestRow,
            'features' => $this->features->payloadForCommunity($communityId, $request->user()),
        ]);
    }

    /** POST /v1/admin/resident-features/enable */
    public function enableMine(Request $request): JsonResponse
    {
        $communityId = $this->features->communityIdForUser($request->user());
        if (! $communityId) {
            throw CommunityFeatureException::forbidden();
        }

        $this->features->assertCanManage($request->user(), $communityId);

        $validated = $request->validate([
            'feature_key' => ['required', 'string', 'max:64'],
        ]);

        $this->features->enableAsCommunityAdmin(
            $communityId,
            $validated['feature_key'],
            $request->user(),
        );

        return response()->json([
            'success' => true,
            'data' => $this->features->payloadForCommunity($communityId, $request->user()),
        ]);
    }

    /** POST /v1/admin/resident-features/disable-requests */
    public function requestDisable(Request $request): JsonResponse
    {
        $communityId = $this->features->communityIdForUser($request->user());
        if (! $communityId) {
            throw CommunityFeatureException::forbidden();
        }

        $this->features->assertCanManage($request->user(), $communityId);

        $validated = $request->validate([
            'feature_key' => ['required', 'string', 'max:64'],
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $requestRow = $this->features->requestDisable(
            $communityId,
            $validated['feature_key'],
            $validated['reason'],
            $request->user(),
        );

        return response()->json([
            'success' => true,
            'data' => $requestRow,
            'features' => $this->features->payloadForCommunity($communityId, $request->user()),
        ]);
    }

    /** GET /v1/admin/feature-disable-requests */
    public function disableRequests(Request $request): JsonResponse
    {
        $status = $request->query('status', 'pending');

        return response()->json([
            'success' => true,
            'data' => $this->features->listDisableRequests(is_string($status) ? $status : 'pending'),
        ]);
    }

    /** POST /v1/admin/feature-disable-requests/{id}/approve */
    public function approveDisableRequest(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->features->reviewDisableRequest($id, $request->user(), true),
        ]);
    }

    /** POST /v1/admin/feature-disable-requests/{id}/reject */
    public function rejectDisableRequest(Request $request, int $id): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $this->features->reviewDisableRequest($id, $request->user(), false),
        ]);
    }
}
