<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogQueryService;
use App\Services\AdminRoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityLogController extends Controller
{
    public function __construct(private readonly ActivityLogQueryService $logs)
    {
    }

    /** GET /activity-logs — System Admin only. */
    public function index(Request $request): JsonResponse
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $tab = (string) $request->get('tab', $request->get('type') === 'system' ? 'system' : 'all');

        return response()->json($this->logs->paginate($request, [
            'tab' => $tab === 'all' || $tab === 'user' ? null : $tab,
        ]));
    }

    public function store(): JsonResponse
    {
        return response()->json(['message' => 'Audit logs are append-only and cannot be created from the client.'], 403);
    }

    public function stats(Request $request): JsonResponse
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

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
            'counts' => $counts,
            'today_total' => $todayTotal,
            'today_errors' => $todayErrors,
        ]);
    }

    /** GET /admin/community-admins/{id}/activity-logs */
    public function communityAdmin(Request $request, int $id): JsonResponse
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $admin = DB::table('users')->where('id', $id)->where('role', 'community_admin')->first();
        if (! $admin) {
            return response()->json(['message' => 'Community admin not found'], 404);
        }

        $payload = $this->logs->paginate($request, [
            'actor_user_id' => $id,
        ]);
        $payload['meta'] = [
            'current_page' => $payload['current_page'],
            'last_page' => $payload['last_page'],
            'per_page' => $payload['per_page'],
            'total' => $payload['total'],
            'community_admin' => [
                'id' => (int) $admin->id,
                'name' => $admin->name,
            ],
        ];

        return response()->json($payload);
    }

    /** GET /admin/communities/{id}/activity-logs */
    public function community(Request $request, int $id): JsonResponse
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $community = DB::table('communities')->where('id', $id)->first();
        if (! $community) {
            return response()->json(['message' => 'Community not found'], 404);
        }

        $request->attributes->set('activity_community_locked', true);
        $payload = $this->logs->paginate($request, [
            'community_id' => $id,
        ]);
        $payload['meta'] = [
            'current_page' => $payload['current_page'],
            'last_page' => $payload['last_page'],
            'per_page' => $payload['per_page'],
            'total' => $payload['total'],
            'community' => [
                'id' => (int) $community->id,
                'name' => $community->name,
            ],
        ];

        return response()->json($payload);
    }
}
