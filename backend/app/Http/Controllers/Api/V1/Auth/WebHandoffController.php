<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\CommunityAdminAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class WebHandoffController extends Controller
{
    private const TTL_SECONDS = 300;

    /** POST /v1/auth/web-handoff — authenticated mobile session → one-time web login code */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $code = Str::random(48);
        Cache::put($this->cacheKey($code), (int) $user->id, self::TTL_SECONDS);

        return response()->json([
            'code' => $code,
            'expires_in' => self::TTL_SECONDS,
        ]);
    }

    /** POST /v1/auth/web-handoff/consume — exchange one-time code for a web Sanctum token */
    public function consume(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'min:24', 'max:80'],
        ]);

        $userId = Cache::pull($this->cacheKey($validated['code']));
        if (! $userId) {
            return response()->json([
                'message' => 'This admin portal link expired. Open it again from the app.',
                'code' => 'HANDOFF_EXPIRED',
            ], 422);
        }

        $user = User::query()->with(['profile.region', 'memberships.community'])->find($userId);
        if (! $user) {
            return response()->json([
                'message' => 'This admin portal link is no longer valid.',
                'code' => 'HANDOFF_EXPIRED',
            ], 422);
        }

        $token = $user->createToken('web-admin')->plainTextToken;
        $userPayload = (new UserResource($user))->resolve();
        if (AdminRoleService::isCommunityAdminRole($user)) {
            $userPayload['access'] = app(CommunityAdminAccessService::class)->accessPayload($user);
        }

        return response()->json([
            'token' => $token,
            'user' => $userPayload,
        ]);
    }

    private function cacheKey(string $code): string
    {
        return 'web_handoff:'.$code;
    }
}
