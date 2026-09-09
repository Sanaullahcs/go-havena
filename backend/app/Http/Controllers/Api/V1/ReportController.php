<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use App\Services\UserBlockService;
use App\Support\ReportTypes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ReportController extends Controller
{
    /** GET /v1/admin/reports */
    public function index(Request $request)
    {
        $communityId = $request->community_id ?? 1;

        $query = DB::table('reports')
            ->join('users as reporter', 'reporter.id', '=', 'reports.reporter_id')
            ->leftJoin('users as reported', 'reported.id', '=', 'reports.reported_user_id')
            ->leftJoin('profiles as rp', 'rp.user_id', '=', 'reports.reporter_id')
            ->select(
                'reports.*',
                'reporter.name as reporter_name', 'reporter.email as reporter_email',
                'reported.name as reported_name',
                'rp.unit_number as reporter_unit'
            )
            ->where('reports.community_id', $communityId)
            ->whereNull('reports.deleted_at');

        if (Schema::hasTable('listings') && Schema::hasColumn('reports', 'listing_id')) {
            $query->leftJoin('listings', 'listings.id', '=', 'reports.listing_id')
                ->addSelect('listings.title as listing_title');
        }

        if (Schema::hasTable('notices') && Schema::hasColumn('reports', 'notice_id')) {
            $query->leftJoin('notices', 'notices.id', '=', 'reports.notice_id')
                ->addSelect('notices.title as event_title');
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('reports.status', $request->status);
        }
        if ($request->filled('type') && $request->type !== 'all') {
            $query->where('reports.type', $request->type);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('reports.title', 'like', "%{$s}%")
                  ->orWhere('reports.description', 'like', "%{$s}%")
                  ->orWhere('reporter.name', 'like', "%{$s}%");
            });
        }

        $reports = $query->orderBy('reports.created_at', 'desc')
                         ->paginate($request->per_page ?? 15);

        return response()->json(['data' => $reports->items(), 'meta' => [
            'current_page' => $reports->currentPage(),
            'last_page'    => $reports->lastPage(),
            'total'        => $reports->total(),
        ]]);
    }

    /** POST /v1/reports (resident files a report) */
    public function store(Request $request)
    {
        $request->validate([
            'type'               => ReportTypes::requestRules(true)['type'],
            'title'              => 'nullable|string|max:200',
            'description'        => 'nullable|string|max:2000',
            'reported_user_id'   => 'nullable|integer|exists:users,id',
            'listing_id'         => 'nullable|integer|exists:listings,id',
            'notice_id'          => 'nullable|integer|exists:notices,id',
            'severity'           => 'nullable|in:low,medium,high,critical',
        ]);

        $reporterId = (int) auth()->id();
        $listingId = $request->filled('listing_id') ? (int) $request->listing_id : null;
        $noticeId = $request->filled('notice_id') ? (int) $request->notice_id : null;
        $reportedUserId = $request->filled('reported_user_id') ? (int) $request->reported_user_id : null;
        [$type, $description] = ReportTypes::resolvePayload($request);

        if (! $listingId && ! $noticeId && ! $reportedUserId) {
            return response()->json(['message' => 'Choose a resident, listing, or event to report.'], 422);
        }

        $listing = null;
        if ($listingId) {
            $listing = DB::table('listings')->where('id', $listingId)->whereNull('deleted_at')->first();
            if (! $listing) {
                return response()->json(['message' => 'Listing not found'], 404);
            }
            if ((int) $listing->user_id === $reporterId) {
                return response()->json(['message' => 'You cannot report your own listing'], 422);
            }
            $reportedUserId = (int) $listing->user_id;
        }

        $notice = null;
        if ($noticeId) {
            $notice = DB::table('notices')->where('id', $noticeId)->first();
            if (! $notice || ($notice->category ?? '') !== 'event') {
                return response()->json(['message' => 'Event not found'], 404);
            }
            if ((int) $notice->author_id === $reporterId) {
                return response()->json(['message' => 'You cannot report your own event'], 422);
            }
            $reportedUserId = (int) $notice->author_id;
        }

        if ($reportedUserId === $reporterId) {
            return response()->json(['message' => 'You cannot report yourself'], 422);
        }

        $communityId = $listing
            ? (int) $listing->community_id
            : ($notice
                ? (int) $notice->community_id
                : $this->resolveCommunityId($request, $reporterId, $reportedUserId));

        if ($communityId < 1) {
            return response()->json(['message' => 'Join a community to file a report.'], 403);
        }

        if (! UserBlockService::canBlock($reporterId, $reportedUserId, $communityId)) {
            return response()->json([
                'message' => $listingId
                    ? 'You can only report a listing created by another resident.'
                    : ($noticeId
                        ? 'You can only report an event created by another resident.'
                        : 'You can only report another resident.'),
            ], 422);
        }

        $already = DB::table('reports')
            ->where('reporter_id', $reporterId)
            ->where('reported_user_id', $reportedUserId)
            ->where('status', 'open')
            ->whereNull('deleted_at');

        if (Schema::hasColumn('reports', 'listing_id')) {
            if ($listingId) {
                $already->where('listing_id', $listingId);
            } else {
                $already->whereNull('listing_id');
            }
        }

        if (Schema::hasColumn('reports', 'notice_id')) {
            if ($noticeId) {
                $already->where('notice_id', $noticeId);
            } else {
                $already->whereNull('notice_id');
            }
        }

        if ($already->exists()) {
            return response()->json(['message' => 'You have already reported this.'], 422);
        }

        $reportedName = $this->displayName($reportedUserId);
        $title = trim((string) $request->input('title', ''));
        if ($title === '') {
            $title = $listing
                ? 'Reported marketplace listing: '.$listing->title
                : ($notice
                    ? 'Reported event: '.$notice->title
                    : 'Reported resident: '.$reportedName);
        }

        $payload = [
            'community_id'     => $communityId,
            'reporter_id'      => $reporterId,
            'reported_user_id' => $reportedUserId,
            'type'             => $type,
            'title'            => Str::limit($title, 200, ''),
            'description'      => $description !== '' ? $description : $title,
            'severity'         => $request->input('severity', 'medium'),
            'status'           => 'open',
            'created_at'       => now(),
            'updated_at'       => now(),
        ];

        if (Schema::hasColumn('reports', 'listing_id')) {
            $payload['listing_id'] = $listingId;
        }
        if (Schema::hasColumn('reports', 'notice_id')) {
            $payload['notice_id'] = $noticeId;
        }

        $id = DB::table('reports')->insertGetId($payload);

        $activityKind = $listingId
            ? 'listing_reported_by_resident'
            : ($noticeId ? 'event_reported_by_resident' : 'user_reported_by_resident');

        ActivityLogService::user(
            $activityKind,
            $listingId
                ? 'Reported marketplace listing #'.$listingId
                : ($noticeId
                    ? 'Reported event #'.$noticeId
                    : 'Reported resident #'.$reportedUserId),
            $listingId ? 'Listing' : ($noticeId ? 'Notice' : 'User'),
            $listingId ?: ($noticeId ?: $reportedUserId),
            'warning',
            null,
            [
                'reported_user_id' => $reportedUserId,
                'listing_id'       => $listingId,
                'notice_id'        => $noticeId,
                'reason'           => Str::limit($description !== '' ? $description : $type, 120),
            ],
        );

        $this->notifyCommunityAdmins(
            $communityId,
            $reporterId,
            $listingId ? 'Marketplace listing reported' : ($noticeId ? 'Event reported' : 'Resident reported'),
            $listingId
                ? "A resident reported \"{$listing->title}\"."
                : ($noticeId
                    ? "A resident reported \"{$notice->title}\"."
                    : "A resident reported {$reportedName}."),
        );

        return response()->json([
            'data' => [
                'id'               => $id,
                'reported_user_id' => $reportedUserId,
                'listing_id'       => $listingId,
                'notice_id'        => $noticeId,
            ],
            'message' => 'Report submitted. Admins will review it.',
        ], 201);
    }

    /** PATCH /v1/admin/reports/{id}/resolve */
    public function resolve(int $id, Request $request)
    {
        DB::table('reports')->where('id', $id)->update([
            'status'          => 'resolved',
            'resolved_by'     => auth()->id(),
            'resolved_at'     => now(),
            'resolution_note' => $request->resolution_note,
            'updated_at'      => now(),
        ]);

        $report = DB::table('reports')->find($id);
        ActivityLogService::user('report_resolved', "Resolved report #{$id}: {$report->title}", 'Report', $id);
        NotificationService::send($report->reporter_id, 'success', 'Report Resolved', "Your report \"{$report->title}\" has been resolved.");

        return response()->json(['message' => 'Report resolved']);
    }

    /** PATCH /v1/admin/reports/{id}/escalate */
    public function escalate(int $id)
    {
        DB::table('reports')->where('id', $id)->update([
            'status'     => 'escalated',
            'updated_at' => now(),
        ]);

        $report = DB::table('reports')->find($id);
        ActivityLogService::user('report_escalated', "Escalated report #{$id}: {$report->title}", 'Report', $id, 'warning');

        return response()->json(['message' => 'Report escalated']);
    }

    /** PATCH /v1/admin/reports/{id}/dismiss */
    public function dismiss(int $id)
    {
        DB::table('reports')->where('id', $id)->update([
            'status'     => 'dismissed',
            'updated_at' => now(),
        ]);
        return response()->json(['message' => 'Report dismissed']);
    }

    private function resolveCommunityId(Request $request, int $reporterId, int $reportedUserId): int
    {
        $fromRequest = (int) ($request->community_id ?: $request->header('X-Community-Id'));
        if ($fromRequest > 0) {
            return $fromRequest;
        }

        if (! Schema::hasTable('community_memberships')) {
            return 0;
        }

        $shared = DB::table('community_memberships as a')
            ->join('community_memberships as b', function ($join) {
                $join->on('a.community_id', '=', 'b.community_id')
                    ->where('b.status', 'approved');
            })
            ->where('a.user_id', $reporterId)
            ->where('a.status', 'approved')
            ->where('b.user_id', $reportedUserId)
            ->value('a.community_id');

        return $shared ? (int) $shared : 0;
    }

    private function displayName(int $userId): string
    {
        $row = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.id', $userId)
            ->selectRaw('COALESCE(profiles.display_name, users.name) as display_name')
            ->first();

        return (string) ($row->display_name ?? 'User #'.$userId);
    }

    private function notifyCommunityAdmins(int $communityId, int $exceptUserId, string $title, string $body): void
    {
        if (! Schema::hasTable('community_memberships')) {
            return;
        }

        $adminIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator', 'community_admin'])
            ->where('user_id', '!=', $exceptUserId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                $adminId,
                'warning',
                $title,
                $body,
                '/admin/moderation',
                ['kind' => 'ugc_report'],
            );
        }
    }
}
