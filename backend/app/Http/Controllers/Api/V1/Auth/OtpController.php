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
use App\Services\ReferralService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class OtpController extends Controller
{
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            $this->failValidation('email', 'Enter a valid email address.', 'INVALID_EMAIL');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = ContactIdentityService::findActiveUserByEmail($email)
            ?? User::withTrashed()->where('email', $email)->first();

        if ($intent === 'login') {
            if (! $user || $user->trashed()) {
                $this->failValidation(
                    'email',
                    'Account not found. Please create an account first.',
                    'ACCOUNT_NOT_FOUND_USE_SIGNUP',
                );
            }

            if (($validated['portal'] ?? null) === 'community_admin_dashboard') {
                $this->assertCanAccessCommunityAdminDashboard($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);

            $email = ContactIdentityService::normalizeEmail($user->email) ?? $email;
        }

        if ($intent === 'signup' && $user && ! $user->trashed() && $this->isRegisteredUser($user)) {
            $this->failValidation(
                'email',
                ContactIdentityService::DUPLICATE_EMAIL_MESSAGE,
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

        $otp->send($email);

        return response()->json([
            'data' => [
                'message' => 'OTP dispatched',
                'email' => $email,
            ],
        ], 202);
    }

    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'code' => ['required', 'string', 'size:6'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'role' => ['sometimes', 'string', 'in:admin,resident'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard'],
            'referral_code' => ['nullable', 'string', 'max:16'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            $this->failValidation('email', 'Enter a valid email address.', 'INVALID_EMAIL');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = ContactIdentityService::findActiveUserByEmail($email)
            ?? User::withTrashed()->where('email', $email)->first();

        if ($intent === 'login') {
            if (! $user || $user->trashed()) {
                $this->failValidation(
                    'email',
                    'Account not found. Please create an account first.',
                    'ACCOUNT_NOT_FOUND_USE_SIGNUP',
                );
            }

            if (($validated['portal'] ?? null) === 'community_admin_dashboard') {
                $this->assertCanAccessCommunityAdminDashboard($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);
        }

        if (! $otp->verify($email, $validated['code'])) {
            $this->failValidation('code', 'Invalid or expired verification code.', 'INVALID_OTP');
        }

        if ($intent === 'login') {
            $user->update([
                'email_verified_at' => now(),
            ]);
        } else {
            if ($user && ! $user->trashed() && $this->isRegisteredUser($user)) {
                $this->failValidation(
                    'email',
                    ContactIdentityService::DUPLICATE_EMAIL_MESSAGE,
                    'ACCOUNT_EXISTS_USE_LOGIN',
                );
            }

            $role = $validated['role'] ?? 'resident';
            $userRole = $role === 'admin' ? 'community_admin' : 'resident';
            $adminStatus = $role === 'admin' ? 'pending' : null;

            if (! $user) {
                $user = $this->createSignupUser($email, $userRole, $adminStatus);
            } elseif ($user->trashed()) {
                $user->restore();
                $user->update([
                    'email' => $email,
                    'email_verified_at' => now(),
                    'status' => 'active',
                    'role' => $userRole,
                    'community_admin_status' => $adminStatus,
                    'suspension_reason' => null,
                ]);
                $user->profile()->firstOrCreate(['user_id' => $user->id], ['display_name' => '']);
            } else {
                $user->update([
                    'email' => $email,
                    'email_verified_at' => now(),
                    'role' => $userRole,
                    'community_admin_status' => $adminStatus,
                ]);
                $user->profile()->firstOrCreate(['user_id' => $user->id], ['display_name' => '']);
            }

            if ($userRole === 'community_admin') {
                app(ReferralService::class)->lockAtSignup(
                    $user,
                    $validated['referral_code'] ?? null,
                    source: ($validated['portal'] ?? null) === 'community_admin_dashboard' ? 'web_link' : 'mobile_signup',
                    referralToken: $validated['referral_code'] ?? null,
                );
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
                'Signed in with email verification',
                null,
                null,
                'info',
                (int) $user->id,
                ['channel' => $tokenName],
            );
        }

        $userPayload = (new UserResource($user))->resolve();
        if (AdminRoleService::isCommunityAdminRole($user)) {
            $userPayload['access'] = app(\App\Services\CommunityAdminAccessService::class)
                ->accessPayload($user);
        }

        return response()->json([
            'token' => $token,
            'user' => $userPayload,
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

    private function createSignupUser(string $email, string $userRole, ?string $adminStatus): User
    {
        try {
            $user = User::query()->create([
                'name' => '',
                'email' => $email,
                'phone' => null,
                'email_verified_at' => now(),
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
            $existing = User::withTrashed()->where('email', $email)->first();

            if ($existing?->trashed()) {
                $existing->restore();
            }

            if ($existing && ! $this->isRegisteredUser($existing)) {
                $existing->update([
                    'email' => $email,
                    'email_verified_at' => now(),
                    'role' => $userRole,
                    'community_admin_status' => $adminStatus,
                ]);
                $existing->profile()->firstOrCreate(['user_id' => $existing->id], ['display_name' => '']);

                return $existing->fresh();
            }

            $this->failValidation(
                'email',
                ContactIdentityService::DUPLICATE_EMAIL_MESSAGE,
                'ACCOUNT_EXISTS_USE_LOGIN',
            );
        }
    }

    private function isRegisteredUser(User $user): bool
    {
        if ($user->email_verified_at || $user->phone_verified_at) {
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
            $this->failAuthenticationBlock('email', $block);
        }
    }

    private function assertCanAccessCommunityAdminDashboard(User $user): void
    {
        if (AdminRoleService::isCommunityAdminRole($user)) {
            if (AdminRoleService::isCommunityAdminRejected($user)) {
                $block = app(\App\Services\CommunityLifecycleService::class)
                    ->rejectionBlockDetails($user, 'community_admin_dashboard');
                $this->failAuthenticationBlock('email', $block ?? [
                    'message'     => 'Your community admin application was not approved. Contact support for help.',
                    'code'        => 'COMMUNITY_ADMIN_REJECTED',
                    'status'      => 'rejected',
                    'reason'      => $user->community_admin_rejection_reason,
                    'rejected_by' => 'system_admin',
                ]);
            }

            return;
        }

        if (($user->role ?? '') === 'resident') {
            $this->failValidation(
                'email',
                'This account is not authorized to access the Community Admin Dashboard. Please use the resident app instead.',
                'NOT_AUTHORIZED_COMMUNITY_ADMIN',
            );
        }

        $this->failValidation(
            'email',
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
