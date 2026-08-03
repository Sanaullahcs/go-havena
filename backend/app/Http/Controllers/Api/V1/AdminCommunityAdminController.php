<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\CommunityLifecycleService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminCommunityAdminController extends Controller
{
    /** GET /v1/admin/community-admins */
    public function index(Request $request): JsonResponse
    {
        $status = $request->string('status')->trim()->toString() ?: 'pending';
        $search = $request->string('search')->trim()->toString();

        if ($status === 'reassign') {
            return $this->reassignIndex($request);
        }

        $query = User::query()
            ->with(['profile', 'memberships.community'])
            ->where('role', 'community_admin');

        if ($status === 'approved') {
            $query->where('community_admin_status', 'approved')
                ->where('status', 'active');
        } elseif ($status === 'suspended') {
            $communityIds = app(CommunityLifecycleService::class)->communityIdsNeedingAdminReassignment();
            $query->where('community_admin_status', 'approved')
                ->where('status', 'suspended')
                ->whereHas('memberships', function ($membership) {
                    $membership->where('role', 'admin')->where('status', 'approved');
                })
                ->whereDoesntHave('memberships', function ($membership) use ($communityIds) {
                    $membership->where('role', 'admin')
                        ->where('status', 'approved')
                        ->whereIn('community_id', $communityIds ?: [-1]);
                });
        } elseif (in_array($status, ['pending', 'rejected'], true)) {
            $query->where('community_admin_status', $status);
        }

        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like);
            });
        }

        $items = $query->orderByDesc('created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        $reassignCommunityIds = app(CommunityLifecycleService::class)->communityIdsNeedingAdminReassignment();
        $stats = $this->buildStats();

        return response()->json([
            'data' => collect($items->items())
                ->map(fn (User $u) => $this->transform($u, $reassignCommunityIds))
                ->values(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
                'per_page'     => $items->perPage(),
                'stats'        => $stats,
            ],
        ]);
    }

    /** PATCH /v1/admin/community-admins/{id}/approve — also used to re-approve rejected applicants. */
    public function approve(int $id): JsonResponse
    {
        $user = $this->findApprovableAdmin($id);
        $wasRejected = ($user->community_admin_status ?? '') === 'rejected';

        $user->update([
            'community_admin_status'           => 'approved',
            'community_admin_rejection_reason' => null,
            'status'                           => 'active',
        ]);

        // Only approve admin membership for live communities — new community requests
        // stay pending until the community request itself is approved.
        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->where('status', 'pending')
            ->whereHas('community', function ($query) {
                $query->where(function ($w) {
                    $w->whereNull('review_status')
                        ->orWhere('review_status', 'approved');
                });
            })
            ->update(['status' => 'approved']);

        NotificationService::send(
            $user->id,
            'success',
            'Community admin approved',
            $this->communityApprovalMessage($user),
        );

        ActivityLogService::user(
            'community_admin_approved',
            "Approved community admin: {$user->name}",
            'User',
            $user->id,
        );

        return response()->json([
            'data'    => $this->transform($user->fresh(['profile', 'memberships.community'])),
            'message' => $wasRejected ? 'Community admin re-approved' : 'Community admin approved',
        ]);
    }

    /** PATCH /v1/admin/community-admins/{id}/reject */
    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $user = $this->findPendingAdmin($id);

        $reason = $request->input('reason');

        $user->update([
            'community_admin_status' => 'rejected',
            'community_admin_rejection_reason' => $reason ? trim((string) $reason) : null,
        ]);
        $body   = $reason
            ? "Your community admin application was not approved. Reason: {$reason}"
            : 'Your community admin application was not approved. Please contact support.';

        NotificationService::send($user->id, 'warning', 'Community admin not approved', $body);

        ActivityLogService::user(
            'community_admin_rejected',
            "Rejected community admin: {$user->name}",
            'User',
            $user->id,
        );

        return response()->json([
            'data'    => $this->transform($user->fresh(['profile', 'memberships.community'])),
            'message' => 'Community admin rejected',
        ]);
    }

    /** PATCH /v1/admin/community-admins/{id}/suspend */
    public function suspend(int $id, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $user = User::query()
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->where('community_admin_status', 'approved')
            ->first();

        if (! $user) {
            return response()->json(['message' => 'Approved community admin not found.'], 404);
        }

        if ($user->status === 'suspended') {
            return response()->json(['message' => 'This community admin is already suspended.'], 422);
        }

        $lifecycle->suspendCommunityAdmin($user);

        ActivityLogService::user(
            'community_admin_suspended',
            "Suspended community admin: {$user->name}",
            'User',
            $user->id,
            'warning',
        );

        NotificationService::send(
            $user->id,
            'warning',
            'Admin access suspended',
            'Your community admin access has been suspended by the system administrator.',
        );

        return response()->json([
            'data'    => $this->transform($user->fresh(['profile', 'memberships.community'])),
            'message' => 'Community admin suspended. The community and its residents remain active.',
        ]);
    }

    /** GET /v1/admin/community-admins?status=reassign — communities needing an active admin. */
    private function reassignIndex(Request $request): JsonResponse
    {
        $search = $request->string('search')->trim()->toString();
        $page = max(1, (int) ($request->page ?? 1));
        $perPage = min((int) ($request->per_page ?? 15), 100);

        $lifecycle = app(CommunityLifecycleService::class);
        $communityIds = $lifecycle->communityIdsNeedingAdminReassignment();

        $communities = Community::query()
            ->whereIn('id', $communityIds ?: [-1])
            ->orderByDesc('updated_at')
            ->get();

        $rows = $communities
            ->map(fn (Community $community) => $this->transformReassignRow(
                $community,
                $this->findPreviousAdminForCommunity($community),
            ));

        if ($search !== '') {
            $needle = mb_strtolower($search);
            $rows = $rows->filter(function (array $row) use ($needle) {
                $haystack = mb_strtolower(implode(' ', array_filter([
                    $row['name'] ?? '',
                    $row['email'] ?? '',
                    $row['phone'] ?? '',
                    $row['community_request']['name'] ?? '',
                    $row['community_request']['region'] ?? '',
                ])));

                return str_contains($haystack, $needle);
            })->values();
        }

        $total = $rows->count();
        $items = $rows->slice(($page - 1) * $perPage, $perPage)->values();
        $stats = $this->buildStats();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $page,
                'last_page'    => max(1, (int) ceil($total / $perPage)),
                'total'        => $total,
                'per_page'     => $perPage,
                'stats'        => $stats,
            ],
        ]);
    }

    private function buildStats(): array
    {
        $statsBase = User::query()->where('role', 'community_admin');
        $reassignCommunityIds = app(CommunityLifecycleService::class)->communityIdsNeedingAdminReassignment();

        $suspendedOnly = (clone $statsBase)
            ->where('community_admin_status', 'approved')
            ->where('status', 'suspended')
            ->whereHas('memberships', function ($membership) {
                $membership->where('role', 'admin')->where('status', 'approved');
            })
            ->whereDoesntHave('memberships', function ($membership) use ($reassignCommunityIds) {
                $membership->where('role', 'admin')
                    ->where('status', 'approved')
                    ->whereIn('community_id', $reassignCommunityIds ?: [-1]);
            })
            ->count();

        return [
            'total'          => (clone $statsBase)->count(),
            'pending'        => (clone $statsBase)->where('community_admin_status', 'pending')->count(),
            'active'         => (clone $statsBase)->where('community_admin_status', 'approved')->where('status', 'active')->count(),
            'approved'       => (clone $statsBase)->where('community_admin_status', 'approved')->where('status', 'active')->count(),
            'suspended'      => $suspendedOnly,
            'needs_reassign' => count($reassignCommunityIds),
            'rejected'       => (clone $statsBase)->where('community_admin_status', 'rejected')->count(),
        ];
    }

    private function findPreviousAdminForCommunity(Community $community): ?User
    {
        $adminUserIds = CommunityMembership::query()
            ->where('community_id', $community->id)
            ->where('role', 'admin')
            ->pluck('user_id');

        if ($adminUserIds->isEmpty()) {
            return null;
        }

        return User::query()
            ->with(['profile', 'memberships.community'])
            ->whereIn('id', $adminUserIds)
            ->where('role', 'community_admin')
            ->where('status', 'suspended')
            ->orderByDesc('updated_at')
            ->first();
    }

    private function transformReassignRow(Community $community, ?User $previousAdmin): array
    {
        $communityPayload = [
            'id'            => $community->id,
            'name'          => $community->name,
            'review_status' => $community->review_status,
            'status'        => $community->status,
            'region'        => $community->region,
        ];

        if ($previousAdmin) {
            $row = $this->transform($previousAdmin, [$community->id]);
            $row['needs_reassign'] = true;
            $row['reassign_reason'] = 'previous_admin_suspended';
            $row['community_request'] = $communityPayload;

            return $row;
        }

        return [
            'id'                     => 0,
            'reassign_row_id'        => 'community-'.$community->id,
            'name'                   => 'Administrator needed',
            'email'                  => null,
            'phone'                  => null,
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'unassigned',
            'suspension_reason'      => null,
            'needs_reassign'         => true,
            'reassign_reason'        => 'missing_admin',
            'created_at'             => $community->created_at?->toIso8601String(),
            'profile'                => null,
            'community_request'      => $communityPayload,
        ];
    }

    private function findApprovableAdmin(int $id): User
    {
        $user = User::query()
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            abort(404, 'Community admin applicant not found');
        }

        if (! in_array($user->community_admin_status ?? '', ['pending', 'rejected'], true)) {
            abort(422, 'This community admin application is not awaiting approval');
        }

        return $user;
    }

    private function findPendingAdmin(int $id): User
    {
        $user = User::query()
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            abort(404, 'Community admin applicant not found');
        }

        if (($user->community_admin_status ?? '') !== 'pending') {
            abort(422, 'This community admin application is not pending review');
        }

        return $user;
    }

    private function communityApprovalMessage(User $user): string
    {
        $hasPendingCommunity = CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->whereHas('community', fn ($q) => $q->where('review_status', 'pending'))
            ->exists();

        if ($hasPendingCommunity) {
            return 'Your community admin account has been approved. Your community request is still under review — you will get full access once a system administrator approves it.';
        }

        return 'Your community admin account has been approved. You can now manage your community in Havena.';
    }

    private function transform(User $user, array $reassignCommunityIds = []): array
    {
        $membership = $user->memberships->firstWhere('role', 'admin') ?? $user->memberships->first();
        $community  = $membership?->community;
        $needsReassign = $user->status === 'suspended'
            && ($membership?->role === 'admin' && $membership?->status === 'approved')
            && $community
            && in_array($community->id, $reassignCommunityIds, true);

        return [
            'id'                     => $user->id,
            'name'                   => $user->name,
            'email'                  => $user->email,
            'phone'                  => $user->phone,
            'role'                   => $user->role,
            'avatar_url'             => $this->resolveMediaUrl($user->profile?->avatar_url),
            'community_admin_status'         => $user->community_admin_status,
            'community_admin_rejection_reason' => $user->community_admin_rejection_reason,
            'status'                         => $user->status,
            'suspension_reason'              => $user->suspension_reason,
            'needs_reassign'         => $needsReassign,
            'created_at'             => $user->created_at?->toIso8601String(),
            'profile'                => $user->profile ? [
                'display_name'     => $user->profile->display_name,
                'unit_number'      => $user->profile->unit_number,
                'residence_type'   => $user->profile->residence_type,
                'avatar_url'       => $this->resolveMediaUrl($user->profile->avatar_url),
                'utility_bill_url' => $this->resolveMediaUrl($user->profile->utility_bill_url),
            ] : null,
            'community_request'      => $community ? [
                'id'            => $community->id,
                'name'          => $community->name,
                'review_status' => $community->review_status,
                'status'        => $community->status,
                'region'        => $community->region,
            ] : null,
        ];
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
