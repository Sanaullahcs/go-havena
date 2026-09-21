<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
            'type'               => 'required|in:noise,harassment,damage,spam,safety,other',
            'title'              => 'required|string|max:200',
            'description'        => 'required|string',
            'reported_user_id'   => 'nullable|integer|exists:users,id',
            'severity'           => 'in:low,medium,high,critical',
        ]);

        $id = DB::table('reports')->insertGetId([
            'community_id'     => $request->community_id ?? 1,
            'reporter_id'      => auth()->id(),
            'reported_user_id' => $request->reported_user_id,
            'type'             => $request->type,
            'title'            => $request->title,
            'description'      => $request->description,
            'severity'         => $request->severity ?? 'medium',
            'status'           => 'open',
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        return response()->json(['data' => ['id' => $id], 'message' => 'Report filed successfully'], 201);
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
}
