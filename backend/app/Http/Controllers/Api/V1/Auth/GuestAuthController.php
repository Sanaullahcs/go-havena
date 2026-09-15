<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\GuestInvitation;
use App\Models\User;
use App\Services\ContactIdentityService;
use App\Services\GuestAccessService;
use App\Services\GuestActivityService;
use App\Services\GuestInvitationService;
use App\Services\OtpRateLimitService;
use App\Services\OtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GuestAuthController extends Controller
{
    /** POST /v1/auth/guest/otp/request */
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            return response()->json(['message' => 'Enter a valid email address.', 'code' => 'INVALID_EMAIL'], 422);
        }

        $user = ContactIdentityService::findActiveUserByEmail($email);
        $validInvitation = GuestAccessService::findLoginInvitationForEmail($email);
        $latestInvitation = GuestAccessService::findLatestInvitationForEmail($email);

        if ($block = GuestAccessService::resolveGuestLoginBlock($validInvitation, $latestInvitation)) {
            return response()->json($block, 422);
        }

        if ($user && ($block = GuestAccessService::resolveGuestLoginBlockForUser($user))) {
            return response()->json($block, 422);
        }

        if (! $user && ! $validInvitation) {
            return response()->json([
                'message' => 'No guest invitation found for this email address.',
                'code'    => 'NO_GUEST_INVITATION',
            ], 422);
        }

        if ($user && ! in_array($user->role, ['guest', 'resident'], true) && $user->role !== null) {
            if ($user->role !== 'guest' && ! $validInvitation) {
                return response()->json([
                    'message' => 'This email is not registered for guest access.',
                    'code'    => 'NOT_GUEST_ACCOUNT',
                ], 422);
            }
        }

        if ($user && $user->role === 'resident') {
            return response()->json([
                'message' => 'This email is registered as a resident. Use resident login instead.',
                'code'    => 'USE_RESIDENT_LOGIN',
            ], 422);
        }

        $rateLimit = app(OtpRateLimitService::class);
        $rateLimit->assertCanRequest($email);
        $otp->send($email);
        $limits = $rateLimit->recordRequest($email);

        return response()->json([
            'data' => [
                'message' => 'OTP dispatched',
                'email' => $email,
                'rate_limit' => $limits,
            ],
        ], 202);
    }

    /** POST /v1/auth/guest/otp/verify */
    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:191'],
            'code'  => ['required', 'string', 'size:6'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        $rateLimit = app(OtpRateLimitService::class);
        $rateLimit->assertCanVerify($email);

        if (! $email || ! $otp->check($email, $validated['code'])) {
            try {
                $rateLimit->recordFailedVerify($email ?? '');
            } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
                throw $e;
            }

            return response()->json(['message' => 'Invalid or expired verification code.', 'code' => 'INVALID_OTP'], 422);
        }

        $rateLimit->clear($email);

        $user = ContactIdentityService::findActiveUserByEmail($email);
        $validInvitation = GuestAccessService::findLoginInvitationForEmail($email);
        $latestInvitation = GuestAccessService::findLatestInvitationForEmail($email);

        if ($block = GuestAccessService::resolveGuestLoginBlock($validInvitation, $latestInvitation)) {
            return response()->json($block, 422);
        }

        if ($user && ($block = GuestAccessService::resolveGuestLoginBlockForUser($user))) {
            return response()->json($block, 422);
        }

        if ($user && $user->role === 'guest') {
            if (! GuestAccessService::canGuestAccessDashboard($user) && $validInvitation) {
                $restoredGuest = GuestAccessService::restoreReturningGuestIfEligible($validInvitation);
                if ($restoredGuest) {
                    $user = $restoredGuest;
                }
            }

            if (GuestAccessService::canGuestAccessDashboard($user)) {
                $otp->consume($email);
                $token = $user->createToken('mobile')->plainTextToken;
                $user->update(['email_verified_at' => now()]);
                GuestActivityService::logForUser($user, 'login', 'Guest logged in');

                return response()->json([
                    'token'             => $token,
                    'user'              => new UserResource($user->load(['profile', 'memberships.community'])),
                    'needs_invite_code' => false,
                    'invitation_status' => 'active',
                ]);
            }

            $pending = GuestInvitation::query()
                ->where('guest_user_id', $user->id)
                ->whereIn('status', ['pending_verification', 'pending_approval'])
                ->orderByDesc('id')
                ->first();

            if ($pending) {
                if ($block = GuestAccessService::loginScheduleBlock($pending)) {
                    return response()->json($block, 422);
                }

                return $this->respondForPendingGuestInvitation($otp, $email, $pending, $user);
            }
        }

        $invitation = $validInvitation;

        if (! $invitation) {
            return response()->json([
                'message' => GuestAccessService::MSG_ACCESS_REVOKED,
                'code'    => 'GUEST_ACCESS_REVOKED',
            ], 422);
        }

        if ($block = GuestAccessService::loginScheduleBlock($invitation)) {
            return response()->json($block, 422);
        }

        if ($invitation->status === 'active' && $invitation->guest_user_id) {
            $guestUser = GuestAccessService::restoreReturningGuestIfEligible($invitation)
                ?? User::query()->find($invitation->guest_user_id);

            if ($guestUser && GuestAccessService::canGuestAccessDashboard($guestUser)) {
                $otp->consume($email);
                $token = $guestUser->createToken('mobile')->plainTextToken;
                GuestActivityService::log($invitation, 'login', 'Guest logged in');

                return response()->json([
                    'token'             => $token,
                    'user'              => new UserResource($guestUser->load(['profile', 'memberships.community'])),
                    'needs_invite_code' => false,
                    'invitation_status' => 'active',
                ]);
            }
        }

        if ($invitation->status === 'pending_approval') {
            $guestUser = $invitation->guest_user_id
                ? User::query()->find($invitation->guest_user_id)
                : null;

            return $this->respondForPendingGuestInvitation($otp, $email, $invitation, $guestUser);
        }

        $otp->extend($email);

        return response()->json([
            'needs_invite_code' => true,
            'email_verified'    => true,
            'invitation_status' => $invitation->status,
        ]);
    }

    /** POST /v1/auth/guest/verify-invite */
    public function verifyInvite(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'email'       => ['required', 'email', 'max:191'],
            'code'        => ['required', 'string', 'size:6'],
            'invite_code' => ['required', 'string', 'max:32'],
        ]);

        $email = ContactIdentityService::normalizeEmail($validated['email']);
        if (! $email) {
            return response()->json(['message' => 'Enter a valid email address.', 'code' => 'INVALID_EMAIL'], 422);
        }

        $otp->extend($email);

        if (! $otp->check($email, $validated['code'])) {
            return response()->json(['message' => 'Invalid or expired verification code.', 'code' => 'INVALID_OTP'], 422);
        }

        try {
            $invitation = GuestInvitationService::verifyInviteForEmail($email, $validated['invite_code']);

            if ($block = GuestAccessService::loginTerminationBlock($invitation)) {
                return response()->json($block, 422);
            }

            if ($block = GuestAccessService::loginScheduleBlock($invitation)) {
                return response()->json($block, 422);
            }

            $guestUser = GuestInvitationService::findOrCreateGuestUser($invitation);

            if ($invitation->status === 'active') {
                $guestUser = GuestAccessService::restoreReturningGuestIfEligible($invitation) ?? $guestUser;
            }

            if ($invitation->status === 'active' && GuestAccessService::canGuestAccessDashboard($guestUser)) {
                $otp->consume($email);
                $token = $guestUser->createToken('mobile')->plainTextToken;
                GuestActivityService::log($invitation, 'login', 'Guest logged in');

                return response()->json([
                    'token'             => $token,
                    'user'              => new UserResource($guestUser->load(['profile', 'memberships.community'])),
                    'needs_invite_code' => false,
                    'invitation_status' => 'active',
                ]);
            }

            if ($invitation->status === 'pending_verification') {
                $invitation = GuestInvitationService::activateAfterVerification($invitation, $guestUser);
            }

            if ($invitation->status !== 'pending_approval') {
                return response()->json([
                    'message' => GuestAccessService::MSG_ACCESS_REVOKED,
                    'code'    => 'GUEST_ACCESS_REVOKED',
                ], 422);
            }

            $otp->consume($email);
            $token = $guestUser->createToken('mobile')->plainTextToken;

            return response()->json([
                'message'           => 'Verification complete. Waiting for host approval.',
                'code'              => 'PENDING_APPROVAL',
                'needs_invite_code' => false,
                'invitation_status' => 'pending_approval',
                'token'             => $token,
                'user'              => new UserResource($guestUser->load(['profile', 'memberships.community'])),
            ]);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return $this->inviteVerificationErrorResponse($e);
        } catch (\Throwable $e) {
            $message = $e->getMessage();
            $status = method_exists($e, 'getStatusCode') ? (int) $e->getStatusCode() : 422;

            return response()->json([
                'message' => $message !== '' ? $message : 'Could not verify this invitation.',
                'code'    => 'INVALID_INVITE',
            ], $status >= 400 ? $status : 422);
        }
    }

    private function respondForPendingGuestInvitation(
        OtpService $otp,
        string $email,
        GuestInvitation $invitation,
        ?User $guestUser,
    ): JsonResponse {
        $otp->extend($email);

        if ($block = GuestAccessService::loginTerminationBlock($invitation)) {
            return response()->json($block, 422);
        }

        if ($block = GuestAccessService::loginScheduleBlock($invitation)) {
            return response()->json($block, 422);
        }

        if ($invitation->status === 'pending_verification' || ! $guestUser) {
            return response()->json([
                'needs_invite_code' => true,
                'email_verified'    => true,
                'invitation_status' => $invitation->status,
            ]);
        }

        $otp->consume($email);
        $token = $guestUser->createToken('mobile')->plainTextToken;

        return response()->json([
            'token'             => $token,
            'user'              => new UserResource($guestUser->load(['profile', 'memberships.community'])),
            'needs_invite_code' => false,
            'invitation_status' => 'pending_approval',
        ]);
    }

    private function inviteVerificationErrorResponse(\Symfony\Component\HttpKernel\Exception\HttpException $e): JsonResponse
    {
        $message = $e->getMessage();
        $code = 'INVALID_INVITE';

        if ($message === GuestAccessService::MSG_ACCESS_REVOKED) {
            $code = 'GUEST_ACCESS_REVOKED';
        } elseif ($message === GuestAccessService::MSG_ACCESS_EXPIRED) {
            $code = 'GUEST_ACCESS_EXPIRED';
        }

        return response()->json([
            'message' => $message !== '' ? $message : 'Could not verify this invitation.',
            'code'    => $code,
        ], $e->getStatusCode());
    }
}
