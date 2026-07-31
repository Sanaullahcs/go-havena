<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\ContactSubmission;
use App\Models\FamilyAddMemberRequest;
use App\Models\Region;
use App\Models\User;
use App\Services\AdminRoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** GET /v1/admin/dashboard/stats */
    public function adminStats(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);

        if ($request->boolean('mobile')) {
            return response()->json(['data' => $this->buildMobileDashboardPayload($communityId)]);
        }

        $reportsQuery = DB::table('reports')->whereNull('deleted_at');
        $listingsQuery = DB::table('listings')->whereNull('deleted_at');
        $noticesQuery = DB::table('notices')->whereNull('deleted_at');
        $postsQuery = DB::table('posts')->whereNull('deleted_at');

        if ($communityId) {
            $reportsQuery->where('community_id', $communityId);
            $listingsQuery->where('community_id', $communityId);
            $noticesQuery->where('community_id', $communityId);
            $postsQuery->where('community_id', $communityId);
        }

        $residentsQuery = $this->residentMembershipQuery($communityId);

        $totalMembers = (clone $residentsQuery)->where('cm.status', 'approved')->count();
        $pendingMembers = (clone $residentsQuery)
            ->where('cm.status', 'pending')
            ->whereNotExists(function ($sub) {
                $sub->from('family_join_requests as fjr')
                    ->join('families', 'families.id', '=', 'fjr.family_id')
                    ->whereColumn('fjr.requester_user_id', 'users.id')
                    ->whereColumn('families.community_id', 'cm.community_id')
                    ->where('fjr.status', 'pending');
            })
            ->count();
        $bannedMembers = (clone $residentsQuery)->where('cm.status', 'banned')->count();
        $onboardingMembers = DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted')
            ->whereNotExists(function ($sub) {
                $sub->from('community_memberships as cm_all')
                    ->whereColumn('cm_all.user_id', 'users.id');
            })
            ->count();
        $openReports = (clone $reportsQuery)->whereIn('status', ['open', 'in_review', 'escalated'])->count();
        $activeListings = (clone $listingsQuery)->where('status', 'approved')->count();
        $pendingListings = (clone $listingsQuery)->where('status', 'pending')->count();
        $businessesQuery = DB::table('businesses')->whereNull('deleted_at');
        if ($communityId) {
            $businessesQuery->where('community_id', $communityId);
        }
        $pendingBusinesses = (clone $businessesQuery)->where('status', 'pending')->count();
        $totalBusinesses = (clone $businessesQuery)->count();
        $publishedNotices = (clone $noticesQuery)
            ->where('status', 'published')
            ->whereNotIn('category', ['event', 'emergency'])
            ->count();
        $totalPosts = (clone $postsQuery)->count();
        $pendingPosts = (clone $postsQuery)->where('status', 'pending')->count();
        $approvedPosts = (clone $postsQuery)->where('status', 'approved')->count();

        $bookingsQuery = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id');
        if ($communityId) {
            $bookingsQuery->where('amenities.community_id', $communityId);
        }
        $pendingBookings = (clone $bookingsQuery)->where('bookings.status', 'pending')->count();

        $communitiesQuery = Community::query();
        if ($communityId) {
            $communitiesQuery->where('id', $communityId);
        }
        $totalCommunities = (clone $communitiesQuery)
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')->orWhere('review_status', 'approved');
            })
            ->count();

        $pendingCommunityRequests = Community::query()
            ->where('review_status', 'pending')
            ->when($communityId, fn ($q) => $q->where('id', $communityId))
            ->count();

        $activeRegions = Region::query()->where('status', 'active')->count();

        $communityAdminBase = DB::table('users')
            ->where('role', 'community_admin')
            ->where('status', '!=', 'deleted');
        $totalCommunityAdmins = (clone $communityAdminBase)->count();
        $pendingCommunityAdmins = (clone $communityAdminBase)->where('community_admin_status', 'pending')->count();
        $approvedCommunityAdmins = (clone $communityAdminBase)->where('community_admin_status', 'approved')->count();
        $rejectedCommunityAdmins = (clone $communityAdminBase)->where('community_admin_status', 'rejected')->count();

        $newContactSubmissions = ContactSubmission::query()->where('status', 'new')->count();
        $totalContactSubmissions = ContactSubmission::query()->count();

        $activityChart = $this->buildDailySeries(
            DB::table('activity_logs')
                ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
                ->where('created_at', '>=', now()->subDays(6)->startOfDay())
                ->groupBy('day')
                ->pluck('count', 'day'),
            7,
            'count',
        );

        $memberGrowthRaw = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('users.role', 'resident')
            ->where('cm.role', 'member')
            ->where('users.status', '!=', 'deleted')
            ->selectRaw('DATE_FORMAT(cm.created_at, "%Y-%m") as month_key, COUNT(*) as count')
            ->when($communityId, fn ($q) => $q->where('cm.community_id', $communityId))
            ->where('cm.created_at', '>=', now()->subMonths(5)->startOfMonth())
            ->groupBy('month_key')
            ->orderBy('month_key')
            ->get()
            ->keyBy('month_key');

        $memberGrowth = [];
        for ($i = 5; $i >= 0; $i--) {
            $key = now()->subMonths($i)->format('Y-m');
            $memberGrowth[] = [
                'month' => now()->subMonths($i)->format('M Y'),
                'count' => (int) ($memberGrowthRaw[$key]->count ?? 0),
            ];
        }

        $memberStatus = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('users.role', 'resident')
            ->where('cm.role', 'member')
            ->where('users.status', '!=', 'deleted')
            ->when($communityId, fn ($q) => $q->where('cm.community_id', $communityId))
            ->selectRaw('cm.status, COUNT(*) as count')
            ->groupBy('cm.status')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => [
                'status' => $row->status,
                'count'  => (int) $row->count,
            ])
            ->values();

        $reportsByType = DB::table('reports')
            ->selectRaw('type, COUNT(*) as count')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->whereNull('deleted_at')
            ->groupBy('type')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => [
                'type'  => $row->type,
                'count' => (int) $row->count,
            ])
            ->values();

        $filedReports = DB::table('reports')
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->whereNull('deleted_at')
            ->where('created_at', '>=', now()->subDays(6)->startOfDay())
            ->groupBy('day')
            ->pluck('count', 'day');

        $resolvedReports = DB::table('reports')
            ->selectRaw('DATE(resolved_at) as day, COUNT(*) as count')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->whereNull('deleted_at')
            ->whereNotNull('resolved_at')
            ->where('resolved_at', '>=', now()->subDays(6)->startOfDay())
            ->groupBy('day')
            ->pluck('count', 'day');

        $reportsTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $day = now()->subDays($i)->format('Y-m-d');
            $reportsTrend[] = [
                'date'     => now()->subDays($i)->format('M d'),
                'filed'    => (int) ($filedReports[$day] ?? 0),
                'resolved' => (int) ($resolvedReports[$day] ?? 0),
            ];
        }

        $topCommunitiesByMembers = Community::query()
            ->with('regionRecord')
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')->orWhere('review_status', 'approved');
            })
            ->when($communityId, fn ($q) => $q->where('id', $communityId))
            ->withCount([
                'memberships as members_count' => function ($q) {
                    $q->where('role', 'member')
                        ->where('status', 'approved')
                        ->whereHas('user', function ($user) {
                            $user->where('role', 'resident')
                                ->where('status', '!=', 'deleted');
                        });
                },
            ])
            ->orderByDesc('members_count')
            ->orderBy('name')
            ->get()
            ->map(fn (Community $c) => [
                'id'            => $c->id,
                'name'          => $c->name,
                'region'        => $c->regionRecord?->title ?? $c->region ?? 'Unassigned',
                'members_count' => (int) $c->members_count,
            ])
            ->values()
            ->all();

        $recentActivity = DB::table('activity_logs')
            ->leftJoin('users', 'users.id', '=', 'activity_logs.user_id')
            ->select([
                'activity_logs.id',
                'activity_logs.action',
                'activity_logs.description',
                'activity_logs.severity',
                'activity_logs.log_type',
                'activity_logs.created_at',
                'users.name as user_name',
            ])
            ->orderByDesc('activity_logs.created_at')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'id'          => $row->id,
                'action'      => $row->action,
                'description' => $row->description,
                'severity'    => $row->severity,
                'log_type'    => $row->log_type,
                'user_name'   => $row->user_name,
                'created_at'  => $row->created_at,
            ])
            ->values();

        $pendingActions = $this->buildPendingActions($communityId);

        $scopeLabel = $communityId
            ? (Community::query()->find($communityId)?->name ?? "Community #{$communityId}")
            : 'All communities';

        return response()->json([
            'data' => [
                'scope' => [
                    'community_id' => $communityId,
                    'label'        => $scopeLabel,
                ],
                'stats' => [
                    'total_members'              => $totalMembers,
                    'pending_members'            => $pendingMembers,
                    'onboarding_members'         => $onboardingMembers,
                    'pending_approval_total'     => $pendingMembers + $pendingCommunityRequests + $pendingPosts + $pendingListings + $pendingCommunityAdmins,
                    'banned_members'             => $bannedMembers,
                    'open_reports'               => $openReports,
                    'active_listings'            => $activeListings,
                    'pending_listings'           => $pendingListings,
                    'pending_businesses'         => $pendingBusinesses,
                    'total_businesses'           => $totalBusinesses,
                    'published_notices'          => $publishedNotices,
                    'total_posts'                => $totalPosts,
                    'pending_posts'              => $pendingPosts,
                    'approved_posts'             => $approvedPosts,
                    'pending_bookings'           => $pendingBookings,
                    'total_communities'          => $totalCommunities,
                    'active_regions'             => $activeRegions,
                    'pending_community_requests' => $pendingCommunityRequests,
                    'total_community_admins'     => $totalCommunityAdmins,
                    'pending_community_admins'   => $pendingCommunityAdmins,
                    'approved_community_admins'  => $approvedCommunityAdmins,
                    'rejected_community_admins'  => $rejectedCommunityAdmins,
                    'new_contact_submissions'    => $newContactSubmissions,
                    'total_contact_submissions'  => $totalContactSubmissions,
                ],
                'pending_actions'         => $pendingActions,
                'activity_chart'        => $activityChart,
                'member_growth'           => $memberGrowth,
                'member_status'           => $memberStatus,
                'reports_by_type'         => $reportsByType,
                'reports_trend'           => $reportsTrend,
                'top_communities_by_members' => $topCommunitiesByMembers,
                'recent_activity'         => $recentActivity,
                'generated_at'            => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Lightweight payload for the mobile admin hub — avoids charts and global aggregates.
     *
     * @return array<string, mixed>
     */
    private function buildMobileDashboardPayload(?int $communityId): array
    {
        $residentsQuery = $this->residentMembershipQuery($communityId);

        $totalMembers = (clone $residentsQuery)->where('cm.status', 'approved')->count();
        $pendingMembers = (clone $residentsQuery)
            ->where('cm.status', 'pending')
            ->whereNotExists(function ($sub) {
                $sub->from('family_join_requests as fjr')
                    ->join('families', 'families.id', '=', 'fjr.family_id')
                    ->whereColumn('fjr.requester_user_id', 'users.id')
                    ->whereColumn('families.community_id', 'cm.community_id')
                    ->where('fjr.status', 'pending');
            })
            ->count();

        $listingsQuery = DB::table('listings')->whereNull('deleted_at');
        if ($communityId) {
            $listingsQuery->where('community_id', $communityId);
        }
        $pendingListings = (clone $listingsQuery)->where('status', 'pending')->count();
        $activeListings = (clone $listingsQuery)->where('status', 'approved')->count();

        $bookingsQuery = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id');
        if ($communityId) {
            $bookingsQuery->where('amenities.community_id', $communityId);
        }
        $pendingBookings = (clone $bookingsQuery)->where('bookings.status', 'pending')->count();

        $businessesQuery = DB::table('businesses')->whereNull('deleted_at');
        if ($communityId) {
            $businessesQuery->where('community_id', $communityId);
        }
        $pendingBusinesses = (clone $businessesQuery)->where('status', 'pending')->count();

        $postsQuery = DB::table('posts')->whereNull('deleted_at');
        if ($communityId) {
            $postsQuery->where('community_id', $communityId);
        }
        $pendingPosts = (clone $postsQuery)->where('status', 'pending')->count();

        $pendingCommunityRequests = Community::query()
            ->where('review_status', 'pending')
            ->when($communityId, fn ($q) => $q->where('id', $communityId))
            ->count();

        $pendingActions = $this->buildPendingActionsMobile($communityId, 5);

        $scopeLabel = $communityId
            ? (Community::query()->find($communityId)?->name ?? "Community #{$communityId}")
            : 'All communities';

        return [
            'scope' => [
                'community_id' => $communityId,
                'label'        => $scopeLabel,
            ],
            'stats' => [
                'total_members'          => $totalMembers,
                'pending_members'        => $pendingMembers,
                'active_listings'        => $activeListings,
                'pending_listings'       => $pendingListings,
                'pending_bookings'       => $pendingBookings,
                'pending_businesses'     => $pendingBusinesses,
                'pending_posts'          => $pendingPosts,
                'pending_approval_total' => $pendingMembers + $pendingCommunityRequests + $pendingPosts + $pendingListings + $pendingBookings + $pendingBusinesses,
            ],
            'pending_actions' => $pendingActions,
            'generated_at'    => now()->toIso8601String(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function buildPendingActionsMobile(?int $communityId, int $limit = 5): array
    {
        return array_slice($this->buildPendingActions($communityId), 0, $limit);
    }

    /** GET /v1/dashboard/stats (resident) */
    public function residentStats(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $communityId = $request->integer('community_id') ?: null;

        $myPosts = DB::table('posts')->where('user_id', $userId)->whereNull('deleted_at')->count();
        $myBookings = DB::table('bookings')->where('user_id', $userId)->where('status', '!=', 'cancelled')->count();
        $mySavedListings = DB::table('listing_saves')->where('user_id', $userId)->count();
        $myLikes = DB::table('post_likes')->where('user_id', $userId)->count();
        $unreadNotifs = DB::table('app_notifications')->where('user_id', $userId)->whereNull('read_at')->count();

        $totalMembers = DB::table('community_memberships')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->where('status', 'approved')
            ->count();

        $recentNotices = DB::table('notices')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->orderByDesc('published_at')
            ->limit(3)
            ->get();

        $recentPosts = DB::table('posts')
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->whereNull('deleted_at')
            ->count();

        $personalActivity = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $personalActivity[] = [
                'date'  => now()->subDays($i)->format('M d'),
                'posts' => DB::table('posts')->where('user_id', $userId)->whereDate('created_at', $date)->count(),
                'likes' => DB::table('post_likes')->where('user_id', $userId)->whereDate('created_at', $date)->count(),
            ];
        }

        return response()->json(['data' => [
            'my_stats' => [
                'posts'          => $myPosts,
                'bookings'       => $myBookings,
                'saved_listings' => $mySavedListings,
                'likes_given'    => $myLikes,
                'unread_notifs'  => $unreadNotifs,
            ],
            'community_stats' => [
                'total_members' => $totalMembers,
                'total_posts'   => $recentPosts,
            ],
            'recent_notices'    => $recentNotices,
            'personal_activity' => $personalActivity,
        ]]);
    }

    /** Approved/pending resident memberships only — excludes community admins. */
    private function residentMembershipQuery(?int $communityId)
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('users.role', 'resident')
            ->where('cm.role', 'member')
            ->where('users.status', '!=', 'deleted');

        if ($communityId) {
            $query->where('cm.community_id', $communityId);
        }

        return $query;
    }

    /** @param  \Illuminate\Support\Collection<string, int|string>  $indexed */
    private function buildDailySeries($indexed, int $days, string $valueKey): array
    {
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = now()->subDays($i)->format('Y-m-d');
            $series[] = [
                'date'    => now()->subDays($i)->format('M d'),
                $valueKey => (int) ($indexed[$day] ?? 0),
            ];
        }

        return $series;
    }

    /** @return list<array<string, mixed>> */
    private function buildPendingActions(?int $communityId): array
    {
        $memberships = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('family_add_member_requests as famr', function ($join) {
                $join->on('famr.candidate_user_id', '=', 'users.id')
                    ->whereIn('famr.status', ['pending_admin', 'pending']);
            })
            ->leftJoin('families as fam', 'fam.id', '=', 'famr.family_id')
            ->where('cm.status', 'pending')
            ->where('users.role', 'resident')
            ->where('cm.role', 'member')
            ->when($communityId, fn ($q) => $q->where('cm.community_id', $communityId))
            ->whereNotExists(function ($sub) {
                $sub->from('family_join_requests as fjr')
                    ->join('families', 'families.id', '=', 'fjr.family_id')
                    ->whereColumn('fjr.requester_user_id', 'users.id')
                    ->whereColumn('families.community_id', 'cm.community_id')
                    ->where('fjr.status', 'pending');
            })
            ->where(function ($q) {
                $q->whereNull('fam.id')
                    ->orWhereColumn('fam.community_id', 'cm.community_id');
            })
            ->select([
                'cm.id as membership_id',
                'cm.community_id',
                'users.id as user_id',
                DB::raw('COALESCE(profiles.display_name, users.name) as name'),
                'users.email',
                'users.phone',
                'communities.name as community_name',
                'profiles.unit_number',
                'profiles.utility_bill_url',
                'cm.created_at',
                'fam.family_number',
                'famr.id as family_add_member_request_id',
            ])
            ->orderByDesc('cm.created_at')
            ->limit(15)
            ->get()
            ->unique('membership_id')
            ->map(function ($row) {
                $contact = $row->unit_number
                    ? "Unit {$row->unit_number} · ".($row->phone ?? $row->email)
                    : ($row->phone ?? $row->email);
                $detail = $row->family_number
                    ? "Family add · {$row->family_number} · {$contact}"
                    : $contact;

                return [
                    'type'          => 'membership',
                    'id'            => (int) $row->membership_id,
                    'user_id'       => (int) $row->user_id,
                    'community_id'  => (int) $row->community_id,
                    'title'         => $row->name,
                    'subtitle'      => $row->community_name ?? 'Unknown community',
                    'detail'        => $detail,
                    'utility_bill_url' => $this->resolveMediaUrl($row->utility_bill_url ?? null),
                    'created_at'    => $row->created_at,
                    'action_label'  => $row->family_number ? 'Review family member' : 'Review the member',
                    'action_href'   => '/admin/members?status=pending',
                    'family_add_member_request_id' => $row->family_add_member_request_id
                        ? (int) $row->family_add_member_request_id
                        : null,
                    'family_number' => $row->family_number,
                ];
            })
            ->values()
            ->all();

        $familyAddRequests = FamilyAddMemberRequest::query()
            ->with(['family.community', 'candidate.profile', 'requestedBy.profile'])
            ->whereIn('status', [
                FamilyAddMemberRequest::STATUS_PENDING_ADMIN,
                'pending',
            ])
            ->when($communityId, fn ($q) => $q->whereHas('family', fn ($f) => $f->where('community_id', $communityId)))
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('community_memberships as cm')
                    ->join('families as f', 'f.id', '=', 'family_add_member_requests.family_id')
                    ->whereColumn('cm.user_id', 'family_add_member_requests.candidate_user_id')
                    ->whereColumn('cm.community_id', 'f.community_id')
                    ->where('cm.status', 'approved');
            })
            ->orderByDesc('created_at')
            ->limit(15)
            ->get()
            ->map(function (FamilyAddMemberRequest $request) {
                $name = trim("{$request->first_name} {$request->last_name}") ?: ($request->candidate?->name ?? 'Resident');
                $familyNumber = $request->family?->family_number;
                $communityName = $request->family?->community?->name ?? 'Unknown community';

                return [
                    'type'         => 'family_add_member',
                    'id'           => $request->id,
                    'user_id'      => $request->candidate_user_id,
                    'community_id' => (int) $request->family?->community_id,
                    'title'        => $name,
                    'subtitle'     => $communityName,
                    'detail'       => $familyNumber
                        ? "Family add · {$familyNumber} · ".($request->phone ?: $request->email)
                        : ($request->phone ?: $request->email),
                    'created_at'   => $request->created_at?->toIso8601String(),
                    'action_label' => 'Review family member',
                    'action_href'  => '/admin/members?status=pending',
                    'family_add_member_request_id' => $request->id,
                    'family_number' => $familyNumber,
                ];
            })
            ->all();
        $communities = Community::query()
            ->with('regionRecord')
            ->where('review_status', 'pending')
            ->when($communityId, fn ($q) => $q->where('id', $communityId))
            ->orderByDesc('created_at')
            ->limit(15)
            ->get()
            ->map(fn (Community $c) => [
                'type'         => 'community_request',
                'id'           => $c->id,
                'title'        => $c->name,
                'subtitle'     => $c->regionRecord?->title ?? $c->region ?? 'New community',
                'detail'       => $c->address ?? $c->description,
                'created_at'   => $c->created_at?->toIso8601String(),
                'action_label' => 'Review request',
                'action_href'  => '/admin/communities?tab=requests',
            ])
            ->all();

        $communityAdmins = [];
        if (! $communityId) {
            $communityAdmins = User::query()
                ->with(['profile', 'memberships.community'])
                ->where('role', 'community_admin')
                ->where('community_admin_status', 'pending')
                ->orderByDesc('created_at')
                ->limit(15)
                ->get()
                ->map(function (User $user) {
                    $membership = $user->memberships->firstWhere('role', 'admin') ?? $user->memberships->first();
                    $community = $membership?->community;
                    $profile = $user->profile;

                    return [
                        'type'             => 'community_admin',
                        'id'               => $user->id,
                        'user_id'          => $user->id,
                        'community_id'     => $community?->id,
                        'title'            => $profile?->display_name ?: $user->name,
                        'subtitle'         => $community?->name ?? 'Community admin application',
                        'detail'           => $profile?->unit_number
                            ? 'Unit '.$profile->unit_number.' · '.($user->phone ?? $user->email)
                            : ($user->phone ?? $user->email),
                        'utility_bill_url' => $this->resolveMediaUrl($profile?->utility_bill_url),
                        'created_at'       => $user->created_at?->toIso8601String(),
                        'action_label'     => 'Review application',
                        'action_href'      => '/admin/community-admins?status=pending',
                    ];
                })
                ->all();
        }

        $posts = DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'posts.community_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->where('posts.status', 'pending')
            ->whereNull('posts.deleted_at')
            ->when($communityId, fn ($q) => $q->where('posts.community_id', $communityId))
            ->select([
                'posts.id',
                'posts.community_id',
                'posts.body',
                'posts.category',
                'posts.created_at',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'communities.name as community_name',
            ])
            ->orderByDesc('posts.created_at')
            ->limit(15)
            ->get()
            ->map(fn ($row) => [
                'type'         => 'post',
                'id'           => (int) $row->id,
                'community_id' => (int) $row->community_id,
                'title'        => $row->author_name,
                'subtitle'     => $row->community_name ?? 'Community post',
                'detail'       => \Illuminate\Support\Str::limit($row->body, 120),
                'created_at'   => $row->created_at,
                'action_label' => 'Review post',
                'action_href'  => '/admin/feed?status=pending',
            ])
            ->all();

        $notices = DB::table('notices')
            ->join('users', 'users.id', '=', 'notices.author_id')
            ->leftJoin('communities', 'communities.id', '=', 'notices.community_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'notices.author_id')
            ->where('notices.review_status', 'pending')
            ->whereNull('notices.deleted_at')
            ->when($communityId, fn ($q) => $q->where('notices.community_id', $communityId))
            ->select([
                'notices.id',
                'notices.community_id',
                'notices.title',
                'notices.category',
                'notices.created_at',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'communities.name as community_name',
            ])
            ->orderByDesc('notices.created_at')
            ->limit(15)
            ->get()
            ->map(fn ($row) => [
                'type'         => match ($row->category) {
                    'event'     => 'event',
                    'emergency' => 'alert',
                    default     => 'notice',
                },
                'id'           => (int) $row->id,
                'community_id' => (int) $row->community_id,
                'title'        => $row->title,
                'subtitle'     => $row->community_name ?? 'Community content',
                'detail'       => $row->author_name,
                'created_at'   => $row->created_at,
                'action_label' => 'Review',
                'action_href'  => match ($row->category) {
                    'event'     => '/admin/events?review_status=pending',
                    'emergency' => '/admin/alerts?review_status=pending',
                    default     => '/admin/notices?review_status=pending',
                },
            ])
            ->all();

        $listings = DB::table('listings')
            ->join('users', 'users.id', '=', 'listings.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'listings.user_id')
            ->where('listings.status', 'pending')
            ->whereNull('listings.deleted_at')
            ->when($communityId, fn ($q) => $q->where('listings.community_id', $communityId))
            ->select([
                'listings.id',
                'listings.community_id',
                'listings.title',
                'listings.type',
                'listings.price',
                'listings.created_at',
                DB::raw('COALESCE(profiles.display_name, users.name) as seller_name'),
            ])
            ->orderByDesc('listings.created_at')
            ->limit(15)
            ->get()
            ->map(fn ($row) => [
                'type'         => 'listing',
                'id'           => (int) $row->id,
                'community_id' => (int) $row->community_id,
                'title'        => $row->title,
                'subtitle'     => $row->seller_name ?? 'Resident listing',
                'detail'       => ucfirst(str_replace('_', ' ', $row->type ?? 'listing'))
                    .($row->price !== null ? ' · $'.number_format((float) $row->price, 2) : ''),
                'created_at'   => $row->created_at,
                'action_label' => 'Review listing',
                'action_href'  => '/admin/marketplace?status=pending',
            ])
            ->all();

        $businesses = DB::table('businesses as b')
            ->join('users', 'users.id', '=', 'b.owner_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'b.owner_id')
            ->where('b.status', 'pending')
            ->whereNull('b.deleted_at')
            ->when($communityId, fn ($q) => $q->where('b.community_id', $communityId))
            ->select([
                'b.id',
                'b.community_id',
                'b.name',
                'b.category',
                'b.created_at',
                DB::raw('COALESCE(profiles.display_name, users.name) as owner_name'),
            ])
            ->orderByDesc('b.created_at')
            ->limit(15)
            ->get()
            ->map(fn ($row) => [
                'type'         => 'business',
                'id'           => (int) $row->id,
                'community_id' => (int) $row->community_id,
                'title'        => $row->name,
                'subtitle'     => $row->owner_name ?? 'Resident business',
                'detail'       => $row->category ?? 'Marketplace business',
                'created_at'   => $row->created_at,
                'action_label' => 'Review business',
                'action_href'  => '/marketplace/all-marketplace?tab=businesses',
            ])
            ->all();

        return collect([...$memberships, ...$familyAddRequests, ...$communityAdmins, ...$communities, ...$posts, ...$notices, ...$listings, ...$businesses])
            ->unique(fn (array $item) => ($item['type'] ?? '').':'.($item['id'] ?? ''))
            ->sortByDesc('created_at')
            ->values()
            ->take(15)
            ->all();
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
