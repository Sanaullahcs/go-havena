<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Models\User as UserModel;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\NotificationService;
use App\Services\ReferralService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
            $query->where('community_admin_status', 'approved')
                ->where('status', 'suspended')
                ->whereHas('memberships', function ($membership) {
                    $membership->where('role', 'admin');
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

    /** PATCH /v1/admin/community-admins/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::query()
            ->with(['profile', 'memberships.community'])
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            return response()->json(['message' => 'Community admin not found.'], 404);
        }

        $request->validate([
            'name' => 'sometimes|required|string|min:2|max:100',
            'phone' => 'sometimes|required|string|max:30',
            'email' => [
                'sometimes',
                'required',
                'string',
                'email',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (UserModel::isPhonePlaceholderEmail(is_string($value) ? $value : null)) {
                        $fail('Enter a personal email address.');
                    }
                },
            ],
            'display_name' => 'sometimes|nullable|string|max:50',
            'unit_number' => 'sometimes|required|string|max:50',
            'residence_type' => 'sometimes|required|string|in:homeowner,tenant',
        ]);

        if ($request->filled('name')) {
            $user->update(['name' => trim((string) $request->input('name'))]);
        }

        if ($request->has('phone')) {
            $phone = PhoneNormalizer::normalize($request->phone);
            if (! $phone) {
                throw ValidationException::withMessages([
                    'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
                ]);
            }

            ContactIdentityService::assertAvailableForRegistration(null, $phone, $user->id, 'phone');
            $user->update(['phone' => $phone]);
        }

        if ($request->filled('email')) {
            $email = strtolower(trim((string) $request->email));
            ContactIdentityService::assertAvailableForRegistration($email, null, $user->id, 'email');
            $user->update(['email' => $email]);
        }

        $profileData = [];
        if ($request->has('display_name')) {
            $profileData['display_name'] = trim((string) $request->input('display_name'));
        }
        if ($request->has('unit_number')) {
            $profileData['unit_number'] = trim((string) $request->input('unit_number'));
        }
        if ($request->has('residence_type')) {
            $profileData['residence_type'] = $request->input('residence_type');
        }

        if ($profileData !== []) {
            $user->profile()->updateOrCreate(['user_id' => $user->id], $profileData);
        }

        ActivityLogService::user(
            'community_admin_updated',
            "Updated community admin profile: {$user->name}",
            'User',
            $user->id,
        );

        $fresh = $user->fresh(['profile', 'memberships.community']);

        return response()->json([
            'data' => $this->transform($fresh),
            'message' => 'Community admin updated',
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

        $user->refresh()->load(['memberships.community']);
        $access = app(\App\Services\CommunityAdminAccessService::class);
        foreach ($user->memberships as $membership) {
            if (! $membership->community_id) {
                continue;
            }

            if ($wasRejected) {
                $access->prepareBillingAfterAdminReApproval((int) $membership->community_id);
            } elseif ($membership->community) {
                $access->activateTrialIfApproved($membership->community);
            }
        }

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

        app(ReferralService::class)->ensureReferralCode($user->fresh());

        $fresh = $user->fresh(['profile', 'memberships.community']);
        app(\App\Services\LifecycleMailService::class)->communityAdminApproved(
            $fresh,
            $fresh->memberships->first()?->community,
        );

        return response()->json([
            'data'    => $this->transform($fresh),
            'message' => $wasRejected ? 'Community admin re-approved' : 'Community admin approved',
        ]);
    }

    /** PATCH /v1/admin/community-admins/{id}/reject */
    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $user = $this->findRejectableAdmin($id);
        $wasApproved = ($user->community_admin_status ?? '') === 'approved';

        $reason = $request->input('reason');

        $user->update([
            'community_admin_status' => 'rejected',
            'community_admin_rejection_reason' => $reason ? trim((string) $reason) : null,
        ]);

        $user->loadMissing('memberships');
        $access = app(\App\Services\CommunityAdminAccessService::class);
        foreach ($user->memberships as $membership) {
            if ($membership->community_id) {
                $access->cancelBillingOnRejection((int) $membership->community_id, $wasApproved
                    ? 'community_admin_revoked'
                    : 'community_admin_rejected');
            }
        }

        $body = $wasApproved
            ? ($reason
                ? "Your community admin access was revoked. Your subscription has been canceled and you will not be charged again. Reason: {$reason}"
                : 'Your community admin access was revoked. Your subscription has been canceled and you will not be charged again.')
            : ($reason
                ? "Your community admin application was not approved. Reason: {$reason}"
                : 'Your community admin application was not approved. Please contact support.');

        NotificationService::send($user->id, 'warning', 'Community admin not approved', $body);

        ActivityLogService::user(
            'community_admin_rejected',
            "Rejected community admin: {$user->name}",
            'User',
            $user->id,
        );

        app(ReferralService::class)->disqualifyByRefereeUser(
            (int) $user->id,
            'Referee community admin was not approved.',
        );

        app(\App\Services\LifecycleMailService::class)->communityAdminRejected(
            $user->fresh(['profile']),
            $reason ? trim((string) $reason) : null,
            $wasApproved,
        );

        return response()->json([
            'data'    => $this->transform($user->fresh(['profile', 'memberships.community'])),
            'message' => $wasApproved ? 'Community admin revoked. Billing canceled.' : 'Community admin rejected',
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
            ))
            ->sortBy(fn (array $row) => match ($row['reassign_reason'] ?? '') {
                'community_inactive' => 0,
                'previous_admin_suspended' => 1,
                'previous_admin_removed' => 2,
                default => 3,
            })
            ->values();

        if ($search !== '') {
            $needle = mb_strtolower($search);
            $rows = $rows->filter(function (array $row) use ($needle) {
                $haystack = mb_strtolower(implode(' ', array_filter([
                    $row['name'] ?? '',
                    $row['email'] ?? '',
                    $row['phone'] ?? '',
                    $row['reassign_summary'] ?? '',
                    $row['previous_admin']['name'] ?? '',
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
                $membership->where('role', 'admin');
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

        // Prefer suspended / rejected / inactive former admins — not pending applicants.
        return User::query()
            ->with(['profile', 'memberships.community'])
            ->whereIn('id', $adminUserIds)
            ->where('role', 'community_admin')
            ->where(function ($q) {
                $q->where('status', 'suspended')
                    ->orWhere('community_admin_status', 'rejected')
                    ->orWhere(function ($approvedInactive) {
                        $approvedInactive
                            ->where('community_admin_status', 'approved')
                            ->where('status', '!=', 'active');
                    });
            })
            ->orderByRaw("CASE WHEN status = 'suspended' THEN 0 WHEN community_admin_status = 'rejected' THEN 1 ELSE 2 END")
            ->orderByDesc('updated_at')
            ->first();
    }

    private function transformReassignRow(Community $community, ?User $previousAdmin): array
    {
        $lifecycle = app(CommunityLifecycleService::class);
        $reason = $lifecycle->resolveReassignReason($community, $previousAdmin);
        $communityPayload = [
            'id'            => $community->id,
            'name'          => $community->name,
            'review_status' => $community->review_status,
            'status'        => $community->status,
            'region'        => $community->region,
        ];

        return [
            'id'                     => 0,
            'reassign_row_id'        => 'community-'.$community->id,
            'name'                   => $community->name,
            'email'                  => null,
            'phone'                  => null,
            'role'                   => 'community_admin',
            'community_admin_status' => 'approved',
            'status'                 => 'unassigned',
            'suspension_reason'      => null,
            'needs_reassign'         => true,
            'reassign_reason'        => $reason,
            'reassign_summary'       => $lifecycle->reassignSummaryFor($community, $previousAdmin),
            'previous_admin'         => $previousAdmin ? [
                'id'                => $previousAdmin->id,
                'name'              => $previousAdmin->name,
                'status'            => $previousAdmin->status,
                'suspension_reason' => $previousAdmin->suspension_reason,
            ] : null,
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

    private function findRejectableAdmin(int $id): User
    {
        $user = User::query()
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            abort(404, 'Community admin applicant not found');
        }

        if (! in_array($user->community_admin_status ?? '', ['pending', 'approved'], true)) {
            abort(422, 'This community admin cannot be rejected');
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
            && $membership?->role === 'admin'
            && $community
            && in_array($community->id, $reassignCommunityIds, true);

        $lifecycle = app(CommunityLifecycleService::class);
        $previousAdminForSummary = $user->status === 'suspended' ? $user : null;

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
            'reassign_summary'       => ($needsReassign && $community)
                ? $lifecycle->reassignSummaryFor($community, $previousAdminForSummary)
                : null,
            'created_at'             => $user->created_at?->toIso8601String(),
            'profile'                => $user->profile ? [
                'display_name'     => $user->profile->display_name,
                'unit_number'      => $user->profile->unit_number,
                'residence_type'   => $user->profile->residence_type,
                'avatar_url'       => $this->resolveMediaUrl($user->profile->avatar_url),
                'utility_bill_url' => $this->resolveMediaUrl($user->profile->utility_bill_url),
                'utility_bill_review_status' => $user->profile->utility_bill_review_status,
            ] : null,
            'community_request'      => $community ? [
                'id'            => $community->id,
                'name'          => $community->name,
                'review_status' => $community->review_status,
                'status'        => $community->status,
                'region'        => $community->region,
            ] : null,
            'billing' => app(\App\Services\CommunityAdminAccessService::class)
                ->billingSummaryForCommunity($community?->id ? (int) $community->id : null),
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
