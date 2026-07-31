<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\ActivityLogService;
use App\Services\CommunityLifecycleService;
use App\Services\LoginStreakService;
use App\Services\PointsRewardService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class LoginController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email'    => ['nullable', 'email', 'required_without:phone'],
            'phone'    => ['nullable', 'string', 'max:30', 'required_without:email'],
            'password' => ['required', 'string'],
        ]);

        $attempt = ['password' => $credentials['password']];

        if (! empty($credentials['email'])) {
            $attempt['email'] = $credentials['email'];
        } else {
            $phone = PhoneNormalizer::normalize($credentials['phone']);
            if (! $phone) {
                throw ValidationException::withMessages([
                    'phone' => ['Enter a valid phone number in international format.'],
                ]);
            }
            $attempt['phone'] = $phone;
        }

        if (! Auth::attempt($attempt)) {
            throw ValidationException::withMessages([
                isset($attempt['email']) ? 'email' : 'phone' => ['Invalid credentials.'],
            ]);
        }

        /** @var \App\Models\User $user */
        $user = Auth::user();

        $portal = \App\Services\AdminRoleService::isCommunityAdminRole($user)
            ? 'community_admin_dashboard'
            : null;
        $block = app(CommunityLifecycleService::class)->authenticationBlock($user, $portal);
        if ($block) {
            Auth::logout();

            return response()->json($block, 403);
        }

        $user->load(['profile.region', 'memberships.community']);

        app(LoginStreakService::class)->recordLogin($user);
        app(PointsRewardService::class)->awardDailyLogin($user);

        $tokenName = isset($attempt['phone']) ? 'mobile' : 'web-admin';
        $token = $user->createToken($tokenName)->plainTextToken;

        ActivityLogService::user(
            'login',
            'Signed in to NeighborLink',
            null,
            null,
            'info',
            (int) $user->id,
            ['channel' => $tokenName],
        );

        return response()->json([
            'token' => $token,
            'user'  => new UserResource($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        if ($userId) {
            ActivityLogService::user(
                'logout',
                'Signed out of NeighborLink',
                null,
                null,
                'info',
                (int) $userId,
            );
        }

        $request->user()?->currentAccessToken()?->delete();

        return response()->json(null, 204);
    }
}
