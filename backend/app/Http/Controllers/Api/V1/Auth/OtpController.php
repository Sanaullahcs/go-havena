<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\ActivityLogService;
use App\Services\CommunityLifecycleService;
use App\Services\LoginStreakService;
use App\Services\ContactIdentityService;
use App\Services\OtpService;
use App\Services\PointsRewardService;
use App\Support\PhoneNormalizer;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OtpController extends Controller
{
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard'],
        ]);

        $phone = PhoneNormalizer::normalize($validated['phone']);
        if (! $phone) {
            $this->failValidation('phone', 'Enter a valid phone number in international format.', 'INVALID_PHONE');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = PhoneNormalizer::findUserByPhone($validated['phone']);

        if ($intent === 'login') {
            if (! $user) {
                $this->failValidation(
                    'phone',
                    'No account found with this phone number. Please sign up first.',
                    'ACCOUNT_NOT_FOUND_USE_SIGNUP',
                );
            }

            if (($validated['portal'] ?? null) === 'community_admin_dashboard') {
                $this->assertCanAccessCommunityAdminDashboard($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);

            $phone = $user->phone;
        }

        if ($intent === 'signup' && $user && $this->isRegisteredUser($user)) {
            $this->failValidation(
                'phone',
                ContactIdentityService::DUPLICATE_MESSAGE,
                'ACCOUNT_EXISTS_USE_LOGIN',
            );
        }

        $key = 'otp-request:'.($request->ip() ?? 'unknown');
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json([
                'message' => 'Too many OTP requests. Please try again later.',
                'code' => 'RATE_LIMITED',
            ], 429);
        }
        RateLimiter::hit($key, 60);

        $otp->send($phone);

        return response()->json([
            'data' => [
                'message' => 'OTP dispatched',
                'phone' => $phone,
            ],
        ], 202);
    }

    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'code' => ['required', 'string', 'size:6'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'role' => ['sometimes', 'string', 'in:admin,resident'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard'],
        ]);

        $phone = PhoneNormalizer::normalize($validated['phone']);
        if (! $phone) {
            $this->failValidation('phone', 'Enter a valid phone number in international format.', 'INVALID_PHONE');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = PhoneNormalizer::findUserByPhone($validated['phone']);

        if ($intent === 'login' && $user) {
            $phone = $user->phone;
        }

        if ($intent === 'login') {
            if (! $user) {
                $this->failValidation(
                    'phone',
                    'No account found with this phone number. Please sign up first.',
                    'ACCOUNT_NOT_FOUND_USE_SIGNUP',
                );
            }

            if (($validated['portal'] ?? null) === 'community_admin_dashboard') {
                $this->assertCanAccessCommunityAdminDashboard($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);
        }

        if (! $this->verifyOtpForPhone($otp, $phone, $validated['code'], $validated['phone'])) {
            $this->failValidation('code', 'Invalid or expired verification code.', 'INVALID_OTP');
        }

        if ($intent === 'login') {
            $user->update(['phone_verified_at' => now()]);
        } else {
            if ($user && $this->isRegisteredUser($user)) {
                $this->failValidation(
                    'phone',
                    ContactIdentityService::DUPLICATE_MESSAGE,
                    'ACCOUNT_EXISTS_USE_LOGIN',
                );
            }

            $role = $validated['role'] ?? 'resident';
            $userRole = $role === 'admin' ? 'community_admin' : 'resident';
            $adminStatus = $role === 'admin' ? 'pending' : null;

            if (! $user) {
                $trashed = User::withTrashed()->where('phone', $phone)->first();
                if ($trashed?->trashed()) {
                    $trashed->restore();
                    $user = $trashed;
                    $user->update([
                        'phone' => $phone,
                        'email' => str_replace('+', '', $phone).'@phone.havena.local',
                        'phone_verified_at' => now(),
                        'status' => 'active',
                        'role' => $userRole,
                        'community_admin_status' => $adminStatus,
                        'suspension_reason' => null,
                    ]);
                    $user->profile()->firstOrCreate(['user_id' => $user->id], ['display_name' => '']);
                } else {
                    $user = $this->createSignupUser($phone, $userRole, $adminStatus);
                }
            } else {
                $user->update([
                    'phone' => $phone,
                    'email' => str_replace('+', '', $phone).'@phone.havena.local',
                    'phone_verified_at' => now(),
                    'role' => $userRole,
                    'community_admin_status' => $adminStatus,
                ]);
                $user->profile()->firstOrCreate(['user_id' => $user->id], ['display_name' => '']);
            }
        }

        $user->load(['profile.region', 'memberships.community']);

        app(LoginStreakService::class)->recordLogin($user);
        app(PointsRewardService::class)->awardDailyLogin($user);

        $tokenName = ($validated['portal'] ?? null) === 'community_admin_dashboard'
            ? 'web-admin'
            : 'mobile';
        $token = $user->createToken($tokenName)->plainTextToken;

        if ($intent === 'login') {
            ActivityLogService::user(
                'login',
                'Signed in with phone verification',
                null,
                null,
                'info',
                (int) $user->id,
                ['channel' => $tokenName],
            );
        }

        return response()->json([
            'token' => $token,
            'user' => new UserResource($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;
        if ($userId) {
            ActivityLogService::user(
                'logout',
                'Signed out of Havena',
                null,
                null,
                'info',
                (int) $userId,
            );
        }

        $request->user()?->currentAccessToken()?->delete();

        return response()->noContent();
    }

    private function createSignupUser(string $phone, string $userRole, ?string $adminStatus): User
    {
        $email = str_replace('+', '', $phone).'@phone.havena.local';

        try {
            $user = User::query()->create([
                'name' => '',
                'email' => $email,
                'phone' => $phone,
                'phone_verified_at' => now(),
                'password' => Str::random(32),
                'status' => 'active',
                'role' => $userRole,
                'community_admin_status' => $adminStatus,
            ]);

            Profile::query()->create([
                'user_id' => $user->id,
                'display_name' => '',
            ]);

            return $user;
        } catch (UniqueConstraintViolationException) {
            $existing = User::withTrashed()
                ->where('email', $email)
                ->orWhere('phone', $phone)
                ->first();

            if ($existing?->trashed()) {
                $existing->restore();
            }

            if ($existing && ! $this->isRegisteredUser($existing)) {
                $existing->update([
                    'phone' => $phone,
                    'email' => $email,
                    'phone_verified_at' => now(),
                    'role' => $userRole,
                    'community_admin_status' => $adminStatus,
                ]);
                $existing->profile()->firstOrCreate(['user_id' => $existing->id], ['display_name' => '']);

                return $existing->fresh();
            }

            $this->failValidation(
                'phone',
                ContactIdentityService::DUPLICATE_MESSAGE,
                'ACCOUNT_EXISTS_USE_LOGIN',
            );
        }
    }

    private function verifyOtpForPhone(OtpService $otp, string $phone, string $code, string $rawPhone): bool
    {
        if ($otp->verify($phone, $code)) {
            return true;
        }

        $normalized = PhoneNormalizer::normalize($rawPhone);
        if ($normalized && $normalized !== $phone && $otp->verify($normalized, $code)) {
            return true;
        }

        foreach (PhoneNormalizer::alternatesForLookup($normalized ?? $phone) as $alternate) {
            if ($otp->verify($alternate, $code)) {
                return true;
            }
        }

        return false;
    }

    private function isRegisteredUser(User $user): bool
    {
        if ($user->phone_verified_at) {
            return true;
        }

        return CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->exists();
    }

    private function assertAuthenticationAllowed(User $user, ?string $portal = null): void
    {
        $block = app(CommunityLifecycleService::class)->authenticationBlock($user, $portal);
        if ($block) {
            $this->failAuthenticationBlock('phone', $block);
        }
    }

    private function assertCanAccessCommunityAdminDashboard(User $user): void
    {
        if (AdminRoleService::isCommunityAdminRole($user)) {
            if (! AdminRoleService::isCommunityAdminApproved($user)) {
                if (AdminRoleService::isCommunityAdminRejected($user)) {
                    $this->failAuthenticationBlock('phone', [
                        'message'     => 'Your community admin application was not approved. Contact support for help.',
                        'code'        => 'COMMUNITY_ADMIN_REJECTED',
                        'status'      => 'rejected',
                        'reason'      => $user->community_admin_rejection_reason,
                        'rejected_by' => 'system_admin',
                    ]);
                }

                $this->failAuthenticationBlock('phone', [
                    'message'     => 'Your community admin application is awaiting approval by a system administrator.',
                    'code'        => 'COMMUNITY_ADMIN_PENDING',
                    'status'      => 'pending',
                    'reason'      => null,
                    'rejected_by' => null,
                ]);
            }

            return;
        }

        if (($user->role ?? '') === 'resident') {
            $this->failValidation(
                'phone',
                'This account is not authorized to access the Community Admin Dashboard. Please use the resident app instead.',
                'NOT_AUTHORIZED_COMMUNITY_ADMIN',
            );
        }

        $this->failValidation(
            'phone',
            'This account is not authorized to access the Community Admin Dashboard.',
            'NOT_AUTHORIZED_COMMUNITY_ADMIN',
        );
    }

    private function failValidation(string $field, string $message, string $code): never
    {
        throw new HttpResponseException(response()->json([
            'message' => $message,
            'code' => $code,
            'errors' => [
                $field => [$message],
            ],
        ], 422));
    }

    /** @param array{message: string, code: string, status?: string, reason?: ?string, rejected_by?: ?string} $block */
    private function failAuthenticationBlock(string $field, array $block): never
    {
        throw new HttpResponseException(response()->json([
            ...$block,
            'errors' => [
                $field => [$block['message']],
            ],
        ], 422));
    }
}
