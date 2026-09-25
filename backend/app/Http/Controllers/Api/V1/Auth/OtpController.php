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
use App\Services\OtpRateLimitService;
use App\Services\OtpService;
use App\Services\PointsRewardService;
use App\Services\LifecycleMailService;
use App\Services\ReferralService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class OtpController extends Controller
{
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard,resident_portal'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (
            ! $email
            || ContactIdentityService::isPlaceholderEmail($email)
            || ! ContactIdentityService::hasValidLocalPart($email)
        ) {
            $this->failValidation('email', 'Please enter a valid email address.', 'INVALID_EMAIL');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = ContactIdentityService::findUserByEmail($email, withTrashed: true);

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

            if (($validated['portal'] ?? null) === 'resident_portal') {
                $this->assertCanAccessResidentPortal($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);

            $email = ContactIdentityService::normalizeEmail($user->email) ?? $email;
        }

        if ($intent === 'signup') {
            $this->assertEmailAvailableForSignup(
                ContactIdentityService::findActiveUserByEmail($email) ?? $user,
            );
        }

        $rateLimit = app(OtpRateLimitService::class);
        $rateLimit->assertCanRequest($email);
        $issued = $otp->send($email);
        $limits = $rateLimit->recordRequest($email);
        $timing = $otp->challengeTiming($issued);

        return response()->json([
            'data' => [
                'message' => 'OTP dispatched',
                'email' => $email,
                'expires_at' => $timing['expires_at'],
                'expires_in_seconds' => $timing['expires_in_seconds'],
                'rate_limit' => $limits,
            ],
        ], 202);
    }

    public function challenge(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard,resident_portal'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (
            ! $email
            || ContactIdentityService::isPlaceholderEmail($email)
            || ! ContactIdentityService::hasValidLocalPart($email)
        ) {
            $this->failValidation('email', 'Please enter a valid email address.', 'INVALID_EMAIL');
        }

        $pending = $otp->pending($email);
        $rateLimit = app(OtpRateLimitService::class)->status($email);

        if (! $pending) {
            return response()->json([
                'data' => [
                    'active' => false,
                    'email' => $email,
                    'rate_limit' => $rateLimit,
                ],
            ]);
        }

        $timing = $otp->challengeTiming($pending);

        return response()->json([
            'data' => [
                'active' => true,
                'email' => $email,
                'expires_at' => $timing['expires_at'],
                'expires_in_seconds' => $timing['expires_in_seconds'],
                'rate_limit' => $rateLimit,
            ],
        ]);
    }

    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'code' => ['required', 'string', 'size:6'],
            'intent' => ['sometimes', 'string', 'in:login,signup'],
            'role' => ['sometimes', 'string', 'in:admin,resident'],
            'portal' => ['sometimes', 'string', 'in:community_admin_dashboard,resident_portal'],
            'referral_code' => ['nullable', 'string', 'max:16'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (
            ! $email
            || ContactIdentityService::isPlaceholderEmail($email)
            || ! ContactIdentityService::hasValidLocalPart($email)
        ) {
            $this->failValidation('email', 'Please enter a valid email address.', 'INVALID_EMAIL');
        }

        $intent = $validated['intent'] ?? 'login';
        $user = ContactIdentityService::findUserByEmail($email, withTrashed: true);

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

            if (($validated['portal'] ?? null) === 'resident_portal') {
                $this->assertCanAccessResidentPortal($user);
            }

            $this->assertAuthenticationAllowed($user, $validated['portal'] ?? null);
        } else {
            $this->assertEmailAvailableForSignup(
                ContactIdentityService::findActiveUserByEmail($email) ?? $user,
            );
        }

        $rateLimit = app(OtpRateLimitService::class);
        $rateLimit->assertCanVerify($email);

        if (! $otp->verify($email, $validated['code'])) {
            $rateLimit->recordFailedVerify($email);
            $this->failValidation('code', 'Invalid or expired verification code.', 'INVALID_OTP');
        }

        $rateLimit->clear($email);

        if ($intent === 'login') {
            $user->update([
                'email_verified_at' => now(),
            ]);
        } else {
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
                app(LifecycleMailService::class)->communityAdminSignedUp($user);
            } else {
                app(LifecycleMailService::class)->residentSignedUp($user);
            }
        }

        $user->load(['profile.region', 'memberships.community']);

        app(LoginStreakService::class)->recordLogin($user);
        app(PointsRewardService::class)->awardDailyLogin($user);

        $tokenName = match ($validated['portal'] ?? null) {
            'community_admin_dashboard' => 'web-admin',
            'resident_portal' => 'web-resident',
            default => 'mobile',
        };
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
            $existing = ContactIdentityService::findUserByEmail($email, withTrashed: true);

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
                ContactIdentityService::SIGNUP_EMAIL_EXISTS_MESSAGE,
                'ACCOUNT_EXISTS_USE_LOGIN',
            );
        }
    }

    private function assertEmailAvailableForSignup(?User $user): void
    {
        if ($user && ! $user->trashed()) {
            $this->failValidation(
                'email',
                ContactIdentityService::SIGNUP_EMAIL_EXISTS_MESSAGE,
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

    private function assertCanAccessResidentPortal(User $user): void
    {
        if (AdminRoleService::isSystemAdmin($user) || AdminRoleService::isCommunityAdminRole($user)) {
            $this->failValidation(
                'email',
                'This account uses the admin portal. Sign in there instead.',
                'USE_ADMIN_PORTAL',
            );
        }

        if (! in_array($user->role ?? '', ['resident', 'guest'], true)) {
            $this->failValidation(
                'email',
                'Account not found. Please verify your email address and try again.',
                'ACCOUNT_NOT_FOUND',
            );
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

        $this->failValidation(
            'email',
            'Account not found. Please verify your email address and try again.',
            'ACCOUNT_NOT_FOUND',
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
