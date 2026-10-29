<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\UserActingContextService;
use App\Services\UserBlockService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserBlockController extends Controller
{
    /** GET /v1/users/blocked */
    public function index(Request $request): JsonResponse
    {
        $rows = UserBlockService::listBlocked((int) $request->user()->id);

        return response()->json([
            'data' => array_map(fn (array $row) => [
                ...$row,
                'avatar_url' => MediaUrl::toPublic($row['avatar_url'] ?? null, $request),
            ], $rows),
        ]);
    }

    /** POST /v1/users/{id}/block */
    public function store(int $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        UserBlockService::block((int) $user->id, $id, $communityId);

        return response()->json([
            'message' => 'User blocked successfully.',
            'data'    => [
                'blocked_user_id' => $id,
                'is_blocked'      => true,
            ],
        ]);
    }

    /** DELETE /v1/users/{id}/block */
    public function destroy(int $id, Request $request): JsonResponse
    {
        UserBlockService::unblock((int) $request->user()->id, $id);

        return response()->json([
            'message' => 'User unblocked.',
            'data'    => [
                'blocked_user_id' => $id,
                'is_blocked'      => false,
            ],
        ]);
    }

    private function resolveCommunityId(Request $request, $user): ?int
    {
        $requested = $request->integer('community_id') ?: (int) $request->header('X-Community-Id');
        if ($requested > 0) {
            $ok = DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->where('community_id', $requested)
                ->where('status', 'approved')
                ->exists();
            if ($ok) {
                return $requested;
            }
        }

        return UserActingContextService::currentCommunityId($user);
    }
}
