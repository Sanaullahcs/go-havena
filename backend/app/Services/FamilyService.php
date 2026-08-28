<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\Family;
use App\Models\FamilyAddMemberRequest;
use App\Models\FamilyJoinRequest;
use App\Models\FamilyMember;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FamilyService
{
    public static function generateFamilyNumber(): string
    {
        do {
            $code = 'FAM-'.strtoupper(Str::random(6));
        } while (Family::query()->where('family_number', $code)->exists());

        return $code;
    }

    public static function validateFamilyNumberFormat(string $input): string
    {
        $normalized = self::normalizeFamilyNumber($input);

        if (! preg_match('/^FAM-[A-Z0-9]{4,8}$/', $normalized)) {
            throw ValidationException::withMessages([
                'family_number' => ['Use format FAM-XXXXXX with 4–8 letters or numbers after FAM-.'],
            ]);
        }

        return $normalized;
    }

    public static function isFamilyNumberAvailable(string $input, ?int $excludeFamilyId = null): bool
    {
        try {
            $normalized = self::validateFamilyNumberFormat($input);
        } catch (ValidationException) {
            return false;
        }

        $query = Family::query()->where('family_number', $normalized);

        if ($excludeFamilyId) {
            $query->where('id', '!=', $excludeFamilyId);
        }

        return ! $query->exists();
    }

    public static function normalizeFamilyNumber(string $input): string
    {
        $trimmed = strtoupper(trim($input));
        $compact = preg_replace('/[\s\-]+/', '', $trimmed) ?? $trimmed;

        if (preg_match('/^FAM([A-Z0-9]{6})$/', $compact, $matches)) {
            return 'FAM-'.$matches[1];
        }

        return $trimmed;
    }

    public static function resolveCommunityId(User $user): ?int
    {
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        return $membership ? (int) $membership->community_id : null;
    }

    public static function activeMembership(User $user, ?int $communityId = null): ?FamilyMember
    {
        $query = FamilyMember::query()
            ->with(['family.community', 'user.profile'])
            ->where('user_id', $user->id)
            ->where('status', 'active');

        if ($communityId) {
            $query->whereHas('family', fn ($q) => $q
                ->where('community_id', $communityId)
                ->where('status', 'active'));
        }

        return $query->first();
    }

    public static function assertNotInFamily(User $user, int $communityId): void
    {
        if (self::activeMembership($user, $communityId)) {
            abort(422, 'You are already part of a family in this community.');
        }
    }

    public static function assertNoPendingJoin(User $user, int $familyId, ?int $communityId = null): void
    {
        $sameFamily = FamilyJoinRequest::query()
            ->where('family_id', $familyId)
            ->where('requester_user_id', $user->id)
            ->where('status', 'pending')
            ->exists();

        if ($sameFamily) {
            abort(422, 'You already have a pending request for this family.');
        }

        if ($communityId) {
            $anyPending = FamilyJoinRequest::query()
                ->where('requester_user_id', $user->id)
                ->where('status', 'pending')
                ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
                ->exists();

            if ($anyPending) {
                abort(422, 'You already have a pending family join request.');
            }
        }
    }

    public static function assertApprovedCommunityMember(User $user, int $communityId): void
    {
        $approved = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();

        if (! $approved) {
            abort(403, 'Approved community membership is required.');
        }

        if (($user->role ?? '') === 'guest') {
            abort(403, 'Guests cannot join families.');
        }
    }

    public static function resolveCommunityIdForProvision(User $user): ?int
    {
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->whereIn('status', ['approved', 'pending'])
            ->orderByRaw("CASE WHEN status = 'approved' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')
            ->first();

        return $membership ? (int) $membership->community_id : null;
    }

    public static function createFamily(int $communityId, User $head, ?string $name = null): Family
    {
        self::assertApprovedCommunityMember($head, $communityId);
        self::assertNotInFamily($head, $communityId);

        return DB::transaction(function () use ($communityId, $head, $name) {
            $family = Family::query()->create([
                'community_id'  => $communityId,
                'head_user_id'  => $head->id,
                'family_number' => self::generateFamilyNumber(),
                'name'          => $name ? trim($name) : null,
                'status'        => 'active',
            ]);

            FamilyMember::query()->create([
                'family_id'         => $family->id,
                'user_id'           => $head->id,
                'role'              => 'head',
                'status'            => 'active',
                'added_by_user_id'  => $head->id,
                'joined_at'         => now(),
            ]);

            ActivityLogService::user(
                'family_created',
                "Created family {$family->family_number}",
                'Family',
                $family->id,
                'info',
                $head->id,
            );

            return $family->load(['community', 'head.profile', 'members.user.profile']);
        });
    }

    private static function assertCommunityMemberForProvision(User $user, int $communityId): void
    {
        $member = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();

        if (! $member) {
            abort(403, 'Community membership is required.');
        }

        if (($user->role ?? '') === 'guest') {
            abort(403, 'Guests cannot join families.');
        }
    }

    private static function provisionFamily(int $communityId, User $head, ?string $name = null, ?string $familyNumber = null): Family
    {
        self::assertCommunityMemberForProvision($head, $communityId);
        self::assertNotInFamily($head, $communityId);

        return DB::transaction(function () use ($communityId, $head, $name, $familyNumber) {
            $code = $familyNumber ?? self::generateFamilyNumber();

            if (Family::query()->where('family_number', $code)->exists()) {
                throw ValidationException::withMessages([
                    'family_number' => ['This Family Number already exists.'],
                ]);
            }

            $family = Family::query()->create([
                'community_id'  => $communityId,
                'head_user_id'  => $head->id,
                'family_number' => $code,
                'name'          => $name ? trim($name) : null,
                'status'        => 'active',
            ]);

            FamilyMember::query()->create([
                'family_id'         => $family->id,
                'user_id'           => $head->id,
                'role'              => 'head',
                'status'            => 'active',
                'added_by_user_id'  => $head->id,
                'joined_at'         => now(),
            ]);

            ActivityLogService::user(
                'family_created',
                "Created family {$family->family_number}",
                'Family',
                $family->id,
                'info',
                $head->id,
            );

            return $family->load(['community', 'head.profile', 'members.user.profile']);
        });
    }

    /**
     * Create a default family with an auto-generated number when a resident completes onboarding.
     * Idempotent — skips if the user already belongs to a family or has a pending join request.
     */
    public static function ensureDefaultFamilyForUser(User $user, ?string $requestedFamilyNumber = null): ?Family
    {
        $user->loadMissing(['profile', 'memberships']);

        if (($user->role ?? '') === 'guest') {
            return null;
        }

        if (AdminRoleService::isCommunityAdminRole($user)) {
            return null;
        }

        if (! MembershipService::hasCompleteProfile($user)) {
            return null;
        }

        $communityId = self::resolveCommunityIdForProvision($user);
        if (! $communityId) {
            return null;
        }

        $existing = self::activeMembership($user, $communityId);
        if ($existing) {
            return $existing->family;
        }

        $hasSuspendedFamily = FamilyMember::query()
            ->where('user_id', $user->id)
            ->where('status', 'suspended')
            ->whereHas('family', fn ($q) => $q
                ->where('community_id', $communityId)
                ->where('status', 'active'))
            ->exists();

        if ($hasSuspendedFamily) {
            return null;
        }

        $pendingJoin = FamilyJoinRequest::query()
            ->where('requester_user_id', $user->id)
            ->whereIn('status', [
                FamilyJoinRequest::STATUS_PENDING,
                FamilyJoinRequest::STATUS_AWAITING_ADMIN,
            ])
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->exists();

        if ($pendingJoin) {
            return null;
        }

        if (\App\Models\FamilyBlock::query()
            ->where('user_id', $user->id)
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->exists()) {
            return null;
        }

        $familyNumber = null;
        if ($requestedFamilyNumber !== null && trim($requestedFamilyNumber) !== '') {
            $familyNumber = self::validateFamilyNumberFormat($requestedFamilyNumber);
            if (! self::isFamilyNumberAvailable($familyNumber)) {
                throw ValidationException::withMessages([
                    'family_number' => ['This Family Number already exists.'],
                ]);
            }
        }

        try {
            return self::provisionFamily($communityId, $user, null, $familyNumber);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException) {
            return self::activeMembership($user, $communityId)?->family;
        }
    }

    public static function formatFamilyBrief(Family $family): array
    {
        return [
            'id'            => $family->id,
            'family_number' => $family->family_number,
            'is_head'       => true,
        ];
    }

    public static function requestJoinByNumber(string $familyNumberInput, User $requester, ?string $message = null): FamilyJoinRequest
    {
        // Allow pending community membership so onboarding can create a join request.
        $communityId = self::resolveCommunityIdForProvision($requester)
            ?? self::resolveCommunityId($requester);

        if (! $communityId) {
            abort(422, 'Join a community before requesting to join a family.');
        }

        self::assertCommunityMemberForProvision($requester, $communityId);
        self::assertNotInFamily($requester, $communityId);

        $familyNumber = self::normalizeFamilyNumber($familyNumberInput);
        $family = Family::query()
            ->where('family_number', $familyNumber)
            ->where('status', 'active')
            ->first();

        if (! $family) {
            throw ValidationException::withMessages([
                'family_number' => ['Family Number not found.'],
            ]);
        }

        if ((int) $family->community_id !== $communityId) {
            abort(422, 'This family belongs to another community.');
        }

        if (\App\Models\FamilyBlock::query()
            ->where('family_id', $family->id)
            ->where('user_id', $requester->id)
            ->exists()) {
            abort(422, 'You cannot join this family.');
        }

        self::assertNoPendingJoin($requester, $family->id, $communityId);

        $request = FamilyJoinRequest::query()->create([
            'family_id'          => $family->id,
            'requester_user_id'  => $requester->id,
            'status'             => 'pending',
            'message'            => $message ? trim($message) : null,
        ]);

        $request->load(['requester.profile', 'family.community']);

        NotificationService::send(
            (int) $family->head_user_id,
            'info',
            'New family join request',
            "{$requester->name} requested to join your family.",
            '/screens/my-family/requests',
            ['family_id' => $family->id, 'family_join_request_id' => $request->id, 'kind' => 'family_join_request'],
        );

        ActivityLogService::user(
            'family_join_requested',
            "Requested to join family {$family->family_number}",
            'FamilyJoinRequest',
            $request->id,
            'info',
            $requester->id,
        );

        return $request;
    }

    /**
     * Family head approves a join request.
     *
     * - If the requester is already an approved community resident (add-member /
     *   My Family join path): add them as an active family member immediately.
     * - If they are still pending community membership (Complete Profile join):
     *   mark the join as awaiting_admin and queue the existing community admin
     *   membership review — do not create family membership yet.
     *
     * @return array{outcome: string, member?: FamilyMember, join_request?: FamilyJoinRequest}
     */
    public static function approveJoinRequest(FamilyJoinRequest $request, User $reviewer): array
    {
        self::assertFamilyHead($request->family, $reviewer);

        if ($request->status !== FamilyJoinRequest::STATUS_PENDING) {
            abort(422, 'This request is no longer pending.');
        }

        $requester = $request->requester;
        $communityId = (int) $request->family->community_id;
        self::assertNotInFamily($requester, $communityId);

        $hasApprovedCommunity = DB::table('community_memberships')
            ->where('user_id', $requester->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();

        if ($hasApprovedCommunity) {
            return DB::transaction(function () use ($request, $reviewer, $requester) {
                $request->update([
                    'status'              => FamilyJoinRequest::STATUS_APPROVED,
                    'reviewed_by_user_id' => $reviewer->id,
                    'reviewed_at'         => now(),
                ]);

                $member = FamilyMember::query()->create([
                    'family_id'        => $request->family_id,
                    'user_id'          => $requester->id,
                    'role'             => 'member',
                    'status'           => 'active',
                    'added_by_user_id' => $reviewer->id,
                    'joined_at'        => now(),
                ]);

                FamilyAddMemberRequest::query()
                    ->where('family_join_request_id', $request->id)
                    ->where('status', FamilyAddMemberRequest::STATUS_AWAITING_HEAD)
                    ->update([
                        'status'              => FamilyAddMemberRequest::STATUS_APPROVED,
                        'reviewed_by_user_id' => $reviewer->id,
                        'reviewed_at'         => now(),
                    ]);

                NotificationService::send(
                    (int) $requester->id,
                    'success',
                    'Family request approved',
                    'Your request to join the family was approved.',
                    '/screens/my-family',
                    ['family_id' => $request->family_id, 'kind' => 'family_join_approved'],
                );

                return [
                    'outcome' => 'family_member',
                    'member'  => $member->load(['user.profile', 'family']),
                ];
            });
        }

        // Complete Profile / head-first path: head approve → community admin queue.
        return DB::transaction(function () use ($request, $reviewer, $requester, $communityId) {
            $request->update([
                'status'              => FamilyJoinRequest::STATUS_AWAITING_ADMIN,
                'reviewed_by_user_id' => $reviewer->id,
                'reviewed_at'         => now(),
            ]);

            self::ensurePendingCommunityMembershipForAddMember($requester, $communityId);
            self::notifyCommunityAdminsOfOnboardingJoin($request->fresh(['family.community', 'requester.profile']));

            NotificationService::send(
                (int) $requester->id,
                'info',
                'Family head approved',
                'Your family head approved your request. Your community admin will review your membership next.',
                '/screens/pending-community',
                [
                    'family_id' => $request->family_id,
                    'kind'      => 'family_join_awaiting_admin',
                ],
            );

            ActivityLogService::user(
                'family_join_head_approved',
                "Family head approved join for {$requester->name}; awaiting community admin",
                'FamilyJoinRequest',
                $request->id,
                'info',
                $reviewer->id,
            );

            return [
                'outcome'      => 'awaiting_admin',
                'join_request' => $request->fresh(['requester.profile', 'family.community']),
            ];
        });
    }

    /**
     * After community admin approves membership, activate any head-approved
     * onboarding family join requests (Complete Profile → Join Existing Family).
     */
    public static function activateOnboardingJoinAfterCommunityApproval(
        User $candidate,
        int $communityId,
        ?User $admin = null,
    ): void {
        $requests = FamilyJoinRequest::query()
            ->with(['family.community', 'requester.profile'])
            ->where('requester_user_id', $candidate->id)
            ->where('status', FamilyJoinRequest::STATUS_AWAITING_ADMIN)
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->get();

        foreach ($requests as $request) {
            if (self::activeMembership($candidate, $communityId)) {
                $request->update([
                    'status' => FamilyJoinRequest::STATUS_APPROVED,
                ]);

                continue;
            }

            FamilyMember::query()->create([
                'family_id'        => $request->family_id,
                'user_id'          => $candidate->id,
                'role'             => 'member',
                'status'           => 'active',
                'added_by_user_id' => $request->reviewed_by_user_id ?? $admin?->id,
                'joined_at'        => now(),
            ]);

            $request->update([
                'status' => FamilyJoinRequest::STATUS_APPROVED,
            ]);

            NotificationService::send(
                (int) $candidate->id,
                'success',
                'Welcome to your family',
                'Your community membership and family join are both approved.',
                '/screens/my-family',
                [
                    'family_id' => $request->family_id,
                    'kind'      => 'family_join_fully_approved',
                ],
            );

            ActivityLogService::user(
                'family_join_activated',
                "Activated family membership for {$candidate->name} after community admin approval",
                'FamilyJoinRequest',
                $request->id,
                'info',
                $admin?->id,
            );
        }
    }

    /**
     * Community admin rejected the resident while a head-approved join was waiting.
     */
    public static function rejectOnboardingJoinAfterCommunityRejection(
        User $candidate,
        int $communityId,
        ?User $admin = null,
        ?string $reason = null,
    ): void {
        $requests = FamilyJoinRequest::query()
            ->where('requester_user_id', $candidate->id)
            ->where('status', FamilyJoinRequest::STATUS_AWAITING_ADMIN)
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->get();

        $trimmedReason = $reason ? trim($reason) : null;

        foreach ($requests as $request) {
            $request->update([
                'status'           => FamilyJoinRequest::STATUS_REJECTED,
                'rejection_reason' => $trimmedReason,
            ]);

            NotificationService::send(
                (int) $candidate->id,
                'warning',
                'Membership request declined',
                $trimmedReason
                    ? "Your community membership was not approved. Reason: {$trimmedReason}"
                    : 'Your community membership was not approved.',
                '/screens/pending-community',
                [
                    'family_id' => $request->family_id,
                    'kind'      => 'family_join_admin_rejected',
                ],
            );
        }
    }

    /** True when the resident has a join request still waiting on the family head. */
    public static function isAwaitingFamilyHeadApproval(int $userId, int $communityId): bool
    {
        return FamilyJoinRequest::query()
            ->where('requester_user_id', $userId)
            ->where('status', FamilyJoinRequest::STATUS_PENDING)
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->exists();
    }

    private static function notifyCommunityAdminsOfOnboardingJoin(FamilyJoinRequest $request): void
    {
        $request->loadMissing(['family.community', 'requester.profile']);
        $communityId = (int) $request->family->community_id;
        $communityName = $request->family?->community?->name ?? 'your community';
        $familyNumber = $request->family?->family_number ?? '';
        $requesterName = $request->requester?->profile?->display_name
            ?: ($request->requester?->name ?? 'A resident');

        $adminIds = CommunityMembership::query()
            ->where('community_id', $communityId)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->pluck('user_id')
            ->all();

        foreach (array_unique($adminIds) as $adminId) {
            NotificationService::send(
                (int) $adminId,
                'info',
                'Membership approval needed',
                "{$requesterName} was approved by family {$familyNumber} and needs community review in {$communityName}.",
                '/admin/members?status=pending',
                [
                    'family_id'              => $request->family_id,
                    'family_join_request_id' => $request->id,
                    'community_id'           => $communityId,
                    'kind'                   => 'family_join_pending_admin',
                ],
            );
        }
    }

    public static function rejectJoinRequest(FamilyJoinRequest $request, User $reviewer, ?string $reason = null): FamilyJoinRequest
    {
        self::assertFamilyHead($request->family, $reviewer);

        if ($request->status !== 'pending') {
            abort(422, 'This request is no longer pending.');
        }

        $request->update([
            'status'              => 'rejected',
            'rejection_reason'    => $reason ? trim($reason) : null,
            'reviewed_by_user_id' => $reviewer->id,
            'reviewed_at'         => now(),
        ]);

        FamilyAddMemberRequest::query()
            ->where('family_join_request_id', $request->id)
            ->where('status', FamilyAddMemberRequest::STATUS_AWAITING_HEAD)
            ->update([
                'status'              => FamilyAddMemberRequest::STATUS_REJECTED,
                'rejection_reason'    => $reason ? trim($reason) : null,
                'reviewed_by_user_id' => $reviewer->id,
                'reviewed_at'         => now(),
            ]);

        NotificationService::send(
            (int) $request->requester_user_id,
            'warning',
            'Family request declined',
            'Your request to join the family was declined.',
            '/screens/pending-family',
            ['family_id' => $request->family_id, 'kind' => 'family_join_rejected'],
        );

        return $request->fresh(['requester.profile', 'family.community']);
    }

    public static function cancelJoinRequest(FamilyJoinRequest $request, User $actor): FamilyJoinRequest
    {
        if ((int) $request->requester_user_id !== (int) $actor->id) {
            abort(403, 'You can only cancel your own join request.');
        }

        if ($request->status !== 'pending') {
            abort(422, 'This request is no longer pending.');
        }

        $request->loadMissing('family');

        $request->update([
            'status' => 'cancelled',
        ]);

        ActivityLogService::user(
            'family_join_cancelled',
            "Cancelled join request for family {$request->family?->family_number}",
            'FamilyJoinRequest',
            $request->id,
            'info',
            $actor->id,
        );

        return $request->fresh(['requester.profile', 'family.community']);
    }

    public static function requestAddMember(Family $family, User $actor, array $data): FamilyAddMemberRequest
    {
        self::assertFamilyHead($family, $actor);

        $email = strtolower(trim($data['email']));
        $rawPhone = trim((string) ($data['phone'] ?? ''));
        $phone = $rawPhone !== ''
            ? (PhoneNormalizer::normalize($rawPhone) ?? $rawPhone)
            : '';
        $firstName = trim($data['first_name']);
        $lastName = trim($data['last_name']);
        $age = (int) $data['age'];
        $unitNumber = trim((string) ($data['unit_number'] ?? ''));
        $communityId = (int) $family->community_id;

        $duplicate = FamilyAddMemberRequest::query()
            ->where('family_id', $family->id)
            ->whereIn('status', [
                FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
                FamilyAddMemberRequest::STATUS_AWAITING_HEAD,
                'pending',
            ])
            ->where('email', $email)
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'email' => ['A pending add request already exists for this email.'],
            ]);
        }

        return DB::transaction(function () use (
            $family,
            $actor,
            $email,
            $phone,
            $firstName,
            $lastName,
            $age,
            $unitNumber,
            $communityId,
        ) {
            $candidate = self::resolveOrCreateAddMemberCandidate(
                $email,
                $phone,
                $firstName,
                $lastName,
                $communityId,
                $unitNumber,
            );

            if ((int) $candidate->id === (int) $actor->id) {
                throw ValidationException::withMessages([
                    'email' => ['You are already the head of this family.'],
                ]);
            }

            self::assertNotInFamily($candidate, $communityId);

            if (\App\Models\FamilyBlock::query()
                ->where('family_id', $family->id)
                ->where('user_id', $candidate->id)
                ->exists()) {
                abort(422, 'This person is blocked from this family.');
            }

            self::ensurePendingCommunityMembershipForAddMember($candidate, $communityId);

            $request = FamilyAddMemberRequest::query()->create([
                'family_id'            => $family->id,
                'requested_by_user_id' => $actor->id,
                'candidate_user_id'    => $candidate->id,
                'first_name'           => $firstName,
                'last_name'            => $lastName,
                'email'                => $email,
                'phone'                => $phone !== '' ? $phone : null,
                'age'                  => $age,
                'unit_number'          => $unitNumber !== '' ? $unitNumber : null,
                'status'               => FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
            ]);

            $request->load(['requestedBy.profile', 'candidate.profile', 'family.community']);

            self::notifyCommunityAdminsOfFamilyAdd($request);

            ActivityLogService::user(
                'family_add_member_requested',
                "Requested to add {$request->first_name} {$request->last_name} to family {$family->family_number} (awaiting community admin)",
                'FamilyAddMemberRequest',
                $request->id,
                'info',
                $actor->id,
            );

            return $request;
        });
    }

    /**
     * After community admin approves a resident membership, promote any linked
     * family add-member request into a family join request for the head.
     */
    public static function promoteAddMemberAfterCommunityApproval(
        User $candidate,
        int $communityId,
        ?User $admin = null,
    ): void {
        $requests = FamilyAddMemberRequest::query()
            ->with(['family.community', 'candidate.profile', 'requestedBy.profile'])
            ->where('candidate_user_id', $candidate->id)
            ->whereIn('status', [FamilyAddMemberRequest::STATUS_PENDING_ADMIN, 'pending'])
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->get();

        foreach ($requests as $request) {
            self::advanceAddMemberToFamilyHead($request, $admin);
        }
    }

    /**
     * Community admin rejected the resident — cancel linked family add requests.
     */
    public static function cancelAddMemberAfterCommunityRejection(
        User $candidate,
        int $communityId,
        ?User $admin = null,
        ?string $reason = null,
    ): void {
        $requests = FamilyAddMemberRequest::query()
            ->with(['family.community', 'candidate.profile'])
            ->where('candidate_user_id', $candidate->id)
            ->whereIn('status', [FamilyAddMemberRequest::STATUS_PENDING_ADMIN, 'pending'])
            ->whereHas('family', fn ($q) => $q->where('community_id', $communityId))
            ->get();

        foreach ($requests as $request) {
            self::rejectAddMemberByCommunityAdmin($request, $admin, $reason, notifyCandidate: true);
        }
    }

    /** Admin dashboard / API: approve family add when candidate is already a community resident. */
    public static function approveAddMemberByCommunityAdmin(
        FamilyAddMemberRequest $request,
        User $admin,
    ): FamilyJoinRequest {
        $request->loadMissing('family');

        if (! $request->isAwaitingCommunityAdmin()) {
            abort(422, 'This request is no longer awaiting community admin review.');
        }

        $communityId = (int) $request->family->community_id;
        AdminRoleService::assertCanManageCommunity($admin, $communityId);

        $candidate = User::query()->find($request->candidate_user_id);
        if (! $candidate) {
            abort(422, 'The invited resident account was not found.');
        }

        $membership = CommunityMembership::query()
            ->where('user_id', $candidate->id)
            ->where('community_id', $communityId)
            ->first();

        if ($membership && $membership->status === 'pending') {
            $membership->update([
                'status'           => 'approved',
                'rejection_reason' => null,
                'rejected_by'      => null,
            ]);
            NotificationService::send(
                (int) $candidate->id,
                'success',
                'Membership Approved',
                'Your membership has been approved. Welcome to the community!',
            );
        } elseif (! $membership) {
            CommunityMembership::query()->create([
                'user_id'      => $candidate->id,
                'community_id' => $communityId,
                'role'         => 'member',
                'status'       => 'approved',
            ]);
            NotificationService::send(
                (int) $candidate->id,
                'success',
                'Membership Approved',
                'Your membership has been approved. Welcome to the community!',
            );
        } elseif ($membership->status !== 'approved') {
            abort(422, 'This resident must be an approved community member before joining a family.');
        }

        return self::advanceAddMemberToFamilyHead($request, $admin);
    }

    public static function rejectAddMemberByCommunityAdmin(
        FamilyAddMemberRequest $request,
        ?User $admin = null,
        ?string $reason = null,
        bool $notifyCandidate = true,
    ): FamilyAddMemberRequest {
        if (! $request->isAwaitingCommunityAdmin()) {
            abort(422, 'This request is no longer awaiting community admin review.');
        }

        $request->loadMissing(['family.community', 'candidate']);

        if ($admin) {
            AdminRoleService::assertCanManageCommunity($admin, (int) $request->family->community_id);
        }

        $trimmedReason = $reason ? trim($reason) : null;

        $request->update([
            'status'                   => FamilyAddMemberRequest::STATUS_REJECTED,
            'admin_rejection_reason'   => $trimmedReason,
            'rejection_reason'         => $trimmedReason,
            'admin_reviewed_by_user_id'=> $admin?->id,
            'admin_reviewed_at'        => now(),
            'reviewed_by_user_id'      => $admin?->id,
            'reviewed_at'              => now(),
        ]);

        if ($notifyCandidate && $request->candidate_user_id) {
            $communityName = $request->family?->community?->name ?? 'your community';
            $body = $trimmedReason
                ? "Your family membership request was not approved by the community admin for {$communityName}. Reason: {$trimmedReason}"
                : "Your family membership request was not approved by the community admin for {$communityName}.";

            NotificationService::send(
                (int) $request->candidate_user_id,
                'warning',
                'Family request declined',
                $body,
                '/screens/my-family',
                [
                    'family_id' => $request->family_id,
                    'kind'      => 'family_add_member_admin_rejected',
                ],
            );
        }

        if ($request->requested_by_user_id) {
            NotificationService::send(
                (int) $request->requested_by_user_id,
                'warning',
                'Family add request declined',
                "Community admin declined your request to add {$request->first_name} {$request->last_name}.",
                '/screens/my-family',
                [
                    'family_id' => $request->family_id,
                    'kind'      => 'family_add_member_admin_rejected_head',
                ],
            );
        }

        ActivityLogService::user(
            'family_add_member_admin_rejected',
            "Community admin rejected family add for {$request->first_name} {$request->last_name}",
            'FamilyAddMemberRequest',
            $request->id,
            'warning',
            $admin?->id,
        );

        return $request->fresh(['requestedBy.profile', 'candidate.profile', 'family.community']);
    }

    /** @deprecated Head approval now happens via FamilyJoinRequest after community admin approval. */
    public static function approveAddMemberRequest(FamilyAddMemberRequest $request, User $reviewer): FamilyMember
    {
        abort(422, 'This request must be approved from Family requests after community admin review.');
    }

    /** Head can cancel only while still awaiting community admin (before a join request exists). */
    public static function rejectAddMemberRequest(FamilyAddMemberRequest $request, User $reviewer, ?string $reason = null): FamilyAddMemberRequest
    {
        self::assertFamilyHead($request->family, $reviewer);

        if (! $request->isAwaitingCommunityAdmin()) {
            abort(422, 'This request is no longer pending community admin review. Manage it from Family requests.');
        }

        $request->update([
            'status'              => FamilyAddMemberRequest::STATUS_CANCELLED,
            'rejection_reason'    => $reason ? trim($reason) : null,
            'reviewed_by_user_id' => $reviewer->id,
            'reviewed_at'         => now(),
        ]);

        return $request->fresh(['requestedBy.profile', 'candidate.profile', 'family.community']);
    }

    public static function formatAddMemberRequest(FamilyAddMemberRequest $request): array
    {
        $request->loadMissing(['requestedBy.profile', 'candidate.profile', 'family.community']);

        return [
            'id'               => $request->id,
            'type'             => 'add_member',
            'status'           => $request->status === 'pending'
                ? FamilyAddMemberRequest::STATUS_PENDING_ADMIN
                : $request->status,
            'first_name'       => $request->first_name,
            'last_name'        => $request->last_name,
            'email'            => $request->email,
            'phone'            => $request->phone,
            'age'              => $request->age,
            'unit_number'      => $request->unit_number,
            'rejection_reason' => $request->rejection_reason,
            'admin_rejection_reason' => $request->admin_rejection_reason,
            'created_at'       => $request->created_at?->toIso8601String(),
            'reviewed_at'      => $request->reviewed_at?->toIso8601String(),
            'admin_reviewed_at'=> $request->admin_reviewed_at?->toIso8601String(),
            'family_join_request_id' => $request->family_join_request_id,
            'requested_by'     => self::formatUserBrief($request->requestedBy),
            'candidate'        => self::formatUserBrief($request->candidate),
            'family'           => [
                'id'             => $request->family?->id,
                'family_number'  => $request->family?->family_number,
                'community_name' => $request->family?->community?->name,
                'community_id'   => $request->family?->community_id,
            ],
        ];
    }

    private static function advanceAddMemberToFamilyHead(
        FamilyAddMemberRequest $request,
        ?User $admin = null,
    ): FamilyJoinRequest {
        $request->loadMissing(['family.community', 'candidate.profile']);

        if (! $request->isAwaitingCommunityAdmin()) {
            abort(422, 'This request is no longer awaiting community admin review.');
        }

        $family = $request->family;
        $candidate = $request->candidate;

        if (! $candidate) {
            abort(422, 'The invited resident account was not found.');
        }

        self::assertNotInFamily($candidate, (int) $family->community_id);

        $existingJoin = FamilyJoinRequest::query()
            ->where('family_id', $family->id)
            ->where('requester_user_id', $candidate->id)
            ->where('status', 'pending')
            ->first();

        if ($existingJoin) {
            $joinRequest = $existingJoin;
        } else {
            $joinRequest = FamilyJoinRequest::query()->create([
                'family_id'         => $family->id,
                'requester_user_id' => $candidate->id,
                'status'            => 'pending',
                'message'           => "Family head invited {$request->first_name} {$request->last_name} — confirm to add them to your family.",
            ]);
        }

        $request->update([
            'status'                   => FamilyAddMemberRequest::STATUS_AWAITING_HEAD,
            'family_join_request_id'   => $joinRequest->id,
            'admin_reviewed_by_user_id'=> $admin?->id,
            'admin_reviewed_at'        => now(),
        ]);

        NotificationService::send(
            (int) $family->head_user_id,
            'info',
            'New family join request',
            "{$candidate->name} is ready to join your family after community admin approval.",
            '/screens/my-family/requests',
            [
                'family_id'              => $family->id,
                'family_join_request_id' => $joinRequest->id,
                'kind'                   => 'family_join_request',
            ],
        );

        NotificationService::send(
            (int) $candidate->id,
            'info',
            'Awaiting family head approval',
            "Your community membership was approved. The family head still needs to confirm adding you to family {$family->family_number}.",
            '/screens/my-family',
            [
                'family_id' => $family->id,
                'kind'      => 'family_add_member_awaiting_head',
            ],
        );

        ActivityLogService::user(
            'family_add_member_admin_approved',
            "Community admin approved family add for {$request->first_name} {$request->last_name}; join request sent to family head",
            'FamilyAddMemberRequest',
            $request->id,
            'info',
            $admin?->id,
        );

        return $joinRequest->load(['requester.profile', 'family.community']);
    }

    private static function resolveOrCreateAddMemberCandidate(
        string $email,
        string $phone,
        string $firstName,
        string $lastName,
        int $communityId,
        string $unitNumber = '',
    ): User {
        $byEmail = ContactIdentityService::findActiveUserByEmail($email);
        $byPhone = $phone !== '' ? ContactIdentityService::findActiveUserByPhone($phone) : null;

        if ($byEmail && $byPhone && (int) $byEmail->id !== (int) $byPhone->id) {
            throw ValidationException::withMessages([
                'email' => ['This email and phone belong to different accounts.'],
            ]);
        }

        $candidate = $byEmail ?? $byPhone;
        $displayName = trim("{$firstName} {$lastName}") ?: 'Neighbor';

        if ($candidate) {
            $otherCommunity = CommunityMembership::query()
                ->where('user_id', $candidate->id)
                ->where('community_id', '!=', $communityId)
                ->whereIn('status', ['pending', 'approved'])
                ->exists();

            $sameCommunity = CommunityMembership::query()
                ->where('user_id', $candidate->id)
                ->where('community_id', $communityId)
                ->exists();

            if ($otherCommunity && ! $sameCommunity) {
                throw ValidationException::withMessages([
                    'email' => ['This person already belongs to another community.'],
                ]);
            }

            if ($unitNumber !== '') {
                $candidate->loadMissing('profile');
                \App\Models\Profile::query()->updateOrCreate(
                    ['user_id' => $candidate->id],
                    [
                        'display_name' => $candidate->profile?->display_name ?: $displayName,
                        'unit_number'  => $unitNumber,
                    ],
                );
            }

            return $candidate->fresh(['profile']);
        }

        ContactIdentityService::assertAvailableForRegistration($email, $phone !== '' ? $phone : null);

        $user = User::query()->create([
            'name'     => $displayName,
            'email'    => $email,
            'phone'    => $phone !== '' ? $phone : null,
            'password' => Hash::make(Str::random(32)),
            'status'   => 'active',
            'role'     => 'resident',
        ]);

        DB::table('profiles')->insert([
            'user_id'      => $user->id,
            'display_name' => $displayName,
            'unit_number'  => $unitNumber !== '' ? $unitNumber : null,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return $user;
    }

    private static function ensurePendingCommunityMembershipForAddMember(User $candidate, int $communityId): void
    {
        $membership = CommunityMembership::query()
            ->where('user_id', $candidate->id)
            ->where('community_id', $communityId)
            ->first();

        if (! $membership) {
            CommunityMembership::query()->create([
                'user_id'      => $candidate->id,
                'community_id' => $communityId,
                'role'         => 'member',
                'status'       => 'pending',
            ]);

            return;
        }

        if ($membership->status === 'approved') {
            return;
        }

        if ($membership->status === 'banned') {
            abort(422, 'This person cannot join the community.');
        }

        // Re-open rejected/pending so community admin can review again for this family add.
        $membership->update([
            'status'           => 'pending',
            'rejection_reason' => null,
            'rejected_by'      => null,
        ]);
    }

    private static function notifyCommunityAdminsOfFamilyAdd(FamilyAddMemberRequest $request): void
    {
        $request->loadMissing('family.community');
        $communityId = (int) $request->family->community_id;
        $communityName = $request->family?->community?->name ?? 'your community';
        $familyNumber = $request->family?->family_number ?? '';

        $adminIds = CommunityMembership::query()
            ->where('community_id', $communityId)
            ->where('role', 'admin')
            ->where('status', 'approved')
            ->pluck('user_id')
            ->all();

        foreach (array_unique($adminIds) as $adminId) {
            NotificationService::send(
                (int) $adminId,
                'info',
                'Family member approval needed',
                "{$request->first_name} {$request->last_name} was nominated for family {$familyNumber} in {$communityName}. Review in Members.",
                '/admin/members?status=pending',
                [
                    'family_id'                   => $request->family_id,
                    'family_add_member_request_id'=> $request->id,
                    'community_id'                => $communityId,
                    'kind'                        => 'family_add_member_pending_admin',
                ],
            );
        }
    }

    public static function suspendMember(Family $family, User $actor, int $memberUserId): FamilyMember
    {
        self::assertFamilyHead($family, $actor);

        $member = self::findActiveMember($family, $memberUserId);
        if ($member->role === 'head') {
            abort(422, 'The family head cannot be suspended.');
        }

        $member->update(['status' => 'suspended']);

        NotificationService::send(
            $memberUserId,
            'warning',
            'Family access suspended',
            'Your family head suspended your access to family features.',
            '/screens/my-family',
            ['family_id' => $family->id, 'kind' => 'family_suspended'],
        );

        return $member->fresh(['user.profile']);
    }

    public static function unsuspendMember(Family $family, User $actor, int $memberUserId): FamilyMember
    {
        self::assertFamilyHead($family, $actor);

        $member = FamilyMember::query()
            ->where('family_id', $family->id)
            ->where('user_id', $memberUserId)
            ->where('status', 'suspended')
            ->firstOrFail();

        $member->update(['status' => 'active']);

        return $member->fresh(['user.profile']);
    }

    public static function removeMember(Family $family, User $actor, int $memberUserId): void
    {
        self::assertFamilyHead($family, $actor);

        $member = self::findActiveMember($family, $memberUserId);
        if ($member->role === 'head') {
            abort(422, 'The family head cannot be removed.');
        }

        $member->delete();

        NotificationService::send(
            $memberUserId,
            'warning',
            'Removed from family',
            'You were removed from your family.',
            '/screens/my-family',
            ['kind' => 'family_removed'],
        );
    }

    public static function blockMember(Family $family, User $actor, int $memberUserId): void
    {
        self::assertFamilyHead($family, $actor);

        $member = self::findActiveMember($family, $memberUserId);
        if ($member->role === 'head') {
            abort(422, 'The family head cannot be blocked.');
        }

        $member->delete();

        \App\Models\FamilyBlock::query()->updateOrCreate(
            ['family_id' => $family->id, 'user_id' => $memberUserId],
            ['blocked_by_user_id' => $actor->id],
        );

        NotificationService::send(
            $memberUserId,
            'warning',
            'Blocked from family',
            'You were blocked from rejoining this family.',
            '/screens/my-family',
            ['family_id' => $family->id, 'kind' => 'family_blocked'],
        );
    }

    public static function leaveFamily(User $user, Family $family): void
    {
        $member = FamilyMember::query()
            ->where('family_id', $family->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->firstOrFail();

        if ($member->role === 'head') {
            abort(422, 'Family head cannot leave. Transfer head role or archive the family first.');
        }

        $member->delete();

        NotificationService::send(
            (int) $family->head_user_id,
            'info',
            'Member left family',
            "{$user->name} left your family.",
            '/screens/my-family',
            ['family_id' => $family->id, 'kind' => 'family_member_left'],
        );
    }

    public static function assertFamilyHead(Family $family, User $user): void
    {
        if ((int) $family->head_user_id !== (int) $user->id) {
            abort(403, 'Only the family head can perform this action.');
        }
    }

    private static function findActiveMember(Family $family, int $memberUserId): FamilyMember
    {
        return FamilyMember::query()
            ->where('family_id', $family->id)
            ->where('user_id', $memberUserId)
            ->whereIn('status', ['active', 'suspended'])
            ->firstOrFail();
    }

    public static function formatFamily(Family $family, ?FamilyMember $viewerMembership = null): array
    {
        $family->loadMissing(['community', 'head.profile', 'members.user.profile']);

        $members = $family->members
            ->sortByDesc(fn (FamilyMember $m) => $m->role === 'head')
            ->values()
            ->map(fn (FamilyMember $m) => self::formatMember($m))
            ->all();

        $pendingCount = FamilyJoinRequest::query()
            ->where('family_id', $family->id)
            ->where('status', 'pending')
            ->count();

        return [
            'id'             => $family->id,
            'family_number'  => $family->family_number,
            'name'           => $family->name,
            'status'         => $family->status,
            'community_id'   => $family->community_id,
            'community_name' => $family->community?->name,
            'head'           => self::formatUserBrief($family->head),
            'member_count'   => count(array_filter($members, fn ($m) => $m['status'] === 'active' || $m['status'] === 'suspended')),
            'created_at'     => $family->created_at?->toIso8601String(),
            'members'        => $members,
            'my_role'        => $viewerMembership?->role,
            'my_status'      => $viewerMembership?->status,
            'is_head'        => $viewerMembership?->role === 'head',
            'pending_requests_count' => $pendingCount,
        ];
    }

    public static function formatMember(FamilyMember $member): array
    {
        $member->loadMissing('user.profile');

        $user = $member->user;
        $brief = self::formatUserBrief($user);

        // Contact fields are only attached for family co-members (this payload),
        // not public neighbor profiles or non-member user briefs.
        if ($brief && $user) {
            $email = $user->email;
            if (User::isPhonePlaceholderEmail($email)) {
                $email = null;
            }
            $brief['email'] = $email;
            $brief['phone'] = $user->phone;
        }

        return [
            'id'           => $member->id,
            'user_id'      => $member->user_id,
            'role'         => $member->role,
            'status'       => $member->status,
            'relationship' => $member->relationship,
            'joined_at'    => $member->joined_at?->toIso8601String(),
            'user'         => $brief,
        ];
    }

    public static function formatJoinRequest(FamilyJoinRequest $request): array
    {
        $request->loadMissing(['requester.profile', 'family.community']);

        return [
            'id'          => $request->id,
            'type'        => 'join',
            'status'      => $request->status,
            'message'     => $request->message,
            'rejection_reason' => $request->rejection_reason,
            'created_at'  => $request->created_at?->toIso8601String(),
            'reviewed_at' => $request->reviewed_at?->toIso8601String(),
            'requester'   => self::formatUserBrief($request->requester),
            'family'      => [
                'id'            => $request->family?->id,
                'family_number' => $request->family?->family_number,
                'community_name'=> $request->family?->community?->name,
            ],
        ];
    }

    public static function formatUserBrief(?User $user): ?array
    {
        if (! $user) {
            return null;
        }

        $user->loadMissing('profile');

        return [
            'id'           => $user->id,
            'name'         => $user->profile?->display_name ?: $user->name,
            'avatar_url'   => $user->profile?->avatar_url,
            'unit_number'  => $user->profile?->unit_number,
        ];
    }

    public static function minePayload(User $user): array
    {
        $communityId = self::resolveCommunityId($user)
            ?? self::resolveCommunityIdForProvision($user);
        $membership = self::activeMembership($user, $communityId);
        $suspendedMembership = FamilyMember::query()
            ->with(['family.community', 'user.profile'])
            ->where('user_id', $user->id)
            ->where('status', 'suspended')
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f
                ->where('community_id', $communityId)
                ->where('status', 'active')))
            ->first();

        $pendingRequest = FamilyJoinRequest::query()
            ->with(['family.community'])
            ->where('requester_user_id', $user->id)
            ->where('status', FamilyJoinRequest::STATUS_PENDING)
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f->where('community_id', $communityId)))
            ->first();

        $awaitingAdminRequest = FamilyJoinRequest::query()
            ->with(['family.community'])
            ->where('requester_user_id', $user->id)
            ->where('status', FamilyJoinRequest::STATUS_AWAITING_ADMIN)
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f->where('community_id', $communityId)))
            ->first();

        if ($membership) {
            return [
                'state'   => 'member',
                'family'  => self::formatFamily($membership->family, $membership),
                'membership' => [
                    'role'   => $membership->role,
                    'status' => $membership->status,
                ],
            ];
        }

        if ($suspendedMembership) {
            return [
                'state'      => 'suspended',
                'family'     => self::formatFamily($suspendedMembership->family, $suspendedMembership),
                'membership' => [
                    'role'   => $suspendedMembership->role,
                    'status' => 'suspended',
                ],
            ];
        }

        if ($pendingRequest) {
            return [
                'state'           => 'pending',
                'pending_request' => self::formatJoinRequest($pendingRequest),
                'can_create'      => true,
            ];
        }

        if ($awaitingAdminRequest) {
            return [
                'state'           => 'awaiting_admin',
                'pending_request' => self::formatJoinRequest($awaitingAdminRequest),
                'can_create'      => false,
            ];
        }

        $rejectedRequest = FamilyJoinRequest::query()
            ->with(['family.community'])
            ->where('requester_user_id', $user->id)
            ->where('status', FamilyJoinRequest::STATUS_REJECTED)
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f->where('community_id', $communityId)))
            ->orderByDesc('reviewed_at')
            ->orderByDesc('updated_at')
            ->first();

        if ($rejectedRequest) {
            return [
                'state'             => 'rejected',
                'rejected_request'  => self::formatJoinRequest($rejectedRequest),
                'can_create'        => true,
            ];
        }

        $blocked = \App\Models\FamilyBlock::query()
            ->with(['family.community'])
            ->where('user_id', $user->id)
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f
                ->where('community_id', $communityId)
                ->where('status', 'active')))
            ->first();

        if ($blocked?->family) {
            return [
                'state'  => 'blocked',
                'family' => [
                    'id'            => $blocked->family->id,
                    'family_number' => $blocked->family->family_number,
                    'community_name'=> $blocked->family->community?->name,
                ],
            ];
        }

        return [
            'state'      => 'none',
            'can_create' => (bool) $communityId,
            'can_join'   => (bool) $communityId,
        ];
    }

    /** Compact family onboarding status for /me routing (pending head / rejected / awaiting admin). */
    public static function onboardingBrief(User $user): array
    {
        $payload = self::minePayload($user);
        $state = $payload['state'] ?? 'none';

        $request = null;
        if ($state === 'pending' || $state === 'awaiting_admin') {
            $request = $payload['pending_request'] ?? null;
        } elseif ($state === 'rejected') {
            $request = $payload['rejected_request'] ?? null;
        }

        $familyId = null;
        if ($state === 'member' && ! empty($payload['family']['id'])) {
            $familyId = (int) $payload['family']['id'];
        }

        return [
            'family_id'     => $familyId,
            'state'         => $state,
            'family_status' => $state,
            'request'       => $request,
        ];
    }
}
