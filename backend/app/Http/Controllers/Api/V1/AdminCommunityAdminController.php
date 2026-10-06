<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\NotificationService;
use App\Services\ReferralService;
use App\Services\UtilityBillUploadService;
use App\Support\CommunityAdminRecordStatus;
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

        app(CommunityLifecycleService::class)->retireSupersededCommunityAdmins();

        $query = User::query()
            ->with(['profile', 'memberships.community'])
            ->where('role', 'community_admin');

        CommunityAdminRecordStatus::applyScope($query, $status);

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

        $stats = $this->buildStats();

        return response()->json([
            'data' => collect($items->items())
                ->map(fn (User $u) => $this->transform($u))
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

    /** PATCH or POST /v1/admin/community-admins/{id} */
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

        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_EDIT);

        $request->validate([
            'name' => 'sometimes|required|string|min:2|max:50',
            'phone' => 'sometimes|required|string|max:30',
            'email' => [
                'sometimes',
                function (string $attribute, mixed $value, \Closure $fail) use ($user): void {
                    $submitted = strtolower(trim(is_string($value) ? $value : ''));
                    $current = strtolower(trim((string) $user->email));
                    if ($submitted !== $current) {
                        $fail('Email address cannot be changed from this form.');
                    }
                },
            ],
            'display_name' => 'sometimes|nullable|string|max:50',
            'office_address' => 'sometimes|required|string|max:255',
            'utility_bill' => 'sometimes|nullable|'.UtilityBillStorage::RULE,
        ], [
            'name.max' => 'Full name cannot exceed 50 characters.',
            'display_name.max' => 'Full name cannot exceed 50 characters.',
            'office_address.max' => 'Office address cannot exceed 255 characters.',
            'utility_bill.mimes' => 'Upload a JPG, PNG, HEIC, or PDF file.',
            'utility_bill.file' => 'Upload a JPG, PNG, HEIC, or PDF file.',
            'utility_bill.max' => 'File must be 10 MB or smaller.',
        ]);

        $user->loadMissing('profile');
        $before = [
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'display_name' => $user->profile?->display_name,
            'office_address' => $user->profile?->office_address,
            'utility_bill_url' => $user->profile?->utility_bill_url,
        ];

        if ($request->filled('name')) {
            $user->update(['name' => trim((string) $request->input('name'))]);
        }

        if ($request->has('phone')) {
            $phone = PhoneNormalizer::accept($request->phone);
            if (! $phone) {
                throw ValidationException::withMessages([
                    'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
                ]);
            }

            ContactIdentityService::assertAvailableForRegistration(null, $phone, $user->id, 'phone');
            $user->update(['phone' => $phone]);
        }

        $profileData = [];
        if ($request->has('display_name')) {
            $profileData['display_name'] = trim((string) $request->input('display_name'));
        }
        if ($request->has('office_address')) {
            $profileData['office_address'] = trim((string) $request->input('office_address'));
            $profileData['unit_number'] = null;
            $profileData['residence_type'] = null;
        }
        if ($request->hasFile('utility_bill')) {
            $upload = app(UtilityBillUploadService::class)->storeVerified($request->file('utility_bill'));
            $profileData['utility_bill_url'] = $upload['url'];
            $profileData['utility_bill_review_status'] = $upload['utility_bill_review_status'];
        }

        if ($profileData !== []) {
            $user->profile()->updateOrCreate(['user_id' => $user->id], $profileData);
        }

        $fresh = $user->fresh(['profile', 'memberships.community']);
        ActivityLogService::recordUpdate(
            'community_admin_updated',
            'User',
            (int) $user->id,
            $before,
            [
                'name' => $fresh->name,
                'email' => $fresh->email,
                'phone' => $fresh->phone,
                'display_name' => $fresh->profile?->display_name,
                'office_address' => $fresh->profile?->office_address,
                'utility_bill_url' => $fresh->profile?->utility_bill_url,
            ],
            [],
            $fresh->name,
            (int) $fresh->id,
            ['related_item' => $fresh->name],
        );

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
        $previousAdminStatus = $user->community_admin_status;
        $previousStatus = $user->status;

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

        ActivityLogService::recordChanges(
            'community_admin_approved',
            'User',
            $user->id,
            [
                ['field' => 'Admin Status', 'key' => 'community_admin_status', 'previous' => $previousAdminStatus, 'next' => 'approved'],
                ['field' => 'Status', 'key' => 'status', 'previous' => $previousStatus, 'next' => 'active'],
            ],
            $user->name,
            (int) $user->id,
            ['related_item' => $user->name],
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
        $previousAdminStatus = $user->community_admin_status;
        $previousReason = $user->community_admin_rejection_reason;

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

        ActivityLogService::recordChanges(
            'community_admin_rejected',
            'User',
            $user->id,
            [
                ['field' => 'Admin Status', 'key' => 'community_admin_status', 'previous' => $previousAdminStatus, 'next' => 'rejected'],
                ['field' => 'Rejection Reason', 'key' => 'community_admin_rejection_reason', 'previous' => $previousReason, 'next' => $reason ? trim((string) $reason) : null],
            ],
            $user->name,
            (int) $user->id,
            ['related_item' => $user->name],
            'warning',
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
        $user = $this->findManagedAdmin($id);
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_SUSPEND);

        $previousStatus = $user->status;
        $lifecycle->suspendCommunityAdmin($user);

        ActivityLogService::recordStatusChange(
            'community_admin_suspended',
            'User',
            $user->id,
            $previousStatus,
            'suspended',
            'Status',
            $user->name,
            (int) $user->id,
            ['related_item' => $user->name],
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

    /** PATCH /v1/admin/community-admins/{id}/reactivate */
    public function reactivate(int $id, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $user = $this->findManagedAdmin($id);
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_REACTIVATE);

        $previousStatus = $user->status;
        $lifecycle->reactivateCommunityAdmin($user);

        ActivityLogService::recordStatusChange(
            'community_admin_reactivated',
            'User',
            $user->id,
            $previousStatus,
            'active',
            'Status',
            $user->name,
            (int) $user->id,
            ['related_item' => $user->name],
        );

        NotificationService::send(
            $user->id,
            'success',
            'Admin access restored',
            'Your community admin access has been restored by the system administrator.',
        );

        return response()->json([
            'data'    => $this->transform($user->fresh(['profile', 'memberships.community'])),
            'message' => 'Community admin reactivated.',
        ]);
    }

    /** POST /v1/admin/community-admins/{id}/release */
    public function release(int $id, Request $request, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $user = $this->findManagedAdmin($id);
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_RELEASE);

        $membership = $user->memberships->first(
            fn ($item) => $item->role === 'admin' && in_array($item->status, ['approved', 'pending'], true),
        );
        $community = $membership?->community;
        if (! $community) {
            return response()->json(['message' => 'This community admin is not assigned to a community.'], 422);
        }

        $released = $lifecycle->releaseCommunityAdmin($community);
        $actor = $request->user();

        ActivityLogService::user(
            'community_admin_released',
            "Released {$released->name} as admin for {$community->name}",
            'User',
            $released->id,
            'info',
            $actor?->id,
            [
                'community_id' => $community->id,
                'community_name' => $community->name,
                'previous_admin' => [
                    'id' => $released->id,
                    'name' => $released->name,
                    'email' => $released->email,
                ],
                'new_admin' => null,
                'performed_by' => [
                    'id' => $actor?->id,
                    'name' => $actor?->name,
                    'email' => $actor?->email,
                ],
                'performed_at' => now()->toIso8601String(),
            ],
        );

        return response()->json([
            'data' => $this->transform($released->fresh(['profile', 'memberships.community'])),
            'message' => 'Community Admin released successfully. Assign a new community from the Reassign tab.',
        ]);
    }

    /** POST /v1/admin/community-admins/{id}/assign-community */
    public function assignCommunity(int $id, Request $request, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $request->validate([
            'community_id' => ['required', 'integer', 'exists:communities,id'],
        ]);

        $user = $this->findManagedAdmin($id);
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_ASSIGN_COMMUNITY);

        $community = Community::query()->findOrFail((int) $request->input('community_id'));

        try {
            $lifecycle->assertCanAdminCommunity($user, $community);
            $assigned = $lifecycle->assignCommunityAdmin($community, $user);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }

        $actor = $request->user();
        ActivityLogService::recordChanges(
            'community_admin_assigned',
            'User',
            $assigned->id,
            [[
                'field' => 'Community Assignment',
                'key' => 'community_assignment',
                'previous' => null,
                'next' => $community->name,
            ]],
            $assigned->name,
            (int) $assigned->id,
            [
                'community_id' => $community->id,
                'community_name' => $community->name,
                'new_admin' => [
                    'id' => $assigned->id,
                    'name' => $assigned->name,
                    'email' => $assigned->email,
                ],
                'related_item' => $community->name,
                'performed_by' => [
                    'id' => $actor?->id,
                    'name' => $actor?->name,
                    'email' => $actor?->email,
                ],
                'performed_at' => now()->toIso8601String(),
            ],
        );

        NotificationService::send(
            $assigned->id,
            'success',
            'Community admin access granted',
            "You have been assigned to manage {$community->name} in Havena.",
        );

        return response()->json([
            'data' => $this->transform($assigned->fresh(['profile', 'memberships.community'])),
            'message' => 'Community assigned. The admin is now Active.',
        ]);
    }

    /** DELETE /v1/admin/community-admins/{id} */
    public function destroy(Request $request, int $id, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $request->validate([
            'confirmation' => ['required', 'string', 'in:DELETE'],
        ]);

        $actor = $request->user();
        if ($actor && (int) $actor->id === (int) $id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 403);
        }

        $user = $this->findManagedAdmin($id);
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_DELETE);
        $wasRejected = CommunityAdminRecordStatus::resolve($user) === CommunityAdminRecordStatus::REJECTED;

        $snapshot = $lifecycle->deleteCommunityAdminAccount($user);

        ActivityLogService::user(
            'community_admin_deleted',
            $wasRejected
                ? "Deleted rejected community admin record: {$snapshot['deleted_admin']['name']}"
                : "Deleted community admin: {$snapshot['deleted_admin']['name']}",
            'User',
            $snapshot['deleted_admin']['id'],
            'warning',
            $actor?->id,
            [
                'deleted_admin' => $snapshot['deleted_admin'],
                'communities' => $snapshot['communities'],
                'record_only' => $wasRejected,
                'performed_by' => [
                    'id' => $actor?->id,
                    'name' => $actor?->name,
                    'email' => $actor?->email,
                ],
                'performed_at' => now()->toIso8601String(),
            ],
        );

        return response()->json([
            'message' => $wasRejected
                ? 'Rejected record deleted successfully.'
                : 'Community Admin deleted successfully.',
        ]);
    }

    private function buildStats(): array
    {
        $statsBase = User::query()->where('role', 'community_admin');

        $activeQuery = (clone $statsBase);
        CommunityAdminRecordStatus::applyScope($activeQuery, CommunityAdminRecordStatus::ACTIVE);

        $reassignQuery = (clone $statsBase);
        CommunityAdminRecordStatus::applyScope($reassignQuery, CommunityAdminRecordStatus::REASSIGN);

        $suspendedQuery = (clone $statsBase);
        CommunityAdminRecordStatus::applyScope($suspendedQuery, CommunityAdminRecordStatus::SUSPENDED);

        $active = $activeQuery->count();
        $reassign = $reassignQuery->count();

        return [
            'total'          => (clone $statsBase)->count(),
            'pending'        => (clone $statsBase)->where('community_admin_status', 'pending')->count(),
            'active'         => $active,
            'approved'       => $active,
            'suspended'      => $suspendedQuery->count(),
            'needs_reassign' => $reassign,
            'rejected'       => (clone $statsBase)->where('community_admin_status', 'rejected')->count(),
        ];
    }

    private function findManagedAdmin(int $id): User
    {
        $user = User::query()
            ->with(['profile', 'memberships.community'])
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            abort(404, 'Community admin not found.');
        }

        return $user;
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

        $user->loadMissing('memberships.community');
        CommunityAdminRecordStatus::assertCan($user, CommunityAdminRecordStatus::ACTION_APPROVE);

        return $user;
    }

    private function findRejectableAdmin(int $id): User
    {
        $user = User::query()
            ->with(['profile', 'memberships.community'])
            ->where('id', $id)
            ->where('role', 'community_admin')
            ->first();

        if (! $user) {
            abort(404, 'Community admin applicant not found');
        }

        $lifecycle = CommunityAdminRecordStatus::resolve($user);
        if (in_array($lifecycle, [
            CommunityAdminRecordStatus::PENDING,
            CommunityAdminRecordStatus::ACTIVE,
        ], true)) {
            return $user;
        }

        abort(422, CommunityAdminRecordStatus::deniedMessage($lifecycle, CommunityAdminRecordStatus::ACTION_REJECT));
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
        $user->loadMissing(['profile', 'memberships.community']);
        $membership = $user->memberships
            ->filter(fn ($item) => $item->role === 'admin' && in_array($item->status, ['approved', 'pending'], true))
            ->sortByDesc(fn ($item) => $item->updated_at?->getTimestamp() ?? 0)
            ->first();
        $lifecycleStatus = CommunityAdminRecordStatus::resolve($user);
        if (! $membership && $lifecycleStatus === CommunityAdminRecordStatus::SUSPENDED) {
            $membership = $user->memberships
                ->filter(fn ($item) => $item->role === 'admin')
                ->sortByDesc(fn ($item) => $item->updated_at?->getTimestamp() ?? 0)
                ->first();
        }
        $community  = $membership?->community;
        $needsReassign = $lifecycleStatus === CommunityAdminRecordStatus::REASSIGN;
        $reactivationBlock = app(CommunityLifecycleService::class)->reactivationBlockedReason($user);

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
            'lifecycle_status'       => $lifecycleStatus,
            'allowed_actions'        => CommunityAdminRecordStatus::actionsFor($lifecycleStatus),
            'reactivate_blocked'     => $reactivationBlock !== null,
            'reactivate_blocked_reason' => $reactivationBlock,
            'needs_reassign'         => $needsReassign,
            'reassign_summary'       => $needsReassign
                ? 'This admin is not assigned to a community. Assign a community to restore Active status.'
                : null,
            'created_at'             => $user->created_at?->toIso8601String(),
            'profile'                => $user->profile ? [
                'display_name'     => $user->profile->display_name,
                'office_address'   => $user->profile->office_address,
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
