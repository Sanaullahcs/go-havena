<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\ContactSubmission;
use App\Models\FamilyAddMemberRequest;
use App\Models\Region;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\AmenitySharedBillService;
use App\Services\MemberLifecycleStatus;
use App\Services\UnitServiceBillService;
use App\Support\NoticeExpiry;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    /** GET /v1/admin/dashboard/stats */
    public function adminStats(
        Request $request,
        AmenitySharedBillService $amenityBills,
        UnitServiceBillService $serviceBills,
    ): JsonResponse {
        $communityId = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);

        if ($request->boolean('mobile')) {
            return response()->json([
                'data' => $this->buildMobileDashboardPayload($communityId, $request, $amenityBills, $serviceBills),
            ]);
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

        $memberCounts = (clone $residentsQuery)
            ->selectRaw('cm.status, COUNT(*) as aggregate')
            ->groupBy('cm.status')
            ->pluck('aggregate', 'status');
        $approvedMembers = (int) ($memberCounts['approved'] ?? 0);
        $bannedMembers = (int) ($memberCounts['banned'] ?? 0);
        $rejectedMembers = (int) ($memberCounts['rejected'] ?? 0);
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
        $invitationSentMembers = MemberLifecycleStatus::countInvitationSent($communityId);
        $onboardingMembers = MemberLifecycleStatus::countOnboarding($communityId);
        // Joined residents with approved membership only (excludes invites, onboarding, pending, etc.).
        $totalMembers = $approvedMembers;
        $openReports = (clone $reportsQuery)->whereIn('status', ['open', 'in_review', 'escalated'])->count();
        $listingCounts = (clone $listingsQuery)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $activeListings = (int) ($listingCounts['approved'] ?? 0);
        $pendingListings = (int) ($listingCounts['pending'] ?? 0);
        $businessesQuery = DB::table('businesses')->whereNull('deleted_at');
        if ($communityId) {
            $businessesQuery->where('community_id', $communityId);
        }
        $businessCounts = (clone $businessesQuery)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $pendingBusinesses = (int) ($businessCounts['pending'] ?? 0);
        $totalBusinesses = (int) $businessCounts->sum();
        $publishedNotices = (clone $noticesQuery)
            ->where('status', 'published')
            ->whereNotIn('category', ['event', 'emergency'])
            ->count();
        $upcomingEventsQuery = clone $noticesQuery;
        NoticeExpiry::applyUpcomingEventConstraints($upcomingEventsQuery, 'notices', $communityId);
        $upcomingEvents = $upcomingEventsQuery->count();
        $postCounts = (clone $postsQuery)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $totalPosts = (int) $postCounts->sum();
        $pendingPosts = (int) ($postCounts['pending'] ?? 0);
        $approvedPosts = (int) ($postCounts['approved'] ?? 0);

        $bookingsQuery = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id');
        if ($communityId) {
            $bookingsQuery->where('amenities.community_id', $communityId);
        }
        $pendingBookingsQuery = (clone $bookingsQuery)->where('bookings.status', 'pending');
        if ($communityId) {
            $this->applyStaffCreatedAmenityScope($pendingBookingsQuery, 'amenities.created_by');
        }
        $pendingBookings = $pendingBookingsQuery->count();

        $pendingAmenityReviews = 0;
        $pendingAmenityPayments = 0;
        $pendingServicePayments = 0;
        $pendingUnitRequests = 0;
        if ($communityId) {
            $pendingAmenityReviews = (int) DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('review_status', 'pending')
                ->count();
            $viewerId = (int) ($request->user()?->id ?? 0);
            $pendingAmenityPayments = $amenityBills->countCommunityAdminReviewablePendingPayments($communityId, $viewerId);
            $pendingServicePayments = $serviceBills->countAdminPendingVerification($communityId);
            $pendingUnitRequests = $this->countPendingUnitRegistrationPackages($communityId);
        }

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

        $communityAdminCounts = DB::table('users')
            ->where('role', 'community_admin')
            ->where('status', '!=', 'deleted')
            ->selectRaw('community_admin_status, COUNT(*) as aggregate')
            ->groupBy('community_admin_status')
            ->pluck('aggregate', 'community_admin_status');
        $totalCommunityAdmins = (int) $communityAdminCounts->sum();
        $pendingCommunityAdmins = (int) ($communityAdminCounts['pending'] ?? 0);
        $approvedCommunityAdmins = (int) ($communityAdminCounts['approved'] ?? 0);
        $rejectedCommunityAdmins = (int) ($communityAdminCounts['rejected'] ?? 0);

        $contactCounts = ContactSubmission::query()
            ->where('message', 'like', '[Demo request]%')
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $newContactSubmissions = (int) ($contactCounts['new'] ?? 0);
        $totalContactSubmissions = (int) $contactCounts->sum();

        $activityChart = $this->buildDailySeries(
            DB::table('activity_logs')
                ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
                ->where('created_at', '>=', now()->subDays(6)->startOfDay())
                ->when($communityId, fn ($q) => $q->whereIn('user_id', function ($sub) use ($communityId) {
                    $sub->from('community_memberships')
                        ->where('community_id', $communityId)
                        ->select('user_id');
                }))
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

        $memberStatus = $memberStatus
            ->reject(fn (array $row) => in_array($row['status'], ['onboarding', 'invitation_sent'], true))
            ->push(['status' => 'invitation_sent', 'count' => $invitationSentMembers])
            ->push(['status' => 'onboarding', 'count' => $onboardingMembers])
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
            ->limit(8)
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
            ->when($communityId, fn ($q) => $q->whereIn('activity_logs.user_id', function ($sub) use ($communityId) {
                $sub->from('community_memberships')
                    ->where('community_id', $communityId)
                    ->select('user_id');
            }))
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

        $pendingActions = $this->buildPendingActions($communityId, $request, $amenityBills, $serviceBills);

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
                    'invitation_sent_members'    => $invitationSentMembers,
                    'onboarding_members'         => $onboardingMembers,
                    'pending_approval_total'     => $communityId
                        ? $pendingMembers + $pendingListings + $pendingPosts + $pendingBookings + $pendingBusinesses
                            + $pendingAmenityReviews + $pendingAmenityPayments + $pendingServicePayments
                            + $pendingUnitRequests
                        : $pendingMembers + $pendingCommunityRequests + $pendingListings + $pendingCommunityAdmins,
                    'banned_members'             => $bannedMembers,
                    'open_reports'               => $openReports,
                    'active_listings'            => $activeListings,
                    'pending_listings'           => $pendingListings,
                    'pending_businesses'         => $pendingBusinesses,
                    'total_businesses'           => $totalBusinesses,
                    'published_notices'          => $publishedNotices,
                    'upcoming_events'            => $upcomingEvents,
                    'total_posts'                => $totalPosts,
                    'pending_posts'              => $pendingPosts,
                    'approved_posts'             => $approvedPosts,
                    'pending_bookings'           => $pendingBookings,
                    'pending_amenity_reviews'    => $pendingAmenityReviews,
                    'pending_amenity_payments'   => $pendingAmenityPayments,
                    'pending_service_payments'   => $pendingServicePayments,
                    'pending_unit_requests'      => $pendingUnitRequests,
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
    private function buildMobileDashboardPayload(
        ?int $communityId,
        Request $request,
        AmenitySharedBillService $amenityBills,
        UnitServiceBillService $serviceBills,
    ): array {
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
        $pendingBookingsQuery = (clone $bookingsQuery)->where('bookings.status', 'pending');
        if ($communityId) {
            $this->applyStaffCreatedAmenityScope($pendingBookingsQuery, 'amenities.created_by');
        }
        $pendingBookings = $pendingBookingsQuery->count();

        $pendingAmenityReviews = 0;
        $pendingAmenityPayments = 0;
        $pendingServicePayments = 0;
        $pendingUnitRequests = 0;
        if ($communityId) {
            $pendingAmenityReviews = (int) DB::table('amenities')
                ->where('community_id', $communityId)
                ->where('review_status', 'pending')
                ->count();
            $viewerId = (int) ($request->user()?->id ?? 0);
            $pendingAmenityPayments = $amenityBills->countCommunityAdminReviewablePendingPayments($communityId, $viewerId);
            $pendingServicePayments = $serviceBills->countAdminPendingVerification($communityId);
            $pendingUnitRequests = $this->countPendingUnitRegistrationPackages($communityId);
        }

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

        $pendingActions = $this->buildPendingActionsMobile($communityId, $request, $amenityBills, $serviceBills, 5);

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
                'pending_approval_total' => $pendingMembers + $pendingCommunityRequests + $pendingPosts + $pendingListings + $pendingBookings + $pendingBusinesses
                    + $pendingAmenityReviews + $pendingAmenityPayments + $pendingServicePayments
                    + $pendingUnitRequests,
                'pending_amenity_reviews' => $pendingAmenityReviews,
                'pending_amenity_payments' => $pendingAmenityPayments,
                'pending_service_payments' => $pendingServicePayments,
                'pending_unit_requests' => $pendingUnitRequests,
            ],
            'pending_actions' => $pendingActions,
            'generated_at'    => now()->toIso8601String(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function buildPendingActionsMobile(
        ?int $communityId,
        Request $request,
        AmenitySharedBillService $amenityBills,
        UnitServiceBillService $serviceBills,
        int $limit = 5,
    ): array {
        return array_slice(
            $this->buildPendingActions($communityId, $request, $amenityBills, $serviceBills),
            0,
            $limit,
        );
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

        $since = now()->subDays(6)->startOfDay();
        $postsByDay = DB::table('posts')
            ->where('user_id', $userId)
            ->where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as aggregate')
            ->groupBy('day')
            ->pluck('aggregate', 'day');
        $likesByDay = DB::table('post_likes')
            ->where('user_id', $userId)
            ->where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as aggregate')
            ->groupBy('day')
            ->pluck('aggregate', 'day');

        $personalActivity = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $personalActivity[] = [
                'date'  => now()->subDays($i)->format('M d'),
                'posts' => (int) ($postsByDay[$date] ?? 0),
                'likes' => (int) ($likesByDay[$date] ?? 0),
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
    private function buildPendingActions(
        ?int $communityId,
        Request $request,
        AmenitySharedBillService $amenityBills,
        UnitServiceBillService $serviceBills,
    ): array {
        $membershipRows = DB::table('community_memberships as cm')
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
            ->values();

        $signupUnits = $this->initialSignupUnitsForMemberships($membershipRows);

        $memberships = $membershipRows
            ->map(function ($row) use ($signupUnits) {
                $key = $row->user_id.':'.$row->community_id;
                $units = $signupUnits[$key] ?? [];
                $profileBill = $this->resolveMediaUrl($row->utility_bill_url ?? null);
                if ($units === [] && trim((string) $row->unit_number) !== '') {
                    $units[] = [
                        'unit_number' => trim((string) $row->unit_number),
                        'residence_type' => null,
                        'documents' => $profileBill
                            ? [['kind' => 'utility_bill', 'file_url' => $profileBill]]
                            : [],
                    ];
                } elseif ($profileBill && $units !== [] && ! $this->unitsAlreadyIncludeBill($units, $profileBill)) {
                    $units[0]['documents'][] = ['kind' => 'utility_bill', 'file_url' => $profileBill];
                }

                $unitNumbers = array_values(array_filter(array_map(
                    fn (array $unit) => trim((string) ($unit['unit_number'] ?? '')),
                    $units,
                )));
                $contact = $this->dashboardContact(
                    $row->phone,
                    $row->email,
                    $unitNumbers !== [] ? implode(', ', $unitNumbers) : $row->unit_number,
                );
                $detail = $row->family_number
                    ? "Family add · {$row->family_number} · {$contact}"
                    : $contact;
                $bill = $profileBill;
                if (! $bill) {
                    foreach ($units as $unit) {
                        foreach ($unit['documents'] as $document) {
                            if (($document['kind'] ?? '') === 'utility_bill' && ! empty($document['file_url'])) {
                                $bill = $document['file_url'];
                                break 2;
                            }
                        }
                    }
                }

                return [
                    'type'          => 'membership',
                    'id'            => (int) $row->membership_id,
                    'user_id'       => (int) $row->user_id,
                    'community_id'  => (int) $row->community_id,
                    'title'         => PhoneNormalizer::displayName($row->name, $row->phone, $row->email),
                    'subtitle'      => $row->community_name ?? 'Unknown community',
                    'detail'        => $detail,
                    'utility_bill_url' => $bill,
                    'units'         => $units,
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
                $name = PhoneNormalizer::displayName(
                    trim("{$request->first_name} {$request->last_name}") ?: ($request->candidate?->name ?? ''),
                    $request->phone ?? $request->candidate?->phone,
                    $request->email ?? $request->candidate?->email,
                );
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
                        ? "Family add · {$familyNumber} · ".$this->dashboardContact($request->phone, $request->email)
                        : $this->dashboardContact($request->phone, $request->email),
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
                        'title'            => PhoneNormalizer::displayName(
                            $profile?->display_name ?: $user->name,
                            $user->phone,
                            $user->email,
                            'Community admin',
                        ),
                        'subtitle'         => $community?->name ?? 'Community admin application',
                        'detail'           => $this->dashboardContact(
                            $user->phone,
                            $user->email,
                            $profile?->unit_number,
                        ),
                        'utility_bill_url' => $this->resolveMediaUrl($profile?->utility_bill_url),
                        'created_at'       => $user->created_at?->toIso8601String(),
                        'action_label'     => 'Review application',
                        'action_href'      => '/admin/community-admins?status=pending',
                    ];
                })
                ->all();
        }

        $posts = [];
        if ($communityId) {
            $posts = DB::table('posts')
                ->join('users', 'users.id', '=', 'posts.user_id')
                ->leftJoin('communities', 'communities.id', '=', 'posts.community_id')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
                ->where('posts.status', 'pending')
                ->whereNull('posts.deleted_at')
                ->where('posts.community_id', $communityId)
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
        }

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

        $bookings = [];
        $amenityReviews = [];
        $amenityPayments = [];
        $servicePayments = [];
        if ($communityId) {
            $bookings = DB::table('bookings')
                ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
                ->join('users', 'users.id', '=', 'bookings.user_id')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('bookings.status', 'pending')
                ->where('amenities.community_id', $communityId)
                ->tap(fn ($q) => $this->applyStaffCreatedAmenityScope($q, 'amenities.created_by'))
                ->select([
                    'bookings.id',
                    'amenities.community_id',
                    'bookings.date',
                    'bookings.time_slot',
                    'bookings.created_at',
                    'amenities.name as amenity_name',
                    DB::raw('COALESCE(profiles.display_name, users.name) as resident_name'),
                ])
                ->orderByDesc('bookings.created_at')
                ->limit(10)
                ->get()
                ->map(fn ($row) => [
                    'type'         => 'booking',
                    'id'           => (int) $row->id,
                    'community_id' => (int) $row->community_id,
                    'title'        => $row->amenity_name ?? 'Amenity booking',
                    'subtitle'     => $row->resident_name ?? 'Resident request',
                    'detail'       => trim(($row->date ?? '').' · '.($row->time_slot ?? '')),
                    'created_at'   => $row->created_at,
                    'action_label' => 'Review booking',
                    'action_href'  => '/admin/bookings',
                ])
                ->all();

            $amenityReviews = DB::table('amenities as a')
                ->join('users', 'users.id', '=', 'a.created_by')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'a.created_by')
                ->where('a.community_id', $communityId)
                ->where('a.review_status', 'pending')
                ->select([
                    'a.id',
                    'a.community_id',
                    'a.name',
                    'a.created_at',
                    DB::raw('COALESCE(profiles.display_name, users.name) as creator_name'),
                ])
                ->orderByDesc('a.created_at')
                ->limit(10)
                ->get()
                ->map(fn ($row) => [
                    'type'         => 'amenity_review',
                    'id'           => (int) $row->id,
                    'community_id' => (int) $row->community_id,
                    'title'        => $row->name ?? 'New amenity',
                    'subtitle'     => $row->creator_name ?? 'Resident submission',
                    'detail'       => 'Amenity awaiting approval',
                    'created_at'   => $row->created_at,
                    'action_label' => 'Review amenity',
                    'action_href'  => '/admin/amenities',
                ])
                ->all();

            $viewerId = (int) ($request->user()?->id ?? 0);
            $amenityPayments = collect($amenityBills->communityAdminReviewablePendingPaymentRows($communityId, $viewerId, 10))
                ->map(function ($row) use ($amenityBills) {
                    $bookingPayment = $amenityBills->isBookingPaymentBill($row);

                    return [
                        'type'         => 'amenity_payment',
                        'id'           => (int) $row->resident_bill_id,
                        'community_id' => (int) $row->community_id,
                        'amenity_id'   => (int) $row->amenity_id,
                        'title'        => $row->amenity_name ?? 'Amenity bill',
                        'subtitle'     => $row->resident_name ?? 'Resident payment',
                        'detail'       => $bookingPayment
                            ? 'Booking fee · payment proof'
                            : 'Monthly amenity · payment proof',
                        'created_at'   => $row->proof_submitted_at ?? $row->created_at ?? now()->toIso8601String(),
                        'action_label' => 'Review payment',
                        'action_href'  => '/admin/amenity-bills',
                    ];
                })
                ->all();

            $servicePayments = collect($serviceBills->adminPendingVerificationDashboardRows($communityId, 10))
                ->map(fn ($row) => [
                    'type'         => 'service_payment',
                    'id'           => (int) $row->id,
                    'community_id' => (int) $row->community_id,
                    'title'        => $row->service_name ?? 'Unit service',
                    'subtitle'     => trim(($row->billing_contact_display_name ?? $row->billing_contact_name ?? 'Billing contact')
                        .($row->unit_number ? " · Unit {$row->unit_number}" : '')),
                    'detail'       => 'Service bill · payment proof',
                    'created_at'   => $row->proof_submitted_at ?? $row->created_at,
                    'action_label' => 'Review payment',
                    'action_href'  => '/admin/service-bills',
                ])
                ->all();
        }

        $unitRequests = $this->buildPendingUnitRegistrationActions($communityId);

        return collect([
            ...$memberships,
            ...$familyAddRequests,
            ...$communityAdmins,
            ...$communities,
            ...$posts,
            ...$notices,
            ...$listings,
            ...$businesses,
            ...$bookings,
            ...$amenityReviews,
            ...$amenityPayments,
            ...$servicePayments,
            ...$unitRequests,
        ])
            ->unique(fn (array $item) => ($item['type'] ?? '').':'.($item['id'] ?? ''))
            ->sortByDesc('created_at')
            ->values()
            ->take(20)
            ->all();
    }

    private function applyStaffCreatedAmenityScope($query, string $createdByColumn): void
    {
        $query->whereExists(function ($sub) use ($createdByColumn) {
            $sub->select(DB::raw(1))
                ->from('users as amenity_creator')
                ->whereColumn('amenity_creator.id', $createdByColumn)
                ->where(function ($roles) {
                    $roles->whereIn('amenity_creator.role', ['community_admin', 'admin']);
                    if (Schema::hasColumn('users', 'is_admin')) {
                        $roles->orWhere('amenity_creator.is_admin', true);
                    }
                });
        });
    }

    private function dashboardContact(?string $phone, ?string $email = null, mixed $unitNumber = null): string
    {
        $contact = PhoneNormalizer::displayContact($phone, $email);
        $unit = trim((string) $unitNumber);

        if ($unit !== '') {
            return $contact !== '' ? "Unit {$unit} · {$contact}" : "Unit {$unit}";
        }

        return $contact;
    }

    /**
     * The profile copy of a signup bill is the same document as the unit proof.
     * Keep one link even when the stored URLs use different hosts.
     *
     * @param  list<array{unit_number: string, residence_type: ?string, documents: list<array{kind: string, file_url: string}>}>  $units
     */
    private function unitsAlreadyIncludeBill(array $units, string $billUrl): bool
    {
        $billKey = $this->mediaPathKey($billUrl);
        foreach ($units as $unit) {
            foreach ($unit['documents'] as $document) {
                if (($document['kind'] ?? '') === 'utility_bill') {
                    return true;
                }
                if ($billKey !== '' && $this->mediaPathKey($document['file_url'] ?? null) === $billKey) {
                    return true;
                }
            }
        }

        return false;
    }

    private function mediaPathKey(?string $url): string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return '';
        }

        $path = parse_url($url, PHP_URL_PATH);
        $path = is_string($path) && $path !== '' ? $path : $url;

        return strtolower(ltrim($path, '/'));
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

    private function countPendingUnitRegistrationPackages(?int $communityId): int
    {
        if (! $communityId || ! Schema::hasTable('unit_registration_packages')) {
            return 0;
        }

        $query = DB::table('unit_registration_packages as p')
            ->where('p.community_id', $communityId)
            ->where('p.status', 'pending');
        $this->whereStandaloneUnitReview($query);

        return (int) $query->count();
    }

    /** @return list<array<string, mixed>> */
    private function buildPendingUnitRegistrationActions(?int $communityId): array
    {
        if (! $communityId || ! Schema::hasTable('unit_registration_packages')) {
            return [];
        }

        $packages = DB::table('unit_registration_packages as p')
            ->join('users', 'users.id', '=', 'p.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'p.community_id')
            ->where('p.community_id', $communityId)
            ->where('p.status', 'pending');
        $this->whereStandaloneUnitReview($packages);
        $packages = $packages
            ->select([
                'p.id',
                'p.community_id',
                'p.user_id',
                'p.kind',
                'p.created_at',
                DB::raw('COALESCE(profiles.display_name, users.name) as resident_name'),
                'users.email',
                'users.phone',
                'communities.name as community_name',
            ])
            ->orderByDesc('p.created_at')
            ->limit(15)
            ->get();

        if ($packages->isEmpty()) {
            return [];
        }

        $packageIds = $packages->pluck('id')->map(fn ($id) => (int) $id)->all();
        $itemsByPackage = DB::table('unit_registration_package_items')
            ->whereIn('package_id', $packageIds)
            ->orderBy('id')
            ->get(['package_id', 'unit_number'])
            ->groupBy('package_id');

        return $packages->map(function ($row) use ($itemsByPackage) {
            $unitNumbers = collect($itemsByPackage->get((int) $row->id, collect()))
                ->map(fn ($item) => trim((string) $item->unit_number))
                ->filter()
                ->values()
                ->all();
            $unitLabel = $unitNumbers === []
                ? 'unit request'
                : (count($unitNumbers) === 1
                    ? 'Unit '.$unitNumbers[0]
                    : 'Units '.implode(', ', $unitNumbers));
            $isAddon = ($row->kind ?? '') === 'addon';

            return [
                'type'         => 'unit_registration',
                'id'           => (int) $row->id,
                'user_id'      => (int) $row->user_id,
                'community_id' => (int) $row->community_id,
                'title'        => PhoneNormalizer::displayName($row->resident_name, $row->phone, $row->email),
                'subtitle'     => $row->community_name ?? 'Community',
                'detail'       => ($isAddon ? 'Additional unit · ' : 'Unit registration · ').$unitLabel,
                'created_at'   => $row->created_at,
                'action_label' => 'Review unit request',
                'action_href'  => '/admin/unit-requests',
            ];
        })->all();
    }

    /**
     * First-time signup units stay on the resident approval. A unit review is
     * its own item only for an additional unit, or for an initial package whose
     * membership is no longer waiting.
     */
    private function whereStandaloneUnitReview($query, string $packageAlias = 'p'): void
    {
        $query->where(function ($outer) use ($packageAlias) {
            $outer->where("{$packageAlias}.kind", 'addon')
                ->orWhere(function ($initial) use ($packageAlias) {
                    $initial->where("{$packageAlias}.kind", 'initial')
                        ->whereNotExists(function ($sub) use ($packageAlias) {
                            $sub->select(DB::raw(1))
                                ->from('community_memberships as cm')
                                ->whereColumn('cm.user_id', "{$packageAlias}.user_id")
                                ->whereColumn('cm.community_id', "{$packageAlias}.community_id")
                                ->where('cm.status', 'pending');
                        });
                });
        });
    }

    /**
     * Pending initial-signup units and their proof documents, keyed by "userId:communityId".
     *
     * @param  \Illuminate\Support\Collection<int, object>  $rows
     * @return array<string, list<array{unit_number: string, residence_type: ?string, documents: list<array{kind: string, file_url: string}>}>>
     */
    private function initialSignupUnitsForMemberships($rows): array
    {
        if ($rows->isEmpty()
            || ! Schema::hasTable('unit_registration_packages')
            || ! Schema::hasTable('unit_registration_package_items')) {
            return [];
        }

        $packages = DB::table('unit_registration_packages')
            ->where('kind', 'initial')
            ->where('status', 'pending')
            ->whereIn('user_id', $rows->pluck('user_id')->unique()->all())
            ->whereIn('community_id', $rows->pluck('community_id')->unique()->all())
            ->get(['id', 'user_id', 'community_id']);

        if ($packages->isEmpty()) {
            return [];
        }

        $items = DB::table('unit_registration_package_items')
            ->whereIn('package_id', $packages->pluck('id')->all())
            ->orderBy('id')
            ->get(['id', 'package_id', 'unit_number', 'residence_type']);

        $proofs = Schema::hasTable('unit_proof_documents')
            ? DB::table('unit_proof_documents')
                ->whereIn('package_item_id', $items->pluck('id')->all())
                ->orderBy('id')
                ->get(['package_item_id', 'kind', 'file_url'])
            : collect();

        $proofsByItem = [];
        foreach ($proofs as $proof) {
            $url = $this->resolveMediaUrl($proof->file_url ?? null);
            if (! $url) {
                continue;
            }
            $kind = (string) $proof->kind;
            $pathKey = $this->mediaPathKey($url);
            $already = false;
            foreach ($proofsByItem[$proof->package_item_id] ?? [] as $existing) {
                $sameKind = ($existing['kind'] ?? '') === $kind;
                $sameFile = $pathKey !== '' && $this->mediaPathKey($existing['file_url'] ?? null) === $pathKey;
                if ($sameKind && ($kind === 'utility_bill' || $sameFile)) {
                    $already = true;
                    break;
                }
            }
            if ($already) {
                continue;
            }
            $proofsByItem[$proof->package_item_id][] = [
                'kind' => $kind,
                'file_url' => $url,
            ];
        }

        $itemsByPackage = $items->groupBy('package_id');
        $out = [];
        foreach ($packages as $package) {
            $key = $package->user_id.':'.$package->community_id;
            foreach ($itemsByPackage->get($package->id, collect()) as $item) {
                $number = trim((string) $item->unit_number);
                if ($number === '') {
                    continue;
                }
                $out[$key][] = [
                    'unit_number' => $number,
                    'residence_type' => $item->residence_type ? (string) $item->residence_type : null,
                    'documents' => $proofsByItem[$item->id] ?? [],
                ];
            }
        }

        return $out;
    }
}
