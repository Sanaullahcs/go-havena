<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\GuestInvitation;
use App\Models\User;
use App\Services\GuestAccessService;
use App\Services\GuestActivityService;
use App\Services\GuestInvitationService;
use App\Services\OtpService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class GuestAuthController extends Controller
{
    /** POST /v1/auth/guest/otp/request */
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
        ]);

        $phone = PhoneNormalizer::normalize($validated['phone']);
        if (! $phone) {
            return response()->json(['message' => 'Enter a valid phone number.', 'code' => 'INVALID_PHONE'], 422);
        }

        $user = PhoneNormalizer::findUserByPhone($validated['phone']);
        $validInvitation = GuestAccessService::findLoginInvitationForPhone($validated['phone']);
        $latestInvitation = GuestAccessService::findLatestInvitationForPhone($validated['phone']);

        if ($block = GuestAccessService::resolveGuestLoginBlock($validInvitation, $latestInvitation)) {
            return response()->json($block, 422);
        }

        if ($user && ($block = GuestAccessService::resolveGuestLoginBlockForUser($user))) {
            return response()->json($block, 422);
        }

        if (! $user && ! $validInvitation) {
            return response()->json([
                'message' => 'No guest invitation found for this phone number.',
                'code'    => 'NO_GUEST_INVITATION',
            ], 422);
        }

        if ($user && ! in_array($user->role, ['guest', 'resident'], true) && $user->role !== null) {
            if ($user->role !== 'guest' && ! $validInvitation) {
                return response()->json([
                    'message' => 'This phone number is not registered for guest access.',
                    'code'    => 'NOT_GUEST_ACCOUNT',
                ], 422);
            }
        }

        if ($user && $user->role === 'resident') {
            return response()->json([
                'message' => 'This phone number is registered as a resident. Use resident login instead.',
                'code'    => 'USE_RESIDENT_LOGIN',
            ], 422);
        }

        $key = 'guest-otp-request:'.($request->ip() ?? 'unknown');
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Too many OTP requests.', 'code' => 'RATE_LIMITED'], 429);
        }
        RateLimiter::hit($key, 60);

        $otp->send($phone);

        return response()->json(['data' => ['message' => 'OTP dispatched', 'phone' => $phone]], 202);
    }

    /** POST /v1/auth/guest/otp/verify */
    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
            'code'  => ['required', 'string', 'size:6'],
        ]);

        $phone = PhoneNormalizer::normalize($validated['phone']);
        if (! $phone || ! $otp->check($phone, $validated['code'])) {
            return response()->json(['message' => 'Invalid or expired verification code.', 'code' => 'INVALID_OTP'], 422);
        }

        $user = PhoneNormalizer::findUserByPhone($validated['phone']);
        $validInvitation = GuestAccessService::findLoginInvitationForPhone($validated['phone']);
        $latestInvitation = GuestAccessService::findLatestInvitationForPhone($validated['phone']);

        if ($block = GuestAccessService::resolveGuestLoginBlock($validInvitation, $latestInvitation)) {
            return response()->json($block, 422);
        }

        if ($user && ($block = GuestAccessService::resolveGuestLoginBlockForUser($user))) {
            return response()->json($block, 422);
        }

        if ($user && $user->role === 'guest') {
            if (GuestAccessService::canGuestAccessDashboard($user)) {
                $otp->consume($phone);
                $token = $user->createToken('mobile')->plainTextToken;
                $user->update(['phone_verified_at' => now()]);
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

                return $this->respondForPendingGuestInvitation($otp, $phone, $pending, $user);
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
            $guestUser = User::query()->find($invitation->guest_user_id);
            if ($guestUser && GuestAccessService::canGuestAccessDashboard($guestUser)) {
                $otp->consume($phone);
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

            return $this->respondForPendingGuestInvitation($otp, $phone, $invitation, $guestUser);
        }

        $otp->extend($phone);

        return response()->json([
            'needs_invite_code' => true,
            'phone_verified'    => true,
            'invitation_status' => $invitation->status,
        ]);
    }

    /** POST /v1/auth/guest/verify-invite */
    public function verifyInvite(Request $request, OtpService $otp): JsonResponse
    {
        $validated = $request->validate([
            'phone'       => ['required', 'string', 'max:30'],
            'code'        => ['required', 'string', 'size:6'],
            'invite_code' => ['required', 'string', 'max:32'],
        ]);

        $phone = PhoneNormalizer::normalize($validated['phone']);
        if (! $phone) {
            return response()->json(['message' => 'Enter a valid phone number.', 'code' => 'INVALID_PHONE'], 422);
        }

        $otp->extend($phone);

        if (! $otp->check($phone, $validated['code'])) {
            return response()->json(['message' => 'Invalid or expired verification code.', 'code' => 'INVALID_OTP'], 422);
        }

        try {
            $invitation = GuestInvitationService::verifyInviteForPhone($validated['phone'], $validated['invite_code']);

            if ($block = GuestAccessService::loginTerminationBlock($invitation)) {
                return response()->json($block, 422);
            }

            if ($block = GuestAccessService::loginScheduleBlock($invitation)) {
                return response()->json($block, 422);
            }

            $guestUser = GuestInvitationService::findOrCreateGuestUser($invitation);

            if ($invitation->status === 'active' && GuestAccessService::canGuestAccessDashboard($guestUser)) {
                $otp->consume($phone);
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

            $otp->consume($phone);
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
        string $phone,
        GuestInvitation $invitation,
        ?User $guestUser,
    ): JsonResponse {
        $otp->extend($phone);

        if ($block = GuestAccessService::loginTerminationBlock($invitation)) {
            return response()->json($block, 422);
        }

        if ($block = GuestAccessService::loginScheduleBlock($invitation)) {
            return response()->json($block, 422);
        }

        if ($invitation->status === 'pending_verification' || ! $guestUser) {
            return response()->json([
                'needs_invite_code' => true,
                'phone_verified'    => true,
                'invitation_status' => $invitation->status,
            ]);
        }

        $otp->consume($phone);
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
