<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\InviteCode;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\CommunityBillingService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\FamilyService;
use App\Services\InviteCodeService;
use App\Services\NotificationService;
use App\Support\ActivityActionCatalog;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class MemberController extends Controller
{
    /** Exclude platform system admins and guests from member/resident lists. */
    private function excludePlatformAdminsScope($query, string $usersAlias = 'users'): void
    {
        $query->whereNotIn("{$usersAlias}.role", ['system_admin', 'admin', 'guest']);
    }

    /** Guests have temporary access via Guests admin — never list as community members. */
    private function excludeGuestMembershipsScope($query, string $cmAlias = 'cm'): void
    {
        $query->where(function ($q) use ($cmAlias) {
            $q->whereNull("{$cmAlias}.id")
                ->orWhere("{$cmAlias}.role", '!=', 'guest');
        });
    }

    /** Residents tab: only membership rows for residents, not community admins. */
    private function applyResidentsOnlyScope($query, bool $residentsOnly, string $usersAlias = 'users'): void
    {
        if (! $residentsOnly) {
            return;
        }

        $query->where("{$usersAlias}.role", 'resident')
            ->where('cm.role', 'member');
    }

    /** GET /v1/admin/members */
    public function index(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityScope($request, $request->user());
        if ($communityId === null) {
            return $this->indexAllCommunities($request);
        }

        $query = DB::table('users')
            ->leftJoin('community_memberships as cm', function ($join) use ($communityId) {
                $join->on('cm.user_id', '=', 'users.id')
                    ->where('cm.community_id', '=', $communityId);
            })
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.created_at',
                'cm.id as membership_id',
                'cm.role',
                'cm.status',
                'cm.rejection_reason',
                'cm.rejected_by',
                'cm.community_id',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
            )
            ->where('users.status', '!=', 'deleted')
            ->where(function ($q) use ($communityId) {
                $q->whereNotNull('cm.id')
                    ->orWhere(function ($q2) use ($communityId) {
                        $q2->where('users.role', 'resident')
                            ->whereNotExists(function ($sub) {
                                $sub->from('community_memberships as cm_all')
                                    ->whereColumn('cm_all.user_id', 'users.id');
                            })
                            ->whereExists(function ($sub) use ($communityId) {
                                $sub->from('invite_codes')
                                    ->whereColumn('invite_codes.invited_user_id', 'users.id')
                                    ->where('invite_codes.community_id', $communityId);
                            });
                    });
            });

        $this->excludePlatformAdminsScope($query);
        $this->excludeGuestMembershipsScope($query);

        if ($request->filled('status') && $request->status !== 'all') {
            if ($request->status === 'pending') {
                $query->where(function ($q) {
                    $q->where('cm.status', 'pending')
                        ->orWhereNull('cm.id');
                });
                // Hide Complete Profile joiners until their family head approves.
                $query->where(function ($q) use ($communityId) {
                    $q->whereNull('cm.id')
                        ->orWhereNotExists(function ($sub) use ($communityId) {
                            $sub->from('family_join_requests as fjr')
                                ->join('families', 'families.id', '=', 'fjr.family_id')
                                ->whereColumn('fjr.requester_user_id', 'users.id')
                                ->where('families.community_id', $communityId)
                                ->where('fjr.status', 'pending');
                        });
                });
            } elseif ($request->status === 'onboarding') {
                $query->whereNull('cm.id');
            } else {
                $query->where('cm.status', $request->status);
            }
        }

        if ($request->filled('role') && $request->role !== 'all') {
            $query->where(function ($q) use ($request) {
                $q->where('cm.role', $request->role)
                    ->orWhereNull('cm.id');
            });
        }

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('users.name', 'like', "%{$s}%")
                    ->orWhere('users.email', 'like', "%{$s}%")
                    ->orWhere('users.phone', 'like', "%{$s}%")
                    ->orWhere('profiles.unit_number', 'like', "%{$s}%")
                    ->orWhere('profiles.display_name', 'like', "%{$s}%");
            });
        }

        $members = $query->orderByDesc('users.created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        return response()->json([
            'data' => collect($members->items())->map(fn ($m) => $this->formatMember($m))->values(),
            'meta' => [
                'current_page' => $members->currentPage(),
                'last_page'    => $members->lastPage(),
                'total'        => $members->total(),
                'per_page'     => $members->perPage(),
                'community_id' => $communityId,
                'scope'        => 'community',
                'stats'        => $this->memberStats($communityId, $request->input('role') === 'member'),
            ],
        ]);
    }

    private function indexAllCommunities(Request $request): JsonResponse
    {
        $residentsOnly = $request->input('role') === 'member';
        $status = $request->filled('status') && $request->status !== 'all'
            ? $request->status
            : null;
        $perPage = min((int) ($request->per_page ?? 15), 100);
        $page = max(1, (int) ($request->page ?? 1));

        if ($status === 'onboarding') {
            $members = $this->onboardingUsersQuery($request, $residentsOnly)
                ->orderByDesc('users.created_at')
                ->paginate($perPage, ['*'], 'page', $page);
        } elseif ($status === null) {
            $members = $this->paginateAllCommunitiesCombined($request, $residentsOnly, $perPage, $page);
        } else {
            $query = $this->membershipRowsQuery($request, $residentsOnly);
            $query->where('cm.status', $status);
            if ($status === 'pending') {
                $this->excludeAwaitingFamilyHeadJoiners($query);
            }
            $members = $query->orderByDesc('cm.created_at')
                ->paginate($perPage, ['*'], 'page', $page);
        }

        return response()->json([
            'data' => collect($members->items())->map(fn ($m) => $this->formatMember($m))->values(),
            'meta' => [
                'current_page' => $members->currentPage(),
                'last_page'    => $members->lastPage(),
                'total'        => $members->total(),
                'per_page'     => $members->perPage(),
                'community_id' => null,
                'scope'        => 'all',
                'stats'        => $this->memberStatsAll($residentsOnly),
            ],
        ]);
    }

    private function membershipRowsQuery(Request $request, bool $residentsOnly)
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.created_at',
                'cm.id as membership_id',
                'cm.role',
                'cm.status',
                'cm.rejection_reason',
                'cm.rejected_by',
                'cm.community_id',
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                'cm.created_at as sort_created_at',
            )
            ->where('users.status', '!=', 'deleted');

        $this->excludePlatformAdminsScope($query);
        $this->excludeGuestMembershipsScope($query);
        $this->applyResidentsOnlyScope($query, $residentsOnly);
        $this->applyMemberSearch($query, $request, includeCommunityName: true);

        return $query;
    }

    private function onboardingUsersQuery(Request $request, bool $residentsOnly)
    {
        $query = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.created_at',
                DB::raw('NULL as membership_id'),
                DB::raw("'member' as role"),
                DB::raw('NULL as status'),
                DB::raw('NULL as rejection_reason'),
                DB::raw('NULL as rejected_by'),
                DB::raw('NULL as community_id'),
                DB::raw('NULL as community_name'),
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                'users.created_at as sort_created_at',
            )
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->whereNotExists(function ($sub) {
                $sub->from('community_memberships as cm_all')
                    ->whereColumn('cm_all.user_id', 'users.id');
            });

        $this->excludePlatformAdminsScope($query);

        $this->applyMemberSearch($query, $request, includeCommunityName: false);

        return $query;
    }

    private function paginateAllCommunitiesCombined(
        Request $request,
        bool $residentsOnly,
        int $perPage,
        int $page,
    ): LengthAwarePaginator {
        $membershipQuery = $this->membershipRowsQuery($request, $residentsOnly);
        $onboardingQuery = $this->onboardingUsersQuery($request, $residentsOnly);
        $union = $membershipQuery->unionAll($onboardingQuery);

        $total = (int) DB::query()->fromSub($union, 'combined')->count();

        $items = DB::query()
            ->fromSub($union, 'combined')
            ->orderByDesc('sort_created_at')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get();

        return new LengthAwarePaginator($items, $total, $perPage, $page, [
            'path' => $request->url(),
            'query' => $request->query(),
        ]);
    }

    private function applyMemberSearch($query, Request $request, bool $includeCommunityName): void
    {
        if (! $request->filled('search')) {
            return;
        }

        $s = $request->search;
        $query->where(function ($q) use ($s, $includeCommunityName) {
            $q->where('users.name', 'like', "%{$s}%")
                ->orWhere('users.email', 'like', "%{$s}%")
                ->orWhere('users.phone', 'like', "%{$s}%")
                ->orWhere('profiles.unit_number', 'like', "%{$s}%")
                ->orWhere('profiles.display_name', 'like', "%{$s}%");

            if ($includeCommunityName) {
                $q->orWhere('communities.name', 'like', "%{$s}%");
            }
        });
    }

    /** GET /v1/admin/members/{id} */
    public function show(int $id, Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityScope($request, $request->user());
        if ($communityId === null) {
            $communityId = $this->resolveCommunityIdForMember($id, $request);
        }

        $member = DB::table('users')
            ->join('community_memberships as cm', 'cm.user_id', '=', 'users.id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.created_at',
                'users.updated_at',
                'cm.id as membership_id',
                'cm.role',
                'cm.status',
                'cm.rejection_reason',
                'cm.rejected_by',
                'cm.community_id',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                'profiles.bio',
                'profiles.residence_type',
            )
            ->where('users.id', $id)
            ->where('cm.community_id', $communityId)
            ->where('users.status', '!=', 'deleted')
            ->first();

        if (! $member) {
            return response()->json(['message' => 'Member not found'], 404);
        }

        return response()->json(['data' => $this->formatMember($member, detailed: true)]);
    }

    /** GET /v1/admin/members/{id}/activity-logs */
    public function activityLogs(int $id, Request $request): JsonResponse
    {
        $actor = $request->user();
        $communityId = $this->resolveCommunityIdForMember($id, $request);

        if (! AdminRoleService::isSystemAdmin($actor)) {
            AdminRoleService::assertCanManageCommunity($actor, $communityId);
        }

        $member = DB::table('community_memberships')
            ->join('users', 'users.id', '=', 'community_memberships.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'profiles.display_name',
                'profiles.unit_number',
                'community_memberships.community_id',
            )
            ->where('community_memberships.user_id', $id)
            ->where('community_memberships.community_id', $communityId)
            ->where('users.status', '!=', 'deleted')
            ->first();

        if (! $member) {
            return response()->json(['message' => 'Member not found'], 404);
        }

        $query = DB::table('activity_logs')
            ->where('user_id', $id)
            ->where('log_type', 'user')
            ->orderByDesc('created_at');

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhere('entity_type', 'like', "%{$search}%");
            });
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->input('date'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->input('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->input('date_to'));
        }

        $perPage = min((int) $request->input('per_page', 25), 100);
        $result  = $query->paginate($perPage);

        $items = collect($result->items())->map(
            fn ($row) => ActivityActionCatalog::formatLogRow($row),
        )->values();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $result->currentPage(),
                'last_page'    => $result->lastPage(),
                'per_page'     => $result->perPage(),
                'total'        => $result->total(),
                'member'       => [
                    'id'           => (int) $member->id,
                    'name'         => $member->display_name ?: $member->name,
                    'unit_number'  => $member->unit_number,
                    'community_id' => (int) $member->community_id,
                ],
            ],
        ]);
    }

    /** POST /v1/admin/members/invite */
    public function invite(Request $request): JsonResponse
    {
        $request->validate([
            'name'         => 'required|string|max:100',
            'email'        => 'required|email',
            'phone'        => 'required|string|max:30',
            'role'         => 'in:member,moderator,admin',
            'unit_number'  => 'nullable|string|max:50',
            'community_id' => 'integer',
        ]);

        $phone = PhoneNormalizer::normalize($request->phone);
        if (! $phone) {
            throw ValidationException::withMessages([
                'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
            ]);
        }

        ContactIdentityService::assertAvailableForRegistration($request->email, $phone);

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $password    = \Illuminate\Support\Str::random(12);
        $role        = $request->role ?? 'member';
        $billing     = app(CommunityBillingService::class);

        // Community admin seats are not billable; resident/moderator invites reserve a seat
        // until the invite code is redeemed on the app (OTP → invite code → complete profile).
        if ($role !== 'admin') {
            $billing->releaseExpiredReservations($communityId);
            $billing->assertCanAllocateSeat($communityId);
        }

        $userId = DB::table('users')->insertGetId([
            'name'               => $request->name,
            'email'              => $request->email,
            'phone'              => $phone,
            'phone_verified_at'  => null,
            'password'           => Hash::make($password),
            'role'               => $role === 'admin' ? 'community_admin' : 'resident',
            'status'             => 'active',
            'created_at'         => now(),
            'updated_at'         => now(),
        ]);

        DB::table('profiles')->insert([
            'user_id'      => $userId,
            'display_name' => $request->name,
            'unit_number'  => $request->unit_number,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        $invite = InviteCodeService::createForCommunity(
            communityId: $communityId,
            createdBy: $request->user()->id,
            maxUses: 1,
            expiresAt: now()->addDays(30),
            invitedUserId: $userId,
        );

        if ($role !== 'admin') {
            $billing->reserveSeatForInvite($communityId, $userId, $invite);
        }

        $communityName = Community::query()->where('id', $communityId)->value('name') ?? 'your community';
        $qrPayload = InviteCodeService::qrPayload($invite->code);

        NotificationService::send(
            $userId,
            'info',
            'Community invitation',
            "You have been invited to {$communityName}. Open Havena and enter invite code {$invite->code} or scan your QR invite.",
            '/screens/invite-code',
        );

        ActivityLogService::user('member_invited', "Invited new member: {$request->name} ({$request->email})", 'User', $userId);

        return response()->json([
            'data'    => [
                'id'             => $userId,
                'temp_password'  => $password,
                'invite_code'    => $invite->code,
                'invite_qr_value'=> $qrPayload,
                'community_name' => $communityName,
                'expires_at'     => $invite->expires_at?->toIso8601String(),
            ],
            'message' => 'Member invited successfully. Share the invite code or QR with the resident.',
        ], 201);
    }

    /** PATCH /v1/admin/members/{id}/approve */
    public function approve(int $id, Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityScope($request, $request->user());
        if ($communityId === null) {
            $communityId = $this->resolveCommunityIdForMember($id, $request);
        }

        $user = DB::table('users')->find($id);
        $roleUpdate = in_array($user->role ?? '', ['admin', 'moderator'], true) ? ['role' => 'admin'] : [];

        $membership = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        if ($membership->status === 'rejected' && ($membership->rejected_by ?? '') === 'system_admin') {
            if (! AdminRoleService::isSystemAdmin($request->user())) {
                return response()->json([
                    'message' => 'Only a system administrator can approve this resident.',
                    'code' => 'SYSTEM_REJECTION_REQUIRES_SYSTEM_ADMIN',
                ], 403);
            }
        }

        if ($membership->status !== 'approved' && ($membership->role ?? 'member') !== 'admin') {
            $billing = app(CommunityBillingService::class);
            $billing->releaseExpiredReservations((int) $communityId);
            $billing->assertCanAllocateSeat((int) $communityId);
        }

        $updated = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->update(array_merge([
                'status'           => 'approved',
                'rejection_reason' => null,
                'rejected_by'      => null,
                'updated_at'       => now(),
            ], $roleUpdate));

        if (! $updated) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        if ($userModel = User::query()->find($id)) {
            app(CommunityLifecycleService::class)->restoreSuspendedMember($userModel);
            $userModel->load(['profile', 'memberships']);
            FamilyService::promoteAddMemberAfterCommunityApproval(
                $userModel,
                (int) $communityId,
                $request->user(),
            );
            FamilyService::activateOnboardingJoinAfterCommunityApproval(
                $userModel,
                (int) $communityId,
                $request->user(),
            );
        }

        ActivityLogService::user('member_approved', "Approved membership for {$user->name}", 'User', $id);
        NotificationService::send($id, 'success', 'Membership Approved', 'Your membership has been approved. Welcome to the community!');

        return response()->json(['message' => 'Member approved']);
    }

    /** PATCH /v1/admin/members/{id}/reject */
    public function reject(int $id, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'required|string|min:3|max:500',
        ]);

        $communityId = $this->resolveCommunityScope($request, $request->user());
        if ($communityId === null) {
            $communityId = $this->resolveCommunityIdForMember($id, $request);
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        if ($membership->role === 'admin') {
            return response()->json(['message' => 'Community admin membership cannot be rejected'], 422);
        }

        if ($membership->status !== 'pending') {
            return response()->json(['message' => 'Only pending membership requests can be rejected'], 422);
        }

        $user = DB::table('users')->find($id);
        if (! $user || $user->status === 'deleted') {
            return response()->json(['message' => 'Member not found'], 404);
        }

        $reason = trim($validated['reason']);
        $rejectedBy = AdminRoleService::isSystemAdmin($request->user())
            ? 'system_admin'
            : 'community_admin';

        DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->update([
                'status'            => 'rejected',
                'rejection_reason'  => $reason,
                'rejected_by'       => $rejectedBy,
                'updated_at'        => now(),
            ]);

        $communityName = Community::query()->where('id', $communityId)->value('name') ?? 'your community';

        ActivityLogService::user(
            'member_rejected',
            "Rejected membership for {$user->name}: {$reason}",
            'User',
            $id,
            'warning',
        );

        NotificationService::send(
            $id,
            'warning',
            'Membership request declined',
            "Your request to join {$communityName} was not approved. Reason: {$reason}",
            '/screens/pending-community',
        );

        if ($userModel = User::query()->find($id)) {
            FamilyService::cancelAddMemberAfterCommunityRejection(
                $userModel,
                (int) $communityId,
                $request->user(),
                $reason,
            );
            FamilyService::rejectOnboardingJoinAfterCommunityRejection(
                $userModel,
                (int) $communityId,
                $request->user(),
                $reason,
            );
        }

        return response()->json(['message' => 'Member rejected']);
    }

    /** PATCH /v1/admin/members/{id}/suspend */
    public function suspend(int $id, Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityScope($request, $request->user());
        if ($communityId === null) {
            $communityId = $this->resolveCommunityIdForMember($id, $request);
        }

        $membershipExists = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->exists();

        if (! $membershipExists) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        $user = User::query()->findOrFail($id);

        DB::transaction(function () use ($id, $communityId, $user) {
            DB::table('community_memberships')
                ->where('user_id', $id)
                ->where('community_id', $communityId)
                ->update(['status' => 'banned', 'updated_at' => now()]);

            app(CommunityLifecycleService::class)->suspendMember($user);
        });

        NotificationService::send(
            $id,
            'warning',
            'Account suspended',
            CommunityLifecycleService::ACCOUNT_SUSPENDED_MESSAGE,
        );

        ActivityLogService::user('member_suspended', "Suspended account of {$user->name}", 'User', $id, 'warning');

        return response()->json(['message' => 'Member suspended']);
    }

    /** DELETE /v1/admin/members/{id} */
    public function destroy(int $id, Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        $membership = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        $user = DB::table('users')->find($id);
        if (! $user) {
            return response()->json(['message' => 'Member not found'], 404);
        }

        DB::table('users')->where('id', $id)->update(['status' => 'deleted', 'deleted_at' => now()]);
        ActivityLogService::user('member_deleted', "Deleted account of {$user->name}", 'User', $id, 'warning');

        return response()->json(['message' => 'Member deleted']);
    }

    private function formatMember(object $member, bool $detailed = false): array
    {
        $membershipStatus = $member->status ?? null;
        if (! $member->membership_id) {
            $membershipStatus = 'onboarding';
        }

        $payload = [
            'id'             => (int) $member->id,
            'name'           => $member->display_name ?: $member->name,
            'email'          => $member->email,
            'phone'          => $member->phone ?? null,
            'account_status' => $member->account_status,
            'status'         => $membershipStatus,
            'role'           => $member->role ?? 'member',
            'community_id'   => $member->community_id ? (int) $member->community_id : null,
            'community_name' => $member->community_name ?? null,
            'membership_id'  => $member->membership_id ? (int) $member->membership_id : null,
            'rejection_reason' => $member->rejection_reason ?? null,
            'rejected_by'      => $member->rejected_by ?? null,
            'unit_number'    => $member->unit_number,
            'avatar_url'     => $this->resolveMediaUrl($member->avatar_url ?? null),
            'display_name'   => $member->display_name,
            'utility_bill_url' => $this->resolveMediaUrl($member->utility_bill_url ?? null),
            'created_at'     => $member->created_at,
        ];

        if ($detailed) {
            $payload['phone'] = $member->phone ?? null;
            $payload['bio'] = $member->bio ?? null;
            $payload['residence_type'] = $member->residence_type ?? null;
            $payload['updated_at'] = $member->updated_at ?? null;
        }

        return $payload;
    }

    private function memberStatsAll(bool $residentsOnly = false): array
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->select('cm.status', DB::raw('count(*) as total'))
            ->whereNotIn('users.role', ['system_admin', 'admin', 'guest'])
            ->where('cm.role', '!=', 'guest')
            ->where('users.status', '!=', 'deleted');

        if ($residentsOnly) {
            $query->where('cm.role', 'member')->where('users.role', 'resident');
        }

        $rows = $query->groupBy('cm.status')->pluck('total', 'status');

        $onboarding = (int) DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted')
            ->whereNotExists(function ($sub) {
                $sub->from('community_memberships as cm_all')
                    ->whereColumn('cm_all.user_id', 'users.id');
            })
            ->count();

        $approved = (int) ($rows['approved'] ?? 0);
        $pending  = (int) $this->countVisiblePendingMemberships(null, $residentsOnly);
        $banned   = (int) ($rows['banned'] ?? 0);
        $rejected = (int) ($rows['rejected'] ?? 0);
        $total    = $approved + $pending + $banned + $rejected + $onboarding;

        return [
            'total'      => $total,
            'approved'   => $approved,
            'pending'    => $pending,
            'banned'     => $banned,
            'rejected'   => $rejected,
            'onboarding' => $onboarding,
        ];
    }

    private function memberStats(int $communityId, bool $residentsOnly = false): array
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->select('cm.status', DB::raw('count(*) as total'))
            ->where('cm.community_id', $communityId)
            ->whereNotIn('users.role', ['system_admin', 'admin', 'guest'])
            ->where('cm.role', '!=', 'guest')
            ->where('users.status', '!=', 'deleted');

        if ($residentsOnly) {
            $query->where('cm.role', 'member')->where('users.role', 'resident');
        }

        $rows = $query->groupBy('cm.status')->pluck('total', 'status');

        $onboarding = (int) DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted')
            ->whereNotExists(function ($sub) {
                $sub->from('community_memberships as cm_all')
                    ->whereColumn('cm_all.user_id', 'users.id');
            })
            ->count();

        $approved = (int) ($rows['approved'] ?? 0);
        $pending  = (int) $this->countVisiblePendingMemberships($communityId, $residentsOnly);
        $banned   = (int) ($rows['banned'] ?? 0);
        $rejected = (int) ($rows['rejected'] ?? 0);
        $total    = $approved + $pending + $banned + $rejected + $onboarding;

        return [
            'total'      => $total,
            'approved'   => $approved,
            'pending'    => $pending,
            'banned'     => $banned,
            'rejected'   => $rejected,
            'onboarding' => $onboarding,
        ];
    }

    /** Pending memberships visible to community admins (excludes head-awaiting joiners). */
    private function countVisiblePendingMemberships(?int $communityId, bool $residentsOnly = false): int
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.status', 'pending')
            ->whereNotIn('users.role', ['system_admin', 'admin', 'guest'])
            ->where('cm.role', '!=', 'guest')
            ->where('users.status', '!=', 'deleted');

        if ($communityId) {
            $query->where('cm.community_id', $communityId);
        }

        if ($residentsOnly) {
            $query->where('cm.role', 'member')->where('users.role', 'resident');
        }

        $this->excludeAwaitingFamilyHeadJoiners($query);

        return (int) $query->count();
    }

    /** Exclude Complete Profile joiners still waiting on family head approval. */
    private function excludeAwaitingFamilyHeadJoiners($query): void
    {
        $query->whereNotExists(function ($sub) {
            $sub->from('family_join_requests as fjr')
                ->join('families', 'families.id', '=', 'fjr.family_id')
                ->whereColumn('fjr.requester_user_id', 'users.id')
                ->whereColumn('families.community_id', 'cm.community_id')
                ->where('fjr.status', 'pending');
        });
    }

    /** @return int|null null = platform-wide (system admin only) */
    private function resolveCommunityScope(Request $request, $user): ?int
    {
        if ($request->input('community_id') === 'all') {
            if (! AdminRoleService::isSystemAdmin($user)) {
                abort(403, 'Community admins can only view their own community.');
            }

            return null;
        }

        return AdminRoleService::resolveAdminCommunityScope($user, $request);
    }

    private function resolveCommunityIdForMember(int $userId, Request $request): int
    {
        $actor = $request->user();

        if (AdminRoleService::isSystemAdmin($actor)) {
            if ($request->filled('community_id') && $request->input('community_id') !== 'all') {
                $id = (int) $request->community_id;
                if (
                    $id > 0
                    && DB::table('community_memberships')->where('user_id', $userId)->where('community_id', $id)->exists()
                ) {
                    return $id;
                }
            }

            $membership = DB::table('community_memberships')
                ->where('user_id', $userId)
                ->orderByDesc('updated_at')
                ->first();

            if (! $membership) {
                abort(404, 'Member not found in any community');
            }

            return (int) $membership->community_id;
        }

        $communityId = AdminRoleService::requireManagedCommunityId($actor, $request);

        $exists = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->exists();

        if (! $exists) {
            abort(404, 'Member not found in this community');
        }

        return $communityId;
    }

    private function resolveMediaUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return url($url);
    }
}
