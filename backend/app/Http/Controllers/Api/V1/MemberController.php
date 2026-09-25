<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\InviteCode;
use App\Models\User;
use App\Services\ActivityLogQueryService;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Exceptions\BillingException;
use App\Services\CommunityBillingService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\FamilyService;
use App\Services\InviteCodeService;
use App\Services\LifecycleMailService;
use App\Services\MemberBatchInviteService;
use App\Services\ResidentInviteService;
use App\Services\MemberLifecycleStatus;
use App\Services\NotificationService;
use App\Support\ActivityActionCatalog;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Database\UniqueConstraintViolationException;
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

    /**
     * Members/residents module: Community Admin-only accounts stay out of the
     * list and analytics. Include users with an explicit resident role, or a
     * resident membership/profile (cm.role = member).
     */
    private function applyResidentRecordsScope($query, string $usersAlias = 'users', string $cmAlias = 'cm'): void
    {
        $query->where(function ($q) use ($usersAlias, $cmAlias) {
            $q->where("{$usersAlias}.role", 'resident')
                ->orWhere("{$cmAlias}.role", 'member');
        });
    }

    /** Residents tab: only membership rows for residents, not community admins. */
    private function applyResidentsOnlyScope($query, bool $residentsOnly, string $usersAlias = 'users'): void
    {
        if (! $residentsOnly) {
            return;
        }

        $this->applyResidentRecordsScope($query, $usersAlias);
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
                'users.email_verified_at',
                'users.phone_verified_at',
                'users.created_at',
                'cm.id as membership_id',
                'cm.role',
                'cm.status',
                'cm.rejection_reason',
                'cm.rejected_by',
                DB::raw("COALESCE(cm.community_id, {$communityId}) as community_id"),
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
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
                                    ->where('invite_codes.community_id', $communityId)
                                    ->whereNull('invite_codes.deleted_at');
                            });
                    });
            });

        $this->excludePlatformAdminsScope($query);
        $this->excludeGuestMembershipsScope($query);
        $this->applyResidentRecordsScope($query);

        if ($request->filled('status') && $request->status !== 'all') {
            if ($request->status === MemberLifecycleStatus::INVITATION_SENT) {
                $query->whereNull('cm.id');
                MemberLifecycleStatus::applyNotStartedSignup($query);
            } elseif ($request->status === MemberLifecycleStatus::ONBOARDING) {
                $query->whereNull('cm.id');
                MemberLifecycleStatus::applyStartedSignup($query);
            } elseif ($request->status === 'pending') {
                $query->where('cm.status', 'pending');
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

        $this->applyMemberSearch($query, $request, includeCommunityName: false);

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
                'stats'        => $this->memberStats($communityId, $request->input('role') === 'member', $request),
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

        if (in_array($status, [MemberLifecycleStatus::ONBOARDING, MemberLifecycleStatus::INVITATION_SENT], true)) {
            $members = $this->onboardingUsersQuery($request, $residentsOnly, $status)
                ->orderByDesc('users.created_at')
                ->paginate($perPage, ['*'], 'page', $page);
        } elseif ($status === null) {
            $members = $this->paginateAllCommunitiesCombined($request, $residentsOnly, $perPage, $page);
        } else {
            $query = $this->membershipRowsQuery($request, $residentsOnly);
            $query->where('cm.status', $status);
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
                'stats'        => $this->memberStatsAll($residentsOnly, $request),
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
                'users.email_verified_at',
                'users.phone_verified_at',
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
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
                'cm.created_at as sort_created_at',
            )
            ->where('users.status', '!=', 'deleted');

        $this->excludePlatformAdminsScope($query);
        $this->excludeGuestMembershipsScope($query);
        $this->applyResidentsOnlyScope($query, $residentsOnly);
        $this->applyMemberSearch($query, $request, includeCommunityName: true);

        return $query;
    }

    private function onboardingUsersQuery(Request $request, bool $residentsOnly, ?string $preMembershipStatus = null)
    {
        $query = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.email_verified_at',
                'users.phone_verified_at',
                'users.created_at',
                DB::raw('NULL as membership_id'),
                DB::raw("'member' as role"),
                DB::raw('NULL as status'),
                DB::raw('NULL as rejection_reason'),
                DB::raw('NULL as rejected_by'),
                DB::raw('(SELECT ic.community_id FROM invite_codes ic WHERE ic.invited_user_id = users.id AND ic.deleted_at IS NULL ORDER BY ic.id DESC LIMIT 1) as community_id'),
                DB::raw('(SELECT c.name FROM invite_codes ic INNER JOIN communities c ON c.id = ic.community_id WHERE ic.invited_user_id = users.id AND ic.deleted_at IS NULL ORDER BY ic.id DESC LIMIT 1) as community_name'),
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
                'users.created_at as sort_created_at',
            )
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->whereNotExists(function ($sub) {
                $sub->from('community_memberships as cm_all')
                    ->whereColumn('cm_all.user_id', 'users.id');
            })
            ->where(function ($q) {
                $q->whereNotExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNotNull('invite_codes.deleted_at');
                })->orWhereExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNull('invite_codes.deleted_at');
                });
            });

        $this->excludePlatformAdminsScope($query);

        if ($preMembershipStatus === MemberLifecycleStatus::INVITATION_SENT) {
            MemberLifecycleStatus::applyNotStartedSignup($query);
            MemberLifecycleStatus::applyAssignedUnusedInviteExists($query);
        } elseif ($preMembershipStatus === MemberLifecycleStatus::ONBOARDING) {
            $query->where(function ($q) {
                $q->where(function ($started) {
                    MemberLifecycleStatus::applyStartedSignup($started);
                })->orWhere(function ($noInvite) {
                    MemberLifecycleStatus::applyNoAssignedUnusedInvite($noInvite);
                });
            });
        }

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
        MemberLifecycleStatus::applySearch(
            $query,
            $request->filled('search') ? (string) $request->search : null,
            'users',
            $includeCommunityName,
        );
    }

    private function memberSearchTerm(Request $request): ?string
    {
        return $request->filled('search') ? (string) $request->search : null;
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
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.email_verified_at',
                'users.phone_verified_at',
                'users.created_at',
                'users.updated_at',
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
                'profiles.bio',
                'profiles.residence_type',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
            )
            ->where('users.id', $id)
            ->where('cm.community_id', $communityId)
            ->where('users.status', '!=', 'deleted')
            ->first();

        if (! $member) {
            $member = $this->onboardingMemberForShow($id, $communityId);
        }

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
            $member = $this->onboardingMemberForActivity($id, $communityId);
        }

        if (! $member) {
            return response()->json(['message' => 'Member not found'], 404);
        }

        $logs = app(ActivityLogQueryService::class);
        $query = $logs->baseQuery()->where('a.log_type', 'user');
        $logs->constrainToPerson($query, $id);
        $query->where(function ($scope) use ($communityId) {
            $scope->where('a.community_id', $communityId)
                ->orWhereNull('a.community_id');
        });
        $request->attributes->set('activity_community_locked', true);
        $logs->applyFilters($query, $request);
        $perPage = min((int) $request->input('per_page', 25), 100);
        $result = $query->paginate($perPage);
        $payload = $logs->present($result);

        return response()->json([
            'data' => $payload['data'],
            'meta' => [
                'current_page' => $payload['current_page'],
                'last_page'    => $payload['last_page'],
                'per_page'     => $payload['per_page'],
                'total'        => $payload['total'],
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
            'name'         => ['required', 'string', 'max:25', 'regex:/^[\p{L} .]+$/u'],
            'email'        => 'required|email',
            'phone'        => 'required|string|max:30',
            'role'         => 'in:member,moderator,admin',
            'unit_number'  => [
                'required',
                'string',
                'max:20',
                static function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value)) {
                        $fail('Please enter a valid Unit / Apartment number.');
                        return;
                    }
                    if (! preg_match('/^[A-Za-z0-9 \/\\-]{1,20}$/', $value)) {
                        $fail('Please enter a valid Unit / Apartment number.');
                    }
                },
            ],
            'community_id' => 'integer',
        ], [
            'name.max' => 'Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.',
            'name.regex' => 'Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.',
            'unit_number.required' => 'Unit / Apartment is required.',
            'unit_number.max' => 'Please enter a valid Unit / Apartment number.',
        ]);

        $phone = PhoneNormalizer::accept($request->phone);
        if (! $phone) {
            throw ValidationException::withMessages([
                'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
            ]);
        }

        ContactIdentityService::assertAvailableForRegistration($request->email, $phone);

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        if (AdminRoleService::isSystemAdmin($request->user())) {
            return $this->provisionResidentForSystemAdmin($request, $phone, $communityId);
        }

        $sent = app(ResidentInviteService::class)->send(
            $request->user(),
            $communityId,
            (string) $request->name,
            (string) $request->email,
            $phone,
            (string) $request->unit_number,
            null,
            (string) ($request->role ?? 'member'),
        );

        return response()->json([
            'data' => $sent,
            'message' => ($sent['email_sent'] ?? false)
                ? 'Member invited successfully. An invitation email was sent.'
                : 'Member invited successfully. Share the invite code or QR with the resident — the invitation email could not be sent.',
        ], 201);
    }

    /** POST /v1/admin/members/invite-batch/preview */
    public function previewBatch(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reviewedBatch($request)]);
    }

    /** POST /v1/admin/members/invite-batch */
    public function commitBatch(Request $request): JsonResponse
    {
        if (AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Batch upload is available to community admins.'], 403);
        }

        $reviewed = $this->reviewedBatch($request);
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $sender = app(ResidentInviteService::class);
        $sent = [];
        $failed = [];

        foreach ($reviewed['rows'] as $row) {
            if ($row['errors'] !== []) {
                $failed[] = [
                    'row' => $row['row'],
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'errors' => $row['errors'],
                ];
                continue;
            }

            try {
                $result = $sender->prepare(
                    $request->user(),
                    $communityId,
                    $row['name'],
                    $row['email'],
                    $row['phone'],
                    $row['unit'],
                    $row['residence_type'],
                );
                $sent[] = [
                    'row' => $row['row'],
                    'id' => $result['id'],
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'email_sent' => false,
                ];
            } catch (ValidationException|BillingException|\Throwable $e) {
                $failed[] = [
                    'row' => $row['row'],
                    'name' => $row['name'],
                    'email' => $row['email'],
                    'errors' => [ResidentInviteService::failureMessage($e)],
                ];
            }
        }

        return response()->json([
            'data' => [
                'sent_count' => count($sent),
                'failed_count' => count($failed),
                'sent' => $sent,
                'failed' => $failed,
            ],
            'message' => count($sent) === 1
                ? '1 resident added. No invitations were sent.'
                : count($sent).' residents added. No invitations were sent.',
        ]);
    }

    /** @return array{valid_count: int, invalid_count: int, rows: list<array<string, mixed>>} */
    private function reviewedBatch(Request $request): array
    {
        if (AdminRoleService::isSystemAdmin($request->user())) {
            abort(403, 'Batch upload is available to community admins.');
        }

        AdminRoleService::requireManagedCommunityId($request->user(), $request);

        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:1024',
        ], [
            'file.required' => 'Choose a CSV file to upload.',
            'file.mimes' => 'Upload a CSV file.',
            'file.max' => 'The CSV file must be 1 MB or smaller.',
        ]);

        $contents = (string) file_get_contents($request->file('file')->getRealPath());
        $inspected = app(MemberBatchInviteService::class)->inspect($contents);
        $valid = 0;
        $invalid = 0;
        foreach ($inspected['rows'] as $row) {
            if ($row['errors'] === []) {
                $valid++;
            } else {
                $invalid++;
            }
        }

        return [
            'valid_count' => $valid,
            'invalid_count' => $invalid,
            'rows' => $inspected['rows'],
        ];
    }

    /** System admins add residents directly — no invite code or QR onboarding. */
    private function provisionResidentForSystemAdmin(Request $request, string $phone, int $communityId): JsonResponse
    {
        $community = Community::query()->findOrFail($communityId);
        $displayName = trim((string) $request->name);

        try {
            $userId = DB::table('users')->insertGetId([
                'uuid'               => (string) \Illuminate\Support\Str::ulid(),
                'name'               => $displayName,
                'email'              => $request->email,
                'phone'              => $phone,
                'email_verified_at'  => null,
                'phone_verified_at'  => now(),
                'password'           => Hash::make(\Illuminate\Support\Str::random(32)),
                'role'               => 'resident',
                'status'             => 'active',
                'created_at'         => now(),
                'updated_at'         => now(),
            ]);
        } catch (UniqueConstraintViolationException $e) {
            $sql = $e->getMessage();
            if (str_contains($sql, 'users_phone_unique')) {
                ContactIdentityService::failDuplicate('phone', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
            }
            if (str_contains($sql, 'users_email_unique')) {
                ContactIdentityService::failDuplicate('email', ContactIdentityService::DUPLICATE_EMAIL_MESSAGE);
            }

            throw $e;
        }

        DB::table('profiles')->insert([
            'user_id'      => $userId,
            'display_name' => $displayName,
            'unit_number'  => $request->unit_number,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        DB::table('community_memberships')->insert([
            'user_id'      => $userId,
            'community_id' => $communityId,
            'role'         => 'member',
            'status'       => 'approved',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        NotificationService::send(
            $userId,
            'info',
            'Community membership',
            "You have been added to {$community->name}. Sign in to Havena with this email to get started.",
        );

        ActivityLogService::user(
            'member_provisioned',
            "Provisioned resident: {$displayName} ({$request->email})",
            'User',
            $userId,
        );

        $invitee = User::query()->find($userId);
        $emailSent = false;
        if ($invitee) {
            $emailSent = app(LifecycleMailService::class)->residentProvisioned($invitee, $community, true);
        }

        return response()->json([
            'data' => [
                'id'             => $userId,
                'member_name'    => $displayName,
                'member_email'   => $request->email,
                'community_name' => $community->name,
                'email_sent'     => $emailSent,
            ],
            'message' => $emailSent
                ? 'Resident created successfully. A welcome email was sent.'
                : 'Resident created successfully. The welcome email could not be sent — share sign-in instructions manually.',
        ], 201);
    }

    /** POST /v1/admin/members/{id}/resend-invite */
    public function resendInvite(int $id, Request $request): JsonResponse
    {
        $result = $this->sendMemberInvitation($request->user(), $request, $id);
        if (! $result['ok']) {
            return response()->json(['message' => $result['message']], $result['status']);
        }

        return response()->json([
            'message' => 'Invitation email sent.',
            'data' => $result['data'],
        ]);
    }

    /** POST /v1/admin/members/resend-invites */
    public function resendInvites(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'member_ids' => ['required', 'array', 'min:1', 'max:100'],
            'member_ids.*' => ['integer', 'distinct'],
        ]);

        $sent = [];
        $failed = [];

        foreach ($payload['member_ids'] as $memberId) {
            try {
                $result = $this->sendMemberInvitation($request->user(), $request, (int) $memberId);
            } catch (\Throwable $e) {
                $failed[] = $this->invitationFailure(
                    (int) $memberId,
                    $e->getMessage() !== '' ? $e->getMessage() : 'Invitation failed.',
                );
                continue;
            }

            if ($result['ok']) {
                $sent[] = $result['data'];
                continue;
            }

            $failed[] = $this->invitationFailure((int) $memberId, $result['message']);
        }

        $sentCount = count($sent);
        $failedCount = count($failed);

        return response()->json([
            'message' => $this->bulkInvitationResultMessage($sentCount, $failedCount),
            'data' => [
                'sent_count' => $sentCount,
                'failed_count' => $failedCount,
                'sent' => $sent,
                'failed' => $failed,
            ],
        ]);
    }

    /**
     * Same eligibility and delivery path as a single Resend Invite.
     *
     * @return array{ok: bool, status: int, message: string, data: array<string, mixed>|null}
     */
    private function sendMemberInvitation(User $actor, Request $request, int $id): array
    {
        $communityId = AdminRoleService::requireManagedCommunityIdForMember($actor, $request, $id);

        $membership = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->first();
        if ($membership && $membership->status === 'not_invited') {
            return $this->sendPreparedMemberInvitation($actor, $communityId, $id);
        }

        if ($membership) {
            return [
                'ok' => false,
                'status' => 422,
                'message' => 'This resident has already joined the community.',
                'data' => null,
            ];
        }

        $invite = InviteCode::query()
            ->pendingForUser($id)
            ->where('community_id', $communityId)
            ->orderByDesc('id')
            ->first();
        if (! $invite) {
            return [
                'ok' => false,
                'status' => 404,
                'message' => 'No pending invitation found for this resident.',
                'data' => null,
            ];
        }

        $invitee = User::query()->find($id);
        $community = Community::query()->find($communityId);
        if (! $invitee || ! $community) {
            return [
                'ok' => false,
                'status' => 404,
                'message' => 'Invitation not found.',
                'data' => null,
            ];
        }

        $inviter = User::query()->find($invite->created_by) ?: $actor;
        $emailSent = app(LifecycleMailService::class)->residentInvited(
            $invitee,
            $community,
            $invite,
            $inviter,
            resend: true,
        );

        if (! $emailSent) {
            return [
                'ok' => false,
                'status' => 502,
                'message' => 'Could not send the invitation email. Check the resident email address and try again.',
                'data' => null,
            ];
        }

        ActivityLogService::user(
            'member_invite_resent',
            "Resent invitation email to {$invitee->name} ({$invitee->email})",
            'User',
            $id,
        );

        return [
            'ok' => true,
            'status' => 200,
            'message' => 'Invitation email sent.',
            'data' => [
                'id' => $id,
                'name' => $invitee->name,
                'email' => $invitee->email,
                'invite_code' => $invite->code,
                'invite_qr_value' => InviteCodeService::qrPayload($invite->code),
            ],
        ];
    }

    /**
     * First invitation for a resident added by batch upload.
     *
     * @return array{ok: bool, status: int, message: string, data: array<string, mixed>|null}
     */
    private function sendPreparedMemberInvitation(User $actor, int $communityId, int $id): array
    {
        $invitee = User::query()->find($id);
        $community = Community::query()->find($communityId);
        if (! $invitee || ! $community) {
            return [
                'ok' => false,
                'status' => 404,
                'message' => 'Resident not found.',
                'data' => null,
            ];
        }

        $invite = InviteCodeService::createForCommunity(
            communityId: $communityId,
            createdBy: $actor->id,
            maxUses: 1,
            expiresAt: now()->addDays(30),
            invitedUserId: $id,
        );

        DB::table('community_seat_reservations')
            ->where('community_id', $communityId)
            ->where('user_id', $id)
            ->whereNull('invite_code_id')
            ->update([
                'invite_code_id' => $invite->id,
                'expires_at' => $invite->expires_at,
                'updated_at' => now(),
            ]);

        $emailSent = app(LifecycleMailService::class)->residentInvited(
            $invitee,
            $community,
            $invite,
            $actor,
        );

        if (! $emailSent) {
            $invite->delete();

            return [
                'ok' => false,
                'status' => 502,
                'message' => 'Could not send the invitation email. Check the resident email address and try again.',
                'data' => null,
            ];
        }

        DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->where('status', 'not_invited')
            ->delete();

        NotificationService::send(
            $id,
            'info',
            'Community invitation',
            "You have been invited to {$community->name}. Open Havena and enter invite code {$invite->code} or scan your QR invite.",
        );

        ActivityLogService::user(
            'member_invited',
            "Invited new member: {$invitee->name} ({$invitee->email})",
            'User',
            $id,
        );

        return [
            'ok' => true,
            'status' => 200,
            'message' => 'Invitation email sent.',
            'data' => [
                'id' => $id,
                'name' => $invitee->name,
                'email' => $invitee->email,
                'invite_code' => $invite->code,
                'invite_qr_value' => InviteCodeService::qrPayload($invite->code),
            ],
        ];
    }

    /** @return array{id: int, name: string, message: string} */
    private function invitationFailure(int $id, string $message): array
    {
        $name = User::query()->whereKey($id)->value('name');

        return [
            'id' => $id,
            'name' => $name ? (string) $name : 'Resident',
            'message' => $message,
        ];
    }

    private function bulkInvitationResultMessage(int $sent, int $failed): string
    {
        $sentPart = $sent === 1
            ? '1 invitation sent successfully.'
            : "{$sent} invitations sent successfully.";
        $failedPart = $failed === 1
            ? '1 invitation failed.'
            : "{$failed} invitations failed.";

        if ($failed === 0) {
            return $sentPart;
        }
        if ($sent === 0) {
            return $failedPart;
        }

        return "{$sentPart} {$failedPart}";
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
            try {
                app(\App\Services\UnitAssignmentService::class)->syncUserToCommunity($userModel, (int) $communityId);
            } catch (\Throwable) {
            }
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

        ActivityLogService::recordStatusChange(
            'member_approved',
            'User',
            $id,
            $membership->status,
            'approved',
            'Status',
            $user->name ?? null,
            $id,
            ['related_item' => $user->name ?? null],
        );
        NotificationService::send($id, 'success', 'Membership Approved', 'Your membership has been approved. Welcome to the community!');

        if (($membership->status ?? '') !== 'approved') {
            $community = Community::query()->find($communityId);
            $member = User::query()->find($id);
            if ($community && $member) {
                app(LifecycleMailService::class)->residentApproved($member, $community);
            }
        }

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

        ActivityLogService::recordChanges(
            'member_rejected',
            'User',
            $id,
            [
                ['field' => 'Status', 'key' => 'status', 'previous' => $membership->status, 'next' => 'rejected'],
                ['field' => 'Rejection Reason', 'key' => 'rejection_reason', 'previous' => $membership->rejection_reason ?? null, 'next' => $reason],
            ],
            $user->name ?? null,
            $id,
            ['related_item' => $user->name ?? null],
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
            $community = Community::query()->find($communityId);
            if ($community) {
                app(LifecycleMailService::class)->residentRejected($userModel, $community, $reason);
            }
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
        $previousStatus = $user->status;

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

        ActivityLogService::recordStatusChange(
            'member_suspended',
            'User',
            $id,
            $previousStatus,
            'suspended',
            'Status',
            $user->name,
            $id,
            ['related_item' => $user->name],
            'warning',
        );

        return response()->json(['message' => 'Member suspended']);
    }

    /** DELETE /v1/admin/members/{id} */
    public function destroy(int $id, Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityIdForMember($request->user(), $request, $id);

        $membership = DB::table('community_memberships')
            ->where('user_id', $id)
            ->where('community_id', $communityId)
            ->first();

        $pendingInvites = InviteCode::query()
            ->where('community_id', $communityId)
            ->where('invited_user_id', $id)
            ->get();

        if (! $membership && $pendingInvites->isEmpty()) {
            return response()->json(['message' => 'Member not found in this community'], 404);
        }

        $user = DB::table('users')->find($id);
        if (! $user) {
            return response()->json(['message' => 'Member not found'], 404);
        }

        if (! $membership) {
            DB::transaction(function () use ($communityId, $id) {
                InviteCodeService::cancelPendingInvitesForUser($communityId, $id);
                app(CommunityBillingService::class)->releaseReservationsForUser($communityId, $id);
            });

            ActivityLogService::user(
                'member_invite_cancelled',
                "Cancelled onboarding invitation for {$user->name}",
                'User',
                $id,
                'warning',
            );

            return response()->json(['message' => 'Invitation cancelled successfully.']);
        }

        DB::table('users')->where('id', $id)->update(['status' => 'deleted', 'deleted_at' => now()]);
        ActivityLogService::user('member_deleted', "Deleted account of {$user->name}", 'User', $id, 'warning');

        return response()->json(['message' => 'Member deleted']);
    }

    private function formatMember(object $member, bool $detailed = false): array
    {
        $membershipStatus = $member->status ?? null;
        if (! $member->membership_id) {
            $startedSignup = MemberLifecycleStatus::hasStartedSignup(
                $member->email_verified_at ?? null,
                $member->phone_verified_at ?? null,
                isset($member->auth_token_count) && (int) $member->auth_token_count > 0,
            );
            $hasPendingInvite = isset($member->pending_invite_count)
                ? (int) $member->pending_invite_count > 0
                : InviteCode::query()->pendingForUser((int) $member->id)->exists();
            $membershipStatus = MemberLifecycleStatus::statusWithoutMembership($startedSignup, $hasPendingInvite);
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

            if ($membershipStatus === MemberLifecycleStatus::INVITATION_SENT) {
                $invite = InviteCode::query()
                    ->pendingForUser((int) $member->id)
                    ->when(
                        $member->community_id,
                        fn ($query) => $query->where('community_id', (int) $member->community_id),
                    )
                    ->orderByDesc('id')
                    ->first();

                if ($invite) {
                    $payload['invite_code'] = $invite->code;
                    $payload['invite_code_expires_at'] = $invite->expires_at?->toIso8601String();
                }
            }
        }

        return $payload;
    }

    private function memberStatsAll(bool $residentsOnly = false, ?Request $request = null): array
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->select('cm.status', DB::raw('count(*) as total'))
            ->whereNotIn('users.role', ['system_admin', 'admin', 'guest'])
            ->where('cm.role', '!=', 'guest')
            ->where('users.status', '!=', 'deleted');

        if ($residentsOnly) {
            $this->applyResidentRecordsScope($query);
        }

        if ($request) {
            $this->applyMemberSearch($query, $request, includeCommunityName: true);
        }

        $rows = $query->groupBy('cm.status')->pluck('total', 'status');
        $search = $request ? $this->memberSearchTerm($request) : null;

        return $this->composeMemberStats(
            $rows,
            MemberLifecycleStatus::countOnboarding(null, $search),
            MemberLifecycleStatus::countInvitationSent(null, $search),
        );
    }

    private function memberStats(int $communityId, bool $residentsOnly = false, ?Request $request = null): array
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->select('cm.status', DB::raw('count(*) as total'))
            ->where('cm.community_id', $communityId)
            ->whereNotIn('users.role', ['system_admin', 'admin', 'guest'])
            ->where('cm.role', '!=', 'guest')
            ->where('users.status', '!=', 'deleted');

        $this->applyResidentRecordsScope($query);

        if ($request) {
            $this->applyMemberSearch($query, $request, includeCommunityName: false);
        }

        $rows = $query->groupBy('cm.status')->pluck('total', 'status');
        $search = $request ? $this->memberSearchTerm($request) : null;

        return $this->composeMemberStats(
            $rows,
            MemberLifecycleStatus::countOnboarding($communityId, $search),
            MemberLifecycleStatus::countInvitationSent($communityId, $search),
        );
    }

    /**
     * Same status buckets as formatMember(): membership status, plus
     * invitation_sent / onboarding for residents who have not joined yet.
     */
    private function composeMemberStats($rows, int $onboarding, int $invitationSent): array
    {
        $approved = (int) ($rows['approved'] ?? 0);
        $pending  = (int) ($rows['pending'] ?? 0);
        $banned   = (int) ($rows['banned'] ?? 0);
        $rejected = (int) ($rows['rejected'] ?? 0);
        $notInvited = (int) ($rows['not_invited'] ?? 0);

        return [
            'total'            => $approved + $pending + $banned + $rejected + $onboarding + $invitationSent + $notInvited,
            'not_invited'      => $notInvited,
            'approved'         => $approved,
            'pending'          => $pending,
            'banned'           => $banned,
            'rejected'         => $rejected,
            'onboarding'       => $onboarding,
            'invitation_sent'  => $invitationSent,
        ];
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
                    && (
                        DB::table('community_memberships')->where('user_id', $userId)->where('community_id', $id)->exists()
                        || $this->hasOnboardingInvite($userId, $id)
                    )
                ) {
                    return $id;
                }
            }

            $membership = DB::table('community_memberships')
                ->where('user_id', $userId)
                ->orderByDesc('updated_at')
                ->first();

            if ($membership) {
                return (int) $membership->community_id;
            }

            $inviteCommunityId = $this->onboardingInviteCommunityId($userId);
            if ($inviteCommunityId) {
                return $inviteCommunityId;
            }

            abort(404, 'Member not found in any community');
        }

        $communityId = AdminRoleService::requireManagedCommunityId($actor, $request);

        $exists = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->exists()
            || $this->hasOnboardingInvite($userId, $communityId);

        if (! $exists) {
            abort(404, 'Member not found in this community');
        }

        return $communityId;
    }

    private function hasOnboardingInvite(int $userId, int $communityId): bool
    {
        return InviteCode::query()
            ->where('invited_user_id', $userId)
            ->where('community_id', $communityId)
            ->exists();
    }

    private function onboardingInviteCommunityId(int $userId): ?int
    {
        $invite = InviteCode::query()
            ->where('invited_user_id', $userId)
            ->orderByDesc('id')
            ->first();

        return $invite ? (int) $invite->community_id : null;
    }

    private function onboardingMemberForShow(int $userId, int $communityId): ?object
    {
        $invite = InviteCode::query()
            ->pendingForUser($userId)
            ->where('community_id', $communityId)
            ->orderByDesc('id')
            ->first();

        if (! $invite) {
            return null;
        }

        $member = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', function ($join) use ($communityId) {
                $join->where('communities.id', '=', $communityId);
            })
            ->select(
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'users.status as account_status',
                'users.email_verified_at',
                'users.phone_verified_at',
                'users.created_at',
                'users.updated_at',
                DB::raw('NULL as membership_id'),
                DB::raw("'member' as role"),
                DB::raw('NULL as status'),
                DB::raw('NULL as rejection_reason'),
                DB::raw('NULL as rejected_by'),
                DB::raw(((int) $communityId).' as community_id'),
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.utility_bill_url',
                'profiles.bio',
                'profiles.residence_type',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
            )
            ->where('users.id', $userId)
            ->where('users.status', '!=', 'deleted')
            ->first();

        return $member ?: null;
    }

    private function onboardingMemberForActivity(int $userId, int $communityId): ?object
    {
        if (! $this->hasOnboardingInvite($userId, $communityId)) {
            return null;
        }

        $user = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name',
                'profiles.display_name',
                'profiles.unit_number',
            )
            ->where('users.id', $userId)
            ->where('users.status', '!=', 'deleted')
            ->first();

        if (! $user) {
            return null;
        }

        $user->community_id = $communityId;

        return $user;
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
