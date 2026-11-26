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
use App\Services\ResidentInviteLookupService;
use App\Services\ResidentInviteService;
use App\Services\UnitAssignmentService;
use App\Models\CommunityMembership;
use App\Services\MemberLifecycleStatus;
use App\Services\MemberWelcomeNotification;
use App\Services\NotificationService;
use App\Support\ActivityActionCatalog;
use App\Support\Landlord\UnitOwnershipOccupancy;
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
                'cm.invite_code_used',
                'cm.rejection_reason',
                'cm.rejected_by',
                DB::raw("COALESCE(cm.community_id, {$communityId}) as community_id"),
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.residence_type',
                'profiles.utility_bill_url',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
            )
            ->where('users.status', '!=', 'deleted')
            ->where(function ($q) use ($communityId) {
                $q->whereNotNull('cm.id')
                    ->orWhere(function ($q2) use ($communityId) {
                        $q2->where('users.role', 'resident')
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
                MemberLifecycleStatus::applyInvitationSentAudience($query, 'users', $communityId);
                $query->whereExists(function ($sub) use ($communityId) {
                    MemberLifecycleStatus::invitationSentInviteSubquery($sub, 'users', $communityId);
                });
            } elseif ($request->status === MemberLifecycleStatus::ONBOARDING) {
                $query->where(function ($q) use ($communityId) {
                    $q->where(function ($pre) use ($communityId) {
                        $pre->whereNull('cm.id');
                        MemberLifecycleStatus::applyStartedSignup($pre);
                        MemberLifecycleStatus::applyNoAssignedUnusedInvite($pre, 'users', $communityId);
                        $pre->whereNotExists(function ($sub) use ($communityId) {
                            $sub->from('community_memberships as cm_other')
                                ->whereColumn('cm_other.user_id', 'users.id')
                                ->where('cm_other.community_id', '!=', $communityId);
                        });
                        $pre->whereNotExists(function ($sub) use ($communityId) {
                            $sub->from('invite_codes')
                                ->whereColumn('invite_codes.invited_user_id', 'users.id')
                                ->where('invite_codes.community_id', $communityId)
                                ->whereNotNull('invite_codes.rejected_at')
                                ->whereNull('invite_codes.deleted_at');
                        });
                    })->orWhere(function ($post) {
                        $post->where('cm.status', 'pending')
                            ->whereNotNull('cm.invite_code_used');
                        MemberLifecycleStatus::applyInviteMembershipOnboardingScope($post);
                    });
                });
            } elseif ($request->status === 'pending') {
                $query->where('cm.status', 'pending');
                MemberLifecycleStatus::applyPendingApprovalMembershipScope($query);
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

        if ($residentsOnly) {
            $members = $this->paginateAllCommunitiesGroupedByResident($request, $status, $perPage, $page);

            return response()->json([
                'data' => collect($members->items())->map(function ($row) {
                    $userId = (int) (is_object($row) ? ($row->uid ?? $row->id ?? 0) : $row);

                    return $userId > 0 ? $this->groupedResidentPayload($userId) : null;
                })->filter()->values(),
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

        if ($status === MemberLifecycleStatus::ONBOARDING) {
            $members = $this->paginateAllCommunitiesOnboarding($request, $residentsOnly, $perPage, $page);
        } elseif ($status === MemberLifecycleStatus::INVITATION_SENT) {
            $members = $this->invitationSentRowsQuery($request, $residentsOnly)
                ->orderByDesc('sort_created_at')
                ->paginate($perPage, ['*'], 'page', $page);
        } elseif ($status === null) {
            $members = $this->paginateAllCommunitiesCombined($request, $residentsOnly, $perPage, $page);
        } else {
            $query = $this->membershipRowsQuery($request, $residentsOnly);
            if ($status === 'pending') {
                $query->where('cm.status', 'pending');
                MemberLifecycleStatus::applyPendingApprovalMembershipScope($query);
            } else {
                $query->where('cm.status', $status);
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
                'cm.invite_code_used',
                'cm.rejection_reason',
                'cm.rejected_by',
                'cm.community_id',
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.residence_type',
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
                DB::raw('NULL as invite_code_used'),
                DB::raw('NULL as rejection_reason'),
                DB::raw('NULL as rejected_by'),
                DB::raw('(SELECT ic.community_id FROM invite_codes ic WHERE ic.invited_user_id = users.id AND ic.deleted_at IS NULL ORDER BY ic.id DESC LIMIT 1) as community_id'),
                DB::raw('(SELECT c.name FROM invite_codes ic INNER JOIN communities c ON c.id = ic.community_id WHERE ic.invited_user_id = users.id AND ic.deleted_at IS NULL ORDER BY ic.id DESC LIMIT 1) as community_name'),
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.residence_type',
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
            MemberLifecycleStatus::applyNoAssignedUnusedInvite($query);
        }

        $this->applyMemberSearch($query, $request, includeCommunityName: false);

        return $query;
    }

    private function invitationSentRowsQuery(Request $request, bool $residentsOnly, bool $requireOtherMemberships = false)
    {
        $query = DB::table('invite_codes as ic')
            ->join('users', 'users.id', '=', 'ic.invited_user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'ic.community_id')
            ->leftJoin('community_memberships as cm', function ($join) {
                $join->on('cm.user_id', '=', 'users.id')
                    ->on('cm.community_id', '=', 'ic.community_id');
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
                DB::raw('NULL as membership_id'),
                DB::raw("'member' as role"),
                DB::raw('NULL as status'),
                DB::raw('NULL as invite_code_used'),
                DB::raw('NULL as rejection_reason'),
                DB::raw('NULL as rejected_by'),
                'ic.community_id as community_id',
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.residence_type',
                'profiles.utility_bill_url',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
                'ic.created_at as sort_created_at',
            )
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->whereNull('ic.deleted_at')
            ->whereNull('cm.id')
            ->whereRaw('ic.id = (select max(ic2.id) from invite_codes ic2 where ic2.invited_user_id = ic.invited_user_id and ic2.community_id = ic.community_id and ic2.deleted_at is null)')
            ->where(function ($q) {
                $q->whereNotNull('ic.rejected_at')
                    ->orWhere(function ($pending) {
                        $pending->whereNull('ic.rejected_at')
                            ->where(function ($uses) {
                                $uses->whereNull('ic.max_uses')
                                    ->orWhereColumn('ic.used_count', '<', 'ic.max_uses');
                            })
                            ->where(function ($exp) {
                                $exp->whereNull('ic.expires_at')
                                    ->orWhere('ic.expires_at', '>', now());
                            });
                    });
            });

        if ($requireOtherMemberships) {
            $query->whereExists(function ($sub) {
                $sub->from('community_memberships as cm_other')
                    ->whereColumn('cm_other.user_id', 'users.id')
                    ->whereColumn('cm_other.community_id', '!=', 'ic.community_id');
            });
        } else {
            MemberLifecycleStatus::applyInvitationSentAudience($query, 'users', null);
        }

        $this->excludePlatformAdminsScope($query);
        $this->applyResidentsOnlyScope($query, $residentsOnly);
        $this->applyMemberSearch($query, $request, includeCommunityName: true);

        return $query;
    }

    private function paginateAllCommunitiesOnboarding(
        Request $request,
        bool $residentsOnly,
        int $perPage,
        int $page,
    ): LengthAwarePaginator {
        $preMembership = $this->onboardingUsersQuery($request, $residentsOnly, MemberLifecycleStatus::ONBOARDING);
        $membershipOnboarding = $this->membershipRowsQuery($request, $residentsOnly);
        $membershipOnboarding->where('cm.status', 'pending')
            ->whereNotNull('cm.invite_code_used');
        MemberLifecycleStatus::applyInviteMembershipOnboardingScope($membershipOnboarding);

        $union = $preMembership->unionAll($membershipOnboarding);

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

    private function paginateAllCommunitiesCombined(
        Request $request,
        bool $residentsOnly,
        int $perPage,
        int $page,
    ): LengthAwarePaginator {
        $membershipQuery = $this->membershipRowsQuery($request, $residentsOnly);
        $onboardingQuery = $this->onboardingUsersQuery($request, $residentsOnly);
        $invitationQuery = $this->invitationSentRowsQuery($request, $residentsOnly, requireOtherMemberships: true);
        $union = $membershipQuery->unionAll($onboardingQuery)->unionAll($invitationQuery);

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

    /**
     * System Admin Residents directory: one row per person across every community.
     */
    private function paginateAllCommunitiesGroupedByResident(
        Request $request,
        ?string $status,
        int $perPage,
        int $page,
    ): LengthAwarePaginator {
        $parts = [];

        if (
            $status === null
            || ! in_array($status, [MemberLifecycleStatus::ONBOARDING, MemberLifecycleStatus::INVITATION_SENT], true)
        ) {
            $membership = $this->membershipRowsQuery($request, true);
            if ($status === 'pending') {
                $membership->where('cm.status', 'pending');
                MemberLifecycleStatus::applyPendingApprovalMembershipScope($membership);
            } elseif ($status !== null) {
                $membership->where('cm.status', $status);
            }
            $parts[] = (clone $membership)->select('users.id as uid', 'cm.created_at as sort_at');
        }

        if ($status === null || $status === MemberLifecycleStatus::ONBOARDING) {
            $preMembership = $this->onboardingUsersQuery(
                $request,
                true,
                $status === MemberLifecycleStatus::ONBOARDING ? MemberLifecycleStatus::ONBOARDING : null,
            );
            $parts[] = (clone $preMembership)->select('users.id as uid', 'users.created_at as sort_at');

            if ($status === MemberLifecycleStatus::ONBOARDING) {
                $membershipOnboarding = $this->membershipRowsQuery($request, true);
                $membershipOnboarding->where('cm.status', 'pending')->whereNotNull('cm.invite_code_used');
                MemberLifecycleStatus::applyInviteMembershipOnboardingScope($membershipOnboarding);
                $parts[] = (clone $membershipOnboarding)->select('users.id as uid', 'cm.created_at as sort_at');
            }
        }

        if ($status === null || $status === MemberLifecycleStatus::INVITATION_SENT) {
            $invites = $this->invitationSentRowsQuery(
                $request,
                true,
                requireOtherMemberships: $status === null,
            );
            $parts[] = (clone $invites)->select('users.id as uid', 'ic.created_at as sort_at');
        }

        $union = array_shift($parts);
        if (! $union) {
            return new LengthAwarePaginator([], 0, $perPage, $page, [
                'path' => $request->url(),
                'query' => $request->query(),
            ]);
        }
        foreach ($parts as $part) {
            $union->unionAll($part);
        }

        $grouped = DB::query()
            ->fromSub($union, 'resident_ids')
            ->select('uid', DB::raw('MAX(sort_at) as sort_at'))
            ->groupBy('uid');

        $total = (int) DB::query()->fromSub($grouped, 'resident_dir')->count();
        $items = DB::query()
            ->fromSub($grouped, 'resident_dir')
            ->orderByDesc('sort_at')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get();

        return new LengthAwarePaginator($items, $total, $perPage, $page, [
            'path' => $request->url(),
            'query' => $request->query(),
        ]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function groupedResidentPayload(int $userId, bool $detailed = false): ?array
    {
        if ($userId < 1) {
            return null;
        }

        $memberships = DB::table('community_memberships as cm')
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
                'users.updated_at',
                'cm.id as membership_id',
                'cm.role',
                'cm.status',
                'cm.invite_code_used',
                'cm.rejection_reason',
                'cm.rejected_by',
                'cm.community_id',
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.avatar_url',
                'profiles.display_name',
                'profiles.bio',
                'profiles.residence_type',
                'profiles.utility_bill_url',
                MemberLifecycleStatus::pendingInviteCountSelect(),
                MemberLifecycleStatus::authTokenCountSelect(),
            )
            ->where('users.id', $userId)
            ->where('users.status', '!=', 'deleted')
            ->where('cm.role', '!=', 'guest')
            ->orderByRaw("CASE cm.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 WHEN 'banned' THEN 2 WHEN 'rejected' THEN 3 WHEN 'inactive' THEN 4 ELSE 5 END")
            ->orderByDesc('cm.updated_at')
            ->get();

        $communityRows = $memberships->all();
        if ($communityRows === []) {
            $inviteRows = $this->invitationSentRowsQuery(request(), true)
                ->where('users.id', $userId)
                ->orderByDesc('ic.id')
                ->get();
            if ($inviteRows->isEmpty()) {
                $onboarding = $this->onboardingUsersQuery(request(), true)
                    ->where('users.id', $userId)
                    ->first();
                if (! $onboarding) {
                    return null;
                }
                $communityRows = [$onboarding];
            } else {
                $communityRows = $inviteRows->all();
            }
        }

        $communities = [];
        $flatUnits = [];
        $primary = null;
        foreach ($communityRows as $row) {
            $formatted = $this->formatMember($row, $detailed);
            $communityUnits = [];
            foreach ($formatted['units'] ?? [] as $unit) {
                $unit['community_id'] = $formatted['community_id'];
                $unit['community_name'] = $formatted['community_name'];
                $communityUnits[] = $unit;
                $flatUnits[] = $unit;
            }
            $communities[] = [
                'id' => $formatted['community_id'],
                'name' => $formatted['community_name'],
                'status' => $formatted['status'],
                'membership_id' => $formatted['membership_id'],
                'units' => $communityUnits,
            ];
            if ($primary === null) {
                $primary = $formatted;
            }
        }

        if ($primary === null) {
            return null;
        }

        $communitiesWithUnits = count(array_filter(
            $communities,
            fn (array $community) => ($community['units'] ?? []) !== [],
        ));

        $primary['communities'] = $communities;
        $primary['community_count'] = count($communities);
        $primary['units'] = $flatUnits;
        $primary['unit_number'] = $communitiesWithUnits > 1
            ? null
            : ($flatUnits[0]['unit_number'] ?? $primary['unit_number'] ?? null);

        if (count($communities) > 1) {
            $displayCommunity = $this->pickGroupedResidentDisplayCommunity($communities);
            if ($displayCommunity !== null) {
                $primary['status'] = $displayCommunity['status'];
                $primary['community_id'] = $displayCommunity['id'];
                $primary['community_name'] = $displayCommunity['name'];
                $primary['membership_id'] = $displayCommunity['membership_id'];
            }
        }

        if ($detailed) {
            $profile = DB::table('users')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('users.id', $userId)
                ->select('users.updated_at', 'profiles.bio', 'profiles.residence_type', 'profiles.utility_bill_url')
                ->first();
            if ($profile) {
                $primary['bio'] = $profile->bio ?? $primary['bio'] ?? null;
                $primary['updated_at'] = $profile->updated_at ?? $primary['updated_at'] ?? null;
                $primary['residence_type'] = $primary['residence_type'] ?? $profile->residence_type;
                if (empty($primary['utility_bill_url'])) {
                    $primary['utility_bill_url'] = $this->resolveMediaUrl($profile->utility_bill_url ?? null);
                }
            }
        }

        if (($primary['role'] ?? 'member') === 'member' && $userId > 0) {
            $primary['occupancy_kind'] = $this->resolveOccupancyKindForMember((object) [
                'id' => $userId,
                'community_id' => $primary['community_id'] ?? null,
                'role' => 'member',
            ]);
        }

        return $primary;
    }

    /**
     * @param  list<array{id: int|null, name: string|null, status: string, membership_id: int|null, units: list<mixed>}>  $communities
     * @return array{id: int|null, name: string|null, status: string, membership_id: int|null, units: list<mixed>}|null
     */
    private function pickGroupedResidentDisplayCommunity(array $communities): ?array
    {
        if ($communities === []) {
            return null;
        }

        $priority = [
            MemberLifecycleStatus::ONBOARDING => 0,
            'pending' => 1,
            MemberLifecycleStatus::INVITATION_SENT => 2,
            MemberLifecycleStatus::INVITE_REJECTED => 3,
            'rejected' => 4,
            'banned' => 5,
            'inactive' => 6,
            'not_invited' => 7,
            'approved' => 8,
        ];

        $best = null;
        $bestRank = PHP_INT_MAX;
        foreach ($communities as $community) {
            $status = (string) ($community['status'] ?? 'approved');
            $rank = $priority[$status] ?? 50;
            if ($rank < $bestRank) {
                $bestRank = $rank;
                $best = $community;
            }
        }

        return $best ?? $communities[0];
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
        if ($communityId === null && AdminRoleService::isSystemAdmin($request->user())) {
            $grouped = $this->groupedResidentPayload($id, detailed: true);
            if ($grouped) {
                return response()->json(['data' => $grouped]);
            }
        }
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
        $this->constrainMemberActivityToCommunity($query, $id, $communityId);
        $request->attributes->set('activity_community_locked', true);
        $logs->applyFilters($query, $request);
        $perPage = min((int) $request->input('per_page', 25), 100);
        $result = $query->paginate($perPage);
        $payload = $logs->present($result);
        $units = $this->memberUnitsBrief($member, detailed: false);

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
                    'unit_number'  => $units[0]['unit_number'] ?? null,
                    'units'        => $units,
                    'community_id' => (int) $member->community_id,
                ],
            ],
        ]);
    }

    /** GET /v1/admin/members/invite-lookup */
    public function inviteLookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'community_id' => ['nullable', 'integer', 'exists:communities,id'],
        ]);

        $communityId = isset($validated['community_id']) ? (int) $validated['community_id'] : null;
        if ($communityId === null && ! AdminRoleService::isSystemAdmin($request->user())) {
            $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        } elseif ($communityId !== null && ! AdminRoleService::isSystemAdmin($request->user())) {
            AdminRoleService::assertCanManageCommunity($request->user(), $communityId);
        }

        $data = app(ResidentInviteLookupService::class)->lookup(
            (string) $validated['email'],
            $communityId,
        );

        return response()->json(['data' => $data]);
    }

    /** POST /v1/admin/members/invite */
    public function invite(Request $request): JsonResponse
    {
        $request->validate([
            'name'         => ['required', 'string', 'max:25', 'regex:/^[\p{L} .]+$/u'],
            'email'        => 'required|email',
            'phone'        => 'required|string|max:30',
            'role'         => 'in:member,moderator,admin',
            // Legacy single unit — still accepted. Prefer `units` for multi-unit invites.
            'unit_number'  => [
                'nullable',
                'string',
                'max:20',
                static function (string $attribute, mixed $value, \Closure $fail): void {
                    if ($value === null || $value === '') {
                        return;
                    }
                    if (! is_string($value)) {
                        $fail('Please enter a valid Unit / Apartment number.');
                        return;
                    }
                    if (! preg_match('/^[A-Za-z0-9 \/\\-]{1,20}$/', $value)) {
                        $fail('Please enter a valid Unit / Apartment number.');
                    }
                },
            ],
            'units' => 'nullable|array|max:20',
            'units.*' => [
                'string',
                'max:20',
                static function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || ! preg_match('/^[A-Za-z0-9 \/\\-]{1,20}$/', $value)) {
                        $fail('Please enter a valid Unit / Apartment number.');
                    }
                },
            ],
            'community_id' => 'integer',
        ], [
            'name.max' => 'Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.',
            'name.regex' => 'Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.',
            'unit_number.max' => 'Please enter a valid Unit / Apartment number.',
            'units.max' => 'You can assign up to 20 units.',
        ]);

        $unitNumbers = [];
        if ($request->filled('units') && is_array($request->input('units'))) {
            foreach ($request->input('units') as $u) {
                $trimmed = trim((string) $u);
                if ($trimmed !== '') {
                    $unitNumbers[] = $trimmed;
                }
            }
        }
        if ($unitNumbers === [] && $request->filled('unit_number')) {
            $unitNumbers[] = trim((string) $request->unit_number);
        }
        $actor = $request->user();
        $systemAdminInvite = AdminRoleService::isSystemAdmin($actor);
        if ($unitNumbers === [] && ! $systemAdminInvite) {
            throw ValidationException::withMessages([
                'units' => ['Select at least one unit.'],
            ]);
        }
        $primaryUnitNumber = $unitNumbers[0] ?? '';

        $phone = PhoneNormalizer::accept($request->phone);
        if (! $phone) {
            throw ValidationException::withMessages([
                'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
            ]);
        }

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        if (AdminRoleService::isSystemAdmin($request->user())) {
            $existingUser = ContactIdentityService::findUserByEmail((string) $request->email);
            if ($existingUser) {
                $inactiveMembership = DB::table('community_memberships')
                    ->where('user_id', $existingUser->id)
                    ->where('community_id', $communityId)
                    ->where('status', 'inactive')
                    ->first();

                if ($inactiveMembership) {
                    $sent = app(ResidentInviteService::class)->send(
                        $request->user(),
                        $communityId,
                        (string) $request->name,
                        (string) $request->email,
                        $phone,
                        $primaryUnitNumber,
                        null,
                        (string) ($request->role ?? 'member'),
                    );
                    $this->assignInviteUnits((int) ($sent['id'] ?? 0), $communityId, $unitNumbers);

                    return response()->json([
                        'data' => $sent,
                        'message' => 'Existing member reactivated successfully.',
                    ], 201);
                }

                $blockingMembership = DB::table('community_memberships')
                    ->where('user_id', $existingUser->id)
                    ->where('community_id', $communityId)
                    ->whereIn('status', ['approved', 'pending', 'banned', 'not_invited'])
                    ->exists();
                if ($blockingMembership) {
                    throw ValidationException::withMessages([
                        'email' => ['This resident already belongs to this community.'],
                    ]);
                }
            } else {
                ContactIdentityService::assertAvailableForRegistration($request->email, $phone);
            }
        }

        $sent = app(ResidentInviteService::class)->send(
            $request->user(),
            $communityId,
            (string) $request->name,
            (string) $request->email,
            $phone,
            $primaryUnitNumber,
            null,
            (string) ($request->role ?? 'member'),
        );
        $this->assignInviteUnits((int) ($sent['id'] ?? 0), $communityId, $unitNumbers);

        return response()->json([
            'data' => $sent,
            'message' => ($sent['reactivated'] ?? false)
                ? 'Existing member reactivated successfully.'
                : (($sent['email_sent'] ?? false)
                    ? 'Member invited successfully. An invitation email was sent.'
                    : 'Member invited successfully. Share the invite code or QR with the resident — the invitation email could not be sent.'),
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

        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:1024',
        ], [
            'file.required' => 'Choose a CSV file to upload.',
            'file.mimes' => 'Upload a CSV file.',
            'file.max' => 'The CSV file must be 1 MB or smaller.',
        ]);

        $contents = (string) file_get_contents($request->file('file')->getRealPath());
        $inspected = app(MemberBatchInviteService::class)->inspect($contents, $communityId);
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
            // Activate requested units first so sync cannot copy another community's
            // profile.unit_number (e.g. Haly Tower 100) into this community.
            try {
                app(\App\Services\UnitRegistrationPackageService::class)
                    ->approvePendingInitialPackagesForUser(
                        (int) $id,
                        (int) $communityId,
                        (int) $request->user()->id,
                    );
            } catch (\Throwable) {
            }
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
            ($membership->status ?? '') === 'inactive' ? 'member_reactivated' : 'member_approved',
            'User',
            $id,
            $membership->status,
            'approved',
            'Status',
            $user->name ?? null,
            $id,
            ['related_item' => $user->name ?? null],
        );
        if (($membership->status ?? '') === 'inactive') {
            NotificationService::send($id, 'success', 'Membership Restored', 'Your community membership has been reactivated. Welcome back!');
        } else {
            NotificationService::send($id, 'success', 'Membership Approved', 'Your membership has been approved. Welcome to the community!');
        }

        if (($membership->status ?? '') !== 'approved') {
            $community = Community::query()->find($communityId);
            $member = User::query()->find($id);
            if ($community && $member) {
                app(LifecycleMailService::class)->residentApproved($member, $community);
            }
            if (($membership->status ?? '') !== 'inactive' && $member instanceof User) {
                $freshMembership = CommunityMembership::query()
                    ->where('user_id', $id)
                    ->where('community_id', $communityId)
                    ->first();
                if ($freshMembership) {
                    MemberWelcomeNotification::sendIfReady($member, $freshMembership);
                }
            }
        }

        return response()->json([
            'message' => ($membership->status ?? '') === 'inactive'
                ? 'Member reactivated'
                : 'Member approved',
        ]);
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

        try {
            app(\App\Services\UnitRegistrationPackageService::class)
                ->rejectPendingInitialPackagesForUser(
                    (int) $id,
                    (int) $communityId,
                    (int) $request->user()->id,
                    $reason,
                );
        } catch (\Throwable) {
        }

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
        $communityName = Community::query()->where('id', $communityId)->value('name') ?? 'a community';

        DB::transaction(function () use ($id, $communityId, $user) {
            DB::table('community_memberships')
                ->where('user_id', $id)
                ->where('community_id', $communityId)
                ->update(['status' => 'banned', 'updated_at' => now()]);

            app(CommunityLifecycleService::class)->suspendMember($user->fresh() ?? $user);
        });

        $user->refresh();
        $accountLocked = $user->status === 'suspended';

        NotificationService::send(
            $id,
            'warning',
            $accountLocked ? 'Account suspended' : 'Community access suspended',
            $accountLocked
                ? CommunityLifecycleService::ACCOUNT_SUSPENDED_MESSAGE
                : "Your membership in {$communityName} has been suspended. Your other communities are unchanged.",
        );

        ActivityLogService::recordStatusChange(
            'member_suspended',
            'User',
            $id,
            $previousStatus,
            $accountLocked ? 'suspended' : 'active',
            'Status',
            $user->name,
            $id,
            [
                'related_item' => $user->name,
                'community_id' => $communityId,
            ],
            'warning',
        );

        return response()->json(['message' => 'Member suspended']);
    }

    /** PATCH /v1/admin/members/{id}/deactivate — soft-remove; keeps user + history. */
    public function deactivate(int $id, Request $request): JsonResponse
    {
        return $this->deactivateOrCancelInvitation($id, $request);
    }

    /**
     * Legacy DELETE / POST delete routes — same soft-remove lifecycle (no hard delete).
     * Invitation-only rows still cancel the pending invite.
     */
    public function destroy(int $id, Request $request): JsonResponse
    {
        return $this->deactivateOrCancelInvitation($id, $request);
    }

    private function deactivateOrCancelInvitation(int $id, Request $request): JsonResponse
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

        if (($membership->role ?? '') === 'admin') {
            return response()->json(['message' => 'Community administrators cannot be removed from this list.'], 422);
        }

        if (($membership->status ?? '') === 'inactive') {
            return response()->json(['message' => 'Member is already inactive.']);
        }

        $previousStatus = (string) ($membership->status ?? 'approved');

        DB::transaction(function () use ($id, $communityId, $user) {
            DB::table('community_memberships')
                ->where('user_id', $id)
                ->where('community_id', $communityId)
                ->update([
                    'status' => 'inactive',
                    'updated_at' => now(),
                ]);

            // Keep the user account alive so the same email can rejoin later.
            // If they were suspended via Suspend, restore so login/re-invite works.
            $userModel = User::query()->find($id);
            if ($userModel) {
                app(CommunityLifecycleService::class)->restoreSuspendedMember($userModel);
            }

            app(CommunityBillingService::class)->releaseReservationsForUser($communityId, $id);
            InviteCodeService::cancelPendingInvitesForUser($communityId, $id);
        });

        ActivityLogService::recordStatusChange(
            'member_deactivated',
            'User',
            $id,
            $previousStatus,
            'inactive',
            'Status',
            $user->name,
            $id,
            ['related_item' => $user->name],
            'warning',
        );

        NotificationService::send(
            $id,
            'warning',
            'Membership removed',
            'Your community membership has been deactivated. Contact your community admin if you need access again.',
        );

        return response()->json(['message' => 'Member deactivated']);
    }

    private function formatMember(object $member, bool $detailed = false): array
    {
        $membershipStatus = $member->status ?? null;
        if (! $member->membership_id) {
            $invite = InviteCode::query()
                ->where('invited_user_id', (int) $member->id)
                ->when(
                    $member->community_id,
                    fn ($query) => $query->where('community_id', (int) $member->community_id),
                )
                ->orderByDesc('id')
                ->first();

            $hasPendingInvite = $invite?->isValid() ?? (
                isset($member->pending_invite_count)
                    ? (int) $member->pending_invite_count > 0
                    : InviteCode::query()->pendingForUser((int) $member->id)->exists()
            );

            if ($invite && $invite->isRejected()) {
                $membershipStatus = MemberLifecycleStatus::INVITE_REJECTED;
            } elseif ($hasPendingInvite) {
                $membershipStatus = MemberLifecycleStatus::INVITATION_SENT;
            } else {
                $membershipStatus = MemberLifecycleStatus::ONBOARDING;
            }
        } elseif (
            $membershipStatus === 'pending'
            && filled($member->invite_code_used ?? null)
            && MemberLifecycleStatus::inviteMembershipIsOnboarding($member)
        ) {
            $membershipStatus = MemberLifecycleStatus::ONBOARDING;
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
            'units'          => $this->memberUnitsBrief($member, detailed: false),
            'occupancy_kind' => ($member->role ?? 'member') === 'member'
                ? $this->resolveOccupancyKindForMember($member)
                : null,
            'avatar_url'     => $this->resolveMediaUrl($member->avatar_url ?? null),
            'display_name'   => $member->display_name,
            'utility_bill_url' => $this->resolveMediaUrl($member->utility_bill_url ?? null),
            'created_at'     => $member->created_at,
        ];
        $payload['unit_number'] = $payload['units'][0]['unit_number'] ?? null;

        if ($detailed) {
            $payload['units'] = $this->memberUnitsBrief($member, detailed: true);
            $payload['occupancy_kind'] = ($member->role ?? 'member') === 'member'
                ? $this->resolveOccupancyKindForMember($member)
                : null;
            $payload['unit_number'] = $payload['units'][0]['unit_number'] ?? $payload['unit_number'];
            $payload['phone'] = $member->phone ?? null;
            $payload['bio'] = $member->bio ?? null;
            $payload['residence_type'] = $member->residence_type ?? null;
            $payload['updated_at'] = $member->updated_at ?? null;

            if (in_array($membershipStatus, [MemberLifecycleStatus::INVITATION_SENT, MemberLifecycleStatus::INVITE_REJECTED], true)) {
                $invite = InviteCode::query()
                    ->where('invited_user_id', (int) $member->id)
                    ->when(
                        $member->community_id,
                        fn ($query) => $query->where('community_id', (int) $member->community_id),
                    )
                    ->orderByDesc('id')
                    ->first();

                if ($invite) {
                    $payload['invite_code'] = $invite->code;
                    $payload['invite_code_expires_at'] = $invite->expires_at?->toIso8601String();
                    $payload['invite_rejected_at'] = $invite->rejected_at?->toIso8601String();
                }
            }
        }

        return $payload;
    }

    private function memberStatsAll(bool $residentsOnly = false, ?Request $request = null): array
    {
        $statusCount = $residentsOnly
            ? 'count(distinct users.id)'
            : 'count(*)';
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->select('cm.status', DB::raw($statusCount.' as total'))
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
        $pendingApproval = MemberLifecycleStatus::countPendingApprovalMemberships(null, $search, $residentsOnly);

        $stats = $this->composeMemberStats(
            $rows,
            MemberLifecycleStatus::countOnboarding(null, $search),
            MemberLifecycleStatus::countInvitationSent(null, $search),
            0,
            $pendingApproval,
        );

        if ($residentsOnly && $request) {
            $stats['total'] = $this->paginateAllCommunitiesGroupedByResident($request, null, 1, 1)->total();
        }

        return $stats;
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
        $pendingApproval = MemberLifecycleStatus::countPendingApprovalMemberships($communityId, $search);

        return $this->composeMemberStats(
            $rows,
            MemberLifecycleStatus::countOnboarding($communityId, $search),
            MemberLifecycleStatus::countInvitationSent($communityId, $search),
            0,
            $pendingApproval,
        );
    }

    /**
     * Same status buckets as formatMember(): membership status, plus
     * invitation_sent / onboarding for residents who have not joined yet.
     */
    private function composeMemberStats(
        $rows,
        int $onboarding,
        int $invitationSent,
        int $onboardingPendingMemberships = 0,
        ?int $pendingApproval = null,
    ): array {
        $approved = (int) ($rows['approved'] ?? 0);
        $pending  = $pendingApproval ?? max(0, (int) ($rows['pending'] ?? 0) - $onboardingPendingMemberships);
        $banned   = (int) ($rows['banned'] ?? 0);
        $rejected = (int) ($rows['rejected'] ?? 0);
        $inactive = (int) ($rows['inactive'] ?? 0);
        $notInvited = (int) ($rows['not_invited'] ?? 0);

        return [
            'total'            => $approved + $pending + $banned + $rejected + $inactive + $onboarding + $invitationSent + $notInvited,
            'not_invited'      => $notInvited,
            'approved'         => $approved,
            'pending'          => $pending,
            'banned'           => $banned,
            'rejected'         => $rejected,
            'inactive'         => $inactive,
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
            ->where('invited_user_id', $userId)
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

    /**
     * Community-admin resident activity must not mix homes.
     * Unscoped (null community_id) logs only stay visible when this is the
     * resident's only community — otherwise they leak profile/region changes
     * from another join into this member's timeline.
     */
    private function constrainMemberActivityToCommunity($query, int $userId, int $communityId): void
    {
        $hasOtherCommunity = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', '!=', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();

        $query->where(function ($scope) use ($communityId, $hasOtherCommunity) {
            $scope->where('a.community_id', $communityId);
            if (! $hasOtherCommunity) {
                $scope->orWhereNull('a.community_id');
            }
        });
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

    /** @param  list<string>  $unitNumbers */
    private function assignInviteUnits(int $userId, int $communityId, array $unitNumbers): void
    {
        if ($userId < 1 || $unitNumbers === []) {
            return;
        }

        app(UnitAssignmentService::class)->storeInviteUnitAssignments($communityId, $userId, $unitNumbers);
    }

    /**
     * Admin members table: residencies plus landlord-owned units that are vacant or rented (not live_here).
     *
     * @param  list<array<string, mixed>>  $allUnits
     * @return list<array<string, mixed>>
     */
    private function memberUnitsForAdminList(array $allUnits): array
    {
        $portfolio = array_values(array_filter(
            $allUnits,
            function (array $row): bool {
                if (($row['association_status'] ?? '') !== 'ownership') {
                    return false;
                }

                $ownershipStatus = strtolower((string) ($row['ownership_status'] ?? 'approved'));
                if ($ownershipStatus !== 'approved') {
                    return false;
                }

                return UnitOwnershipOccupancy::qualifiesForLandlordDashboard($row['occupancy'] ?? null);
            },
        ));

        $active = array_values(array_filter(
            $allUnits,
            fn (array $row) => ($row['association_status'] ?? 'active') === UnitAssignmentService::RESIDENT_ACTIVE,
        ));
        if ($active !== []) {
            $residentUnitIds = [];
            foreach ($active as $row) {
                $unitId = (int) ($row['id'] ?? 0);
                if ($unitId > 0) {
                    $residentUnitIds[$unitId] = true;
                }
            }
            $merged = $active;
            foreach ($portfolio as $row) {
                $unitId = (int) ($row['id'] ?? 0);
                if ($unitId > 0 && isset($residentUnitIds[$unitId])) {
                    continue;
                }
                $merged[] = $row;
            }

            return $merged;
        }

        // Pending join / unit requests are reviewed in Unit Requests — never listed here.
        return $portfolio;
    }

    /** @return 'resident'|'landlord'|'member' */
    private function resolveOccupancyKindForMember(object $member): string
    {
        $userId = (int) ($member->id ?? 0);
        $communityId = isset($member->community_id) ? (int) $member->community_id : 0;
        if ($userId < 1 || $communityId < 1) {
            return 'member';
        }

        $user = User::query()->find($userId);
        if (! $user) {
            return 'member';
        }

        $allUnits = app(UnitAssignmentService::class)->userUnitsBrief($user, $communityId);

        $hasLandlordPortfolio = collect($allUnits)->contains(function (array $row): bool {
            if (($row['association_status'] ?? '') !== 'ownership') {
                return false;
            }
            if (strtolower((string) ($row['ownership_status'] ?? '')) !== 'approved') {
                return false;
            }

            return UnitOwnershipOccupancy::qualifiesForLandlordDashboard($row['occupancy'] ?? null);
        });
        if ($hasLandlordPortfolio) {
            return 'landlord';
        }

        $hasActive = collect($allUnits)->contains(
            fn (array $row) => ($row['association_status'] ?? '') === UnitAssignmentService::RESIDENT_ACTIVE,
        );
        if ($hasActive) {
            return 'resident';
        }

        return 'member';
    }

    /**
     * @return list<array{
     *   id: int|null,
     *   unit_number: string,
     *   association_status: string,
     *   is_billing_contact: bool,
     *   residence_type?: string|null,
     *   utility_bill_url?: string|null
     * }>
     */
    private function memberUnitsBrief(object $member, bool $detailed = false): array
    {
        $userId = (int) ($member->id ?? 0);
        $communityId = isset($member->community_id) ? (int) $member->community_id : 0;
        if ($userId < 1 || $communityId < 1) {
            $fallback = trim((string) ($member->unit_number ?? ''));

            return $fallback !== ''
                ? [$this->formatMemberUnitRow(null, $fallback, 'active', false, $member, $detailed)]
                : [];
        }

        $user = User::query()->find($userId);
        if (! $user) {
            $fallback = trim((string) ($member->unit_number ?? ''));

            return $fallback !== ''
                ? [$this->formatMemberUnitRow(null, $fallback, 'active', false, $member, $detailed)]
                : [];
        }

        $allUnits = app(UnitAssignmentService::class)->userUnitsBrief($user, $communityId);

        // List view: active residency, pending join units, or landlord portfolio (vacant / rented only — not live_here).
        if (! $detailed) {
            $units = $this->memberUnitsForAdminList($allUnits);
        } else {
            $units = $allUnits;
        }

        if ($units !== []) {
            return array_map(
                function (array $row) use ($member, $detailed) {
                    $formatted = $this->formatMemberUnitRow(
                        isset($row['id']) ? (int) $row['id'] : null,
                        (string) ($row['unit_number'] ?? ''),
                        (string) ($row['association_status'] ?? 'active'),
                        (bool) ($row['is_billing_contact'] ?? false),
                        $member,
                        $detailed,
                    );
                    $formatted['occupancy'] = $row['occupancy'] ?? null;
                    $formatted['ownership_status'] = $row['ownership_status'] ?? null;
                    if ($detailed) {
                        $formatted['approval_status'] = $row['approval_status'] ?? null;
                    }

                    return $formatted;
                },
                $units,
            );
        }

        // Profile/detail only: invited / join-request units not yet approved for residency.
        if (
            $detailed
            && \Illuminate\Support\Facades\Schema::hasTable('invite_unit_assignments')
        ) {
            $inviteUnits = DB::table('invite_unit_assignments')
                ->where('community_id', $communityId)
                ->where('user_id', $userId)
                ->orderBy('sort_order')
                ->pluck('unit_number')
                ->map(fn ($n) => trim((string) $n))
                ->filter()
                ->values()
                ->all();

            if ($inviteUnits !== []) {
                $membershipStatus = (string) ($member->status ?? '');
                $associationStatus = $membershipStatus === 'pending'
                    ? UnitAssignmentService::RESIDENT_PENDING
                    : 'invite';

                return array_map(
                    fn (string $number) => $this->formatMemberUnitRow(null, $number, $associationStatus, false, $member, $detailed),
                    $inviteUnits,
                );
            }
        }

        // Never fall back to profiles.unit_number — that field is global and
        // belongs to another community when this resident has a second home.
        return [];
    }

    /** @return array<string, mixed> */
    private function formatMemberUnitRow(
        ?int $unitId,
        string $unitNumber,
        string $status,
        bool $isBillingContact,
        object $member,
        bool $detailed,
    ): array {
        $communityIdOnRow = isset($member->community_id) ? (int) $member->community_id : 0;
        $row = [
            'id' => $unitId,
            'unit_number' => $unitNumber,
            'association_status' => $status,
            'is_billing_contact' => $isBillingContact,
            'community_id' => $communityIdOnRow > 0 ? $communityIdOnRow : null,
        ];

        if (! $detailed) {
            return $row;
        }

        $userId = (int) ($member->id ?? 0);
        $communityId = isset($member->community_id) ? (int) $member->community_id : 0;
        $residenceType = null;
        $utilityUrl = null;
        $packageItemId = null;

        $packageId = null;
        if (\Illuminate\Support\Facades\Schema::hasTable('unit_registration_package_items')) {
            $itemQuery = DB::table('unit_registration_package_items as items')
                ->join('unit_registration_packages as packages', 'packages.id', '=', 'items.package_id')
                ->where('packages.user_id', $userId)
                ->where('packages.community_id', $communityId)
                ->orderByRaw("CASE packages.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END")
                ->orderByDesc('items.id');

            if ($unitId) {
                $itemQuery->where(function ($q) use ($unitId, $unitNumber) {
                    $q->where('items.unit_id', $unitId)
                        ->orWhere('items.unit_number', $unitNumber);
                });
            } else {
                $itemQuery->where('items.unit_number', $unitNumber);
            }

            $item = $itemQuery->select(
                'items.residence_type',
                'items.id',
                'packages.id as package_id',
                'packages.status as package_status',
            )->first();
            if ($item) {
                $residenceType = $item->residence_type ?: null;
                $packageItemId = isset($item->id) ? (int) $item->id : null;
                if (($item->package_status ?? '') === 'pending') {
                    $packageId = isset($item->package_id) ? (int) $item->package_id : null;
                }
            }
        }

        if (\Illuminate\Support\Facades\Schema::hasTable('unit_proof_documents')) {
            $proofQuery = DB::table('unit_proof_documents')
                ->where('user_id', $userId)
                ->where('community_id', $communityId)
                ->where('kind', 'utility_bill')
                ->orderByDesc('id');

            if ($packageItemId) {
                $proofQuery->where(function ($q) use ($packageItemId, $unitId) {
                    $q->where('package_item_id', $packageItemId);
                    if ($unitId) {
                        $q->orWhere('unit_id', $unitId);
                    }
                });
            } elseif ($unitId) {
                $proofQuery->where('unit_id', $unitId);
            } else {
                // No unit id or package item — skip ambiguous cross-unit proofs.
                $proofQuery = null;
            }

            $proof = $proofQuery?->value('file_url');
            if ($proof) {
                $utilityUrl = $this->resolveMediaUrl((string) $proof);
            }
        }

        // Profile-level utility_bill_url remains on the member payload for single-unit
        // fallback in the admin UI; do not attach it to every multi-unit row.

        if (! $residenceType) {
            $residenceType = $member->residence_type ?? null;
        }

        $row['residence_type'] = $residenceType;
        $row['utility_bill_url'] = $utilityUrl;
        if ($packageId) {
            $row['package_id'] = $packageId;
        }

        return $row;
    }
}
