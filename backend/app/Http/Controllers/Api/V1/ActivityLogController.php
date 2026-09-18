<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ActivityActionCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityLogController extends Controller
{
    /** GET /activity-logs?type=user|system&severity=&search=&per_page=25&page=1 */
    public function index(Request $request): JsonResponse
    {
        $query = DB::table('activity_logs as a')
            ->leftJoin('users as u', 'u.id', '=', 'a.user_id')
            ->select([
                'a.id',
                'a.log_type',
                'a.action',
                'a.description',
                'a.entity_type',
                'a.entity_id',
                'a.ip_address',
                'a.user_agent',
                'a.severity',
                'a.meta',
                'a.created_at',
                'u.name as user_name',
                'u.email as user_email',
                'u.role as user_role',
            ])
            ->orderByDesc('a.created_at');

        if ($type = $request->get('type')) {
            $query->where('a.log_type', $type);
        }

        if ($severity = $request->get('severity')) {
            $query->where('a.severity', $severity);
        }

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('a.description', 'like', "%{$search}%")
                  ->orWhere('a.action', 'like', "%{$search}%")
                  ->orWhere('a.entity_type', 'like', "%{$search}%")
                  ->orWhere('a.meta', 'like', "%{$search}%")
                  ->orWhere('u.name', 'like', "%{$search}%");
            });
        }

        if ($date = $request->get('date')) {
            $query->whereDate('a.created_at', $date);
        }

        $perPage = min((int) $request->get('per_page', 25), 100);
        $result  = $query->paginate($perPage);
        $items = collect($result->items())->map(function ($row) {
            $formatted = ActivityActionCatalog::formatLogRow($row);

            return array_merge($formatted, [
                'log_type'   => $row->log_type ?? 'user',
                'user_name'  => $row->user_name ?? null,
                'user_email' => $row->user_email ?? null,
                'user_role'  => $row->user_role ?? null,
                'user_agent' => $row->user_agent ?? null,
            ]);
        })->values();

        return response()->json([
            'data'         => $items,
            'current_page' => $result->currentPage(),
            'last_page'    => $result->lastPage(),
            'per_page'     => $result->perPage(),
            'total'        => $result->total(),
        ]);
    }

    /** POST /activity-logs — record a log entry */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'log_type'    => ['required', 'in:user,system'],
            'action'      => ['required', 'string', 'max:100'],
            'description' => ['required', 'string', 'max:500'],
            'entity_type' => ['nullable', 'string', 'max:100'],
            'entity_id'   => ['nullable', 'integer'],
            'severity'    => ['nullable', 'in:info,warning,error,critical'],
            'meta'        => ['nullable', 'array'],
        ]);

        $id = DB::table('activity_logs')->insertGetId(array_merge($validated, [
            'user_id'    => $request->user()?->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        return response()->json(['id' => $id], 201);
    }

    /** GET /activity-logs/stats — summary counts */
    public function stats(): JsonResponse
    {
        $counts = DB::table('activity_logs')
            ->select('log_type', 'severity', DB::raw('COUNT(*) as count'))
            ->groupBy('log_type', 'severity')
            ->get();

        $todayTotal = DB::table('activity_logs')
            ->whereDate('created_at', today())
            ->count();

        $todayErrors = DB::table('activity_logs')
            ->whereDate('created_at', today())
            ->whereIn('severity', ['error', 'critical'])
            ->count();

        return response()->json([
            'counts'       => $counts,
            'today_total'  => $todayTotal,
            'today_errors' => $todayErrors,
        ]);
    }
}
