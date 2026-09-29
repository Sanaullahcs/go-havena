<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Region;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\ActivityLogService;
use App\Services\CommunityLifecycleService;
use App\Services\UserActingContextService;
use App\Services\ContactIdentityService;
use App\Services\MembershipService;
use App\Services\PointsRewardService;
use App\Services\UserBlockService;
use App\Services\UtilityBillStorage;
use App\Support\MediaUrl;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    /** GET /v1/me */
    public function show(Request $request)
    {
        $user = $request->user();
        $block = app(CommunityLifecycleService::class)->authenticationBlock(
            $user,
            $this->resolveAuthPortal($request, $user),
            includeRejections: false,
        );

        if ($block) {
            return response()->json(
                app(CommunityLifecycleService::class)->enrichBlockResponse($block, $user),
                403,
            );
        }

        return response()->json([
            'data' => $this->buildUserPayload($user),
        ]);
    }

    /** PUT /v1/me/active-context */
    public function updateActiveContext(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'context' => ['nullable', 'in:resident,community_admin'],
            'active_mode' => ['nullable', 'in:resident,community_admin'],
            'community_id' => ['nullable', 'integer'],
        ]);

        $context = $validated['context'] ?? $validated['active_mode'] ?? null;
        if (! $context) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'context' => ['Provide context or active_mode.'],
            ]);
        }

        if (! UserActingContextService::canSwitchModes($request->user())) {
            return response()->json([
                'message' => 'Only a Community Admin can switch modes.',
                'code' => 'MODE_SWITCH_NOT_ALLOWED',
            ], 403);
        }

        $user = UserActingContextService::switch(
            $request->user(),
            $context,
            isset($validated['community_id']) ? (int) $validated['community_id'] : null,
        );

        return response()->json([
            'data' => $this->buildUserPayload($user),
            'message' => $context === UserActingContextService::CONTEXT_RESIDENT
                ? 'Switched to Resident Mode'
                : 'Switched to Admin Mode',
        ]);
    }

    /**
     * GET /v1/neighbors/{id}
     * Public community profile for another approved resident in the same community.
     */
    public function showNeighbor(int $id, Request $request): JsonResponse
    {
        $viewer = $request->user();
        $communityId = $this->resolveViewerCommunityId($request, $viewer);

        if ($communityId === null) {
            return response()->json(['message' => 'Join a community to view neighbor profiles.'], 403);
        }

        $member = DB::table('users')
            ->join('community_memberships as cm', 'cm.user_id', '=', 'users.id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->select(
                'users.id',
                'users.name',
                'users.role as account_role',
                'cm.role as membership_role',
                'cm.status as membership_status',
                'profiles.display_name',
                'profiles.avatar_url',
                'profiles.unit_number',
                'profiles.bio',
                'profiles.residence_type',
                'communities.name as community_name',
            )
            ->where('users.id', $id)
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->where('users.status', '!=', 'deleted')
            ->first();

        if (! $member) {
            return response()->json(['message' => 'Neighbor not found'], 404);
        }

        $displayName = $member->display_name ?: $member->name;

        return response()->json([
            'data' => [
                'id'             => (int) $member->id,
                'name'           => $displayName,
                'display_name'   => $displayName,
                'avatar_url'     => MediaUrl::toPublic($member->avatar_url ?? null, $request),
                'unit_number'    => $member->unit_number,
                'bio'            => $member->bio,
                'residence_type' => $member->residence_type,
                'role'           => $member->membership_role ?: $member->account_role ?: 'member',
                'account_role'   => $member->account_role,
                'community_name' => $member->community_name,
                'is_mine'        => (int) $member->id === (int) $viewer->id,
                'is_blocked'     => UserBlockService::viewerHasBlocked((int) $viewer->id, (int) $member->id),
                'can_block'      => UserBlockService::canBlock((int) $viewer->id, (int) $member->id, $communityId),
                'can_report'     => UserBlockService::canBlock((int) $viewer->id, (int) $member->id, $communityId),
            ],
        ]);
    }

    /** PUT /v1/me */
    public function update(Request $request)
    {
        $user = $request->user();
        $isCommunityAdmin = $user->role === 'community_admin';

        $request->validate([
            'name'           => 'sometimes|string|max:'.($isCommunityAdmin ? '50' : '100'),
            'phone'          => 'sometimes|nullable|string|max:20',
            'email'          => [
                'sometimes',
                'required',
                'string',
                'email',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (User::isPhonePlaceholderEmail(is_string($value) ? $value : null)) {
                        $fail('Enter a personal email address.');
                    }
                },
            ],
            'display_name'   => 'sometimes|string|max:50',
            'bio'            => 'sometimes|nullable|string|max:500',
            'unit_number'    => 'sometimes|nullable|string|max:'.($isCommunityAdmin ? '20' : '50'),
            'residence_type' => 'sometimes|nullable|string|in:homeowner,tenant',
            'office_address' => $isCommunityAdmin && $request->has('office_address')
                ? 'required|string|max:255'
                : 'sometimes|nullable|string|max:255',
            'region_id'      => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists(Region::class, 'id')->where(fn ($query) => $query->where('status', 'active')),
            ],
        ], $isCommunityAdmin ? [
            'name.max' => 'Full name cannot exceed 50 characters.',
            'display_name.max' => 'Full name cannot exceed 50 characters.',
            'unit_number.max' => 'Unit / apartment cannot exceed 20 characters.',
            'office_address.required' => 'Office address is required.',
            'office_address.max' => 'Office address cannot exceed 255 characters.',
        ] : []);

        $this->assertUtilityBillPresentIfRequired($user, $request);
        $this->assertOfficeAddressPresentIfRequired($user, $request, $isCommunityAdmin);

        $user->loadMissing('profile.region');
        $before = [
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'display_name' => $user->profile?->display_name,
            'bio' => $user->profile?->bio,
            'unit_number' => $user->profile?->unit_number,
            'residence_type' => $user->profile?->residence_type,
            'office_address' => $user->profile?->office_address,
            'region' => $user->profile?->region?->title ?? $user->profile?->region_id,
        ];

        if ($request->filled('name')) {
            $user->update(['name' => $request->name]);
        }
        if ($request->has('phone')) {
            $phone = PhoneNormalizer::accept($request->phone);
            if ($request->filled('phone') && ! $phone) {
                throw ValidationException::withMessages([
                    'phone' => ['Enter a valid phone number in international format.'],
                ]);
            }

            if ($phone) {
                ContactIdentityService::assertAvailableForRegistration(null, $phone, $user->id, 'phone');
            }

            $user->update(['phone' => $phone]);
        }
        if ($request->filled('email')) {
            $email = strtolower(trim((string) $request->email));
            $current = strtolower(trim((string) ($user->email ?? '')));

            // Established account emails are identifiers — not editable via profile update.
            if ($current !== '' && ! User::isPhonePlaceholderEmail($current) && $email !== $current) {
                throw ValidationException::withMessages([
                    'email' => ['Email address cannot be changed from your profile.'],
                ]);
            }

            if ($email !== $current) {
                ContactIdentityService::assertAvailableForRegistration($email, null, $user->id, 'email');
                $user->update(['email' => $email]);
            }
        }

        $profileData = array_filter([
            'display_name'   => $request->display_name,
            'bio'            => $request->bio,
        ], fn ($v) => $v !== null);

        if ($isCommunityAdmin) {
            if ($request->has('office_address')) {
                $profileData['office_address'] = trim((string) $request->input('office_address', ''));
            }
        } else {
            if ($request->has('unit_number')) {
                $incoming = trim((string) $request->input('unit_number', ''));
                $current = trim((string) ($user->profile?->unit_number ?? ''));

                // Assigned units are managed by community admins — residents cannot change them here.
                if ($current !== '' && strcasecmp($incoming, $current) !== 0) {
                    throw ValidationException::withMessages([
                        'unit_number' => ['Unit / apartment cannot be changed from your profile. Contact your community admin if you need an update.'],
                    ]);
                }

                if ($current === '' || strcasecmp($incoming, $current) === 0) {
                    $profileData['unit_number'] = $incoming !== '' ? $incoming : $current;
                }
            }
            if ($request->has('residence_type')) {
                $profileData['residence_type'] = $request->residence_type;
            }
        }

        if ($request->has('region_id')) {
            $profileData['region_id'] = $request->input('region_id');
        }

        if (! empty($profileData)) {
            $profile = $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                $profileData
            );
            $profile->refresh();
            // Same-second SQLite timestamps would still look like a provisioned stub.
            if (
                $profile->created_at
                && $profile->updated_at
                && $profile->updated_at->getTimestamp() <= $profile->created_at->getTimestamp() + 2
            ) {
                $profile->forceFill([
                    'updated_at' => $profile->created_at->copy()->addSeconds(5),
                ])->saveQuietly();
            }

            if ($request->filled('display_name') && ! $request->filled('name')) {
                $user->update(['name' => $request->display_name]);
            }

            $user->load('profile.region');
            MembershipService::approvePendingForActiveCommunities($user);
            if (! $isCommunityAdmin) {
                $this->syncUnitAssignments($user);
            }
            $this->maybeAwardProfileCompleted($user);
        }

        $user->load(['profile.region', 'memberships.community']);
        $after = [
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'display_name' => $user->profile?->display_name,
            'bio' => $user->profile?->bio,
            'unit_number' => $user->profile?->unit_number,
            'residence_type' => $user->profile?->residence_type,
            'office_address' => $user->profile?->office_address,
            'region' => $user->profile?->region?->title ?? $user->profile?->region_id,
        ];

        ActivityLogService::recordUpdate(
            'profile_updated',
            'User',
            (int) $user->id,
            $before,
            $after,
            [],
            $user->name,
            (int) $user->id,
            ['related_item' => $user->name],
        );

        return response()->json([
            'data' => $this->buildUserPayload($user),
        ]);
    }

    private function buildUserPayload(User $user): array
    {
        $user->load(['profile.region', 'memberships.community']);
        MembershipService::approvePendingForActiveCommunities($user);
        $user->load(['profile.region', 'memberships.community']);

        $payload = (new UserResource($user))->resolve();

        if (AdminRoleService::isCommunityAdminRole($user)) {
            $payload['access'] = app(\App\Services\CommunityAdminAccessService::class)
                ->accessPayload($user);
        }

        return $payload;
    }

    /** GET /v1/me/membership-review — explicit onboarding approval status for the mobile wait screen. */
    public function membershipReview(Request $request): JsonResponse
    {
        $user = $request->user()->load(['memberships.community']);

        $block = app(CommunityLifecycleService::class)->authenticationBlock(
            $user,
            $this->resolveAuthPortal($request, $user),
            includeRejections: false,
        );

        if ($block) {
            return response()->json(
                app(CommunityLifecycleService::class)->enrichBlockResponse($block, $user),
                403,
            );
        }

        return response()->json([
            'data' => $this->resolveMembershipReviewPayload($user),
        ]);
    }

    /** @return array<string, mixed> */
    private function resolveMembershipReviewPayload(User $user): array
    {
        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if (! $community) {
                continue;
            }

            if ($community->review_status === 'rejected') {
                return [
                    'status'           => 'rejected',
                    'kind'             => 'community_request',
                    'rejection_reason' => $community->rejection_reason,
                    'rejected_by'      => 'system_admin',
                    'community'        => $this->communitySnapshot($community),
                ];
            }

            if ($membership->status === 'rejected') {
                return [
                    'status'           => 'rejected',
                    'kind'             => 'membership_approval',
                    'rejection_reason' => $membership->rejection_reason,
                    'rejected_by'      => $membership->rejected_by ?? 'community_admin',
                    'community'        => $this->communitySnapshot($community),
                ];
            }
        }

        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if ($membership->status !== 'pending' || ! $community) {
                continue;
            }

            if ($community->review_status === 'pending') {
                return [
                    'status'    => 'pending',
                    'kind'      => 'community_request',
                    'community' => $this->communitySnapshot($community),
                ];
            }

            if (! in_array($community->review_status, ['pending', 'rejected'], true)) {
                return [
                    'status'    => 'pending',
                    'kind'      => 'membership_approval',
                    'community' => $this->communitySnapshot($community),
                ];
            }
        }

        foreach ($user->memberships as $membership) {
            $community = $membership->community;
            if ($membership->status !== 'approved' || ! $community) {
                continue;
            }

            if ($community->review_status !== 'pending') {
                return [
                    'status'    => 'approved',
                    'kind'      => 'membership_approval',
                    'community' => $this->communitySnapshot($community),
                ];
            }
        }

        return ['status' => 'unknown'];
    }

    /** @return array<string, mixed> */
    private function communitySnapshot(\App\Models\Community $community): array
    {
        return [
            'id'            => $community->id,
            'name'          => $community->name,
            'region'        => $community->region,
            'region_id'     => $community->region_id,
            'address'       => $community->address,
            'status'        => $community->status,
            'review_status' => $community->review_status,
        ];
    }

    /** Dashboard approval blocks apply to web-admin tokens only — mobile onboarding keeps /me access. */
    private function resolveAuthPortal(Request $request, User $user): ?string
    {
        if (! AdminRoleService::isCommunityAdminRole($user)) {
            return null;
        }

        $tokenName = $request->user()->currentAccessToken()?->name;

        return in_array($tokenName, ['web-admin', 'web_admin'], true)
            ? 'community_admin_dashboard'
            : null;
    }

    private function assertUtilityBillPresentIfRequired(User $user, Request $request): void
    {
        $isCompletingProfile = $request->filled('display_name')
            || $request->filled('unit_number')
            || $request->filled('office_address');
        if (! $isCompletingProfile) {
            return;
        }

        if (AdminRoleService::isGuest($user) || AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        $user->unsetRelation('profile');
        $user->load('profile');
        if (filled($user->profile?->utility_bill_url)) {
            return;
        }

        throw ValidationException::withMessages([
            'utility_bill' => ['Lease or utility bill is required.'],
        ]);
    }

    private function assertOfficeAddressPresentIfRequired(User $user, Request $request, bool $isCommunityAdmin): void
    {
        if (! $isCommunityAdmin) {
            return;
        }

        $isCompletingProfile = $request->filled('display_name') || $request->has('office_address');
        if (! $isCompletingProfile) {
            return;
        }

        $office = trim((string) ($request->input('office_address') ?? $user->profile?->office_address ?? ''));
        if ($office !== '') {
            return;
        }

        throw ValidationException::withMessages([
            'office_address' => ['Office address is required.'],
        ]);
    }

    private function maybeAwardProfileCompleted($user): void
    {
        $user->loadMissing(['profile', 'memberships']);
        $rewards = app(PointsRewardService::class);

        if ($rewards->isProfileComplete($user)) {
            $rewards->awardProfileCompleted($user);
        }
    }

    /** POST /v1/me/avatar — profile photo only */
    public function uploadAvatar(Request $request)
    {
        $request->validate(['avatar' => 'required|image|max:5120']);

        $path = $request->file('avatar')->store('avatars', 'public');
        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'avatar' => ['Could not save the photo. Storage is not writable.'],
            ]);
        }
        $relative = MediaUrl::normalize(Storage::url($path)) ?? '/storage/'.$path;

        $user = $request->user();
        $user->profile()->updateOrCreate(
            ['user_id' => $user->id],
            ['avatar_url' => $relative]
        );
        $user->load(['profile', 'memberships']);
        $this->maybeAwardProfileCompleted($user);

        return response()->json([
            'data' => ['avatar_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Profile photo updated',
        ]);
    }

    /** POST /v1/me/utility-bill — lease / utility bill for verification only */
    public function uploadUtilityBill(Request $request)
    {
        $request->validate(['utility_bill' => 'required|'.UtilityBillStorage::RULE]);

        $stored = app(UtilityBillStorage::class)->store($request->file('utility_bill'));

        $request->user()->profile()->updateOrCreate(
            ['user_id' => $request->user()->id],
            ['utility_bill_url' => $stored]
        );

        return response()->json([
            'data' => ['utility_bill_url' => MediaUrl::toPublic($stored, $request)],
            'message' => 'Utility bill uploaded for verification',
        ]);
    }

    /** PUT /v1/me/password */
    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password'  => 'required|string',
            'new_password'      => 'required|string|min:8|confirmed',
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['Current password is incorrect.']]);
        }

        $user->update(['password' => Hash::make($request->new_password)]);

        return response()->json(['message' => 'Password changed successfully']);
    }

    /** DELETE /v1/me — App Store / Play require in-app account deletion. */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $userId = (int) $user->id;

        DB::transaction(function () use ($user) {
            $stamp = now()->format('ymdHis');
            $user->forceFill([
                'status' => 'deleted',
                'name' => 'Deleted User',
                'email' => "deleted-{$user->id}-{$stamp}@deleted.havena.local",
                'phone' => substr('+1999'.$user->id.$stamp, 0, 20),
                'phone_verified_at' => null,
                'google_id' => null,
                'apple_id' => null,
            ])->save();

            $user->tokens()->delete();
            $user->delete();
        });

        ActivityLogService::user('account_deleted', 'User deleted their own account', 'User', $userId, 'warning');

        return response()->json(['message' => 'Account deleted']);
    }

    private function syncUnitAssignments(User $user): void
    {
        $user->loadMissing(['profile', 'memberships']);
        foreach ($user->memberships as $membership) {
            if (($membership->status ?? '') !== 'approved') {
                continue;
            }
            try {
                app(\App\Services\UnitAssignmentService::class)->syncUserToCommunity($user, (int) $membership->community_id);
            } catch (\Throwable) {
                // Profile save should not fail if unit assignment cannot complete.
            }
        }
    }

    private function storeProfileImage(UploadedFile $file, string $folder): string
    {
        $path = $file->store($folder, 'public');
        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'file' => ['Could not save the file. Storage is not writable.'],
            ]);
        }

        return url(Storage::url($path));
    }


    private function resolveViewerCommunityId(Request $request, User $user): ?int
    {
        $approvedIds = $user->memberships()
            ->where('status', 'approved')
            ->pluck('community_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($approvedIds === []) {
            return null;
        }

        if ($request->filled('community_id')) {
            $id = (int) $request->community_id;
            if (in_array($id, $approvedIds, true)) {
                return $id;
            }
        }

        $header = $request->header('X-Community-Id');
        if ($header) {
            $id = (int) $header;
            if (in_array($id, $approvedIds, true)) {
                return $id;
            }
        }

        $fallback = $user->memberships()
            ->where('status', 'approved')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->value('community_id');

        return $fallback !== null ? (int) $fallback : null;
    }
}
