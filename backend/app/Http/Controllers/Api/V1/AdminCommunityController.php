<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\MembershipService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminCommunityController extends Controller
{
    /** GET /v1/admin/communities — dropdown list or paginated admin index */
    public function listActive(Request $request): JsonResponse
    {
        $scopeId = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);

        if (! $request->has('per_page') && ! $request->has('page') && ! $request->filled('review_status')) {
            $communities = Community::query()
                ->with('regionRecord')
                ->where('status', 'active')
                ->where(function ($w) {
                    $w->whereNull('review_status')
                        ->orWhere('review_status', 'approved');
                })
                ->when($scopeId, fn ($q) => $q->where('id', $scopeId))
                ->orderBy('name')
                ->get();

            return response()->json([
                'data' => $communities->map(fn (Community $c) => $this->transformListItem($c))->values(),
            ]);
        }

        $query = Community::query()
            ->with(['regionRecord', 'requester.profile'])
            ->withCount($this->residentsCountRelation())
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhereIn('review_status', ['approved', 'pending', 'rejected']);
            });

        if ($status = $request->string('status')->trim()->toString()) {
            if (in_array($status, ['active', 'inactive'], true)) {
                $query->where('status', $status);
            }
        }

        if ($reviewStatus = $request->string('review_status')->trim()->toString()) {
            if (in_array($reviewStatus, ['pending', 'approved', 'rejected'], true)) {
                $query->where('review_status', $reviewStatus);
            }
        } else {
            $query->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            });
        }

        if ($regionId = $request->integer('region_id')) {
            $query->where('region_id', $regionId);
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                    ->orWhere('address', 'like', "%{$q}%")
                    ->orWhere('region', 'like', "%{$q}%");
            });
        }

        $items = $query->orderByDesc('created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        return response()->json([
            'data' => collect($items->items())->map(fn ($c) => $this->transformListItem($c))->values(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
                'per_page'     => $items->perPage(),
                'stats'        => [
                    'total'    => Community::query()->where(function ($w) {
                        $w->whereNull('review_status')->orWhere('review_status', 'approved');
                    })->count(),
                    'active'   => Community::query()->where('status', 'active')->where(function ($w) {
                        $w->whereNull('review_status')->orWhere('review_status', 'approved');
                    })->count(),
                    'inactive' => Community::query()->where('status', 'inactive')->where(function ($w) {
                        $w->whereNull('review_status')->orWhere('review_status', 'approved');
                    })->count(),
                    'pending'  => Community::query()->where('review_status', 'pending')->count(),
                    'approved' => Community::query()->where('review_status', 'approved')->count(),
                    'rejected' => Community::query()->where('review_status', 'rejected')->count(),
                ],
            ],
        ]);
    }

    /** POST /v1/admin/communities — admin creates an active community */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'region_id'   => ['required', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
            'address'     => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $region = Region::query()->where('status', 'active')->findOrFail($validated['region_id']);

        $community = Community::query()->create([
            'name'          => $validated['name'],
            'region_id'     => $region->id,
            'region'        => $region->title,
            'address'       => $validated['address'] ?? null,
            'description'   => $validated['description'] ?? null,
            'status'        => 'active',
            'review_status' => 'approved',
            'reviewed_at'   => now(),
        ]);

        ActivityLogService::user(
            'community_created',
            "Created community: {$community->name}",
            'Community',
            $community->id,
        );

        $community->load('regionRecord');

        return response()->json([
            'data'    => $this->transformListItem($community),
            'message' => 'Community created successfully.',
        ], 201);
    }

    /** GET /v1/admin/community-requests */
    public function index(Request $request): JsonResponse
    {
        $query = Community::query()
            ->with(['regionRecord', 'requester.profile'])
            ->where('review_status', 'pending');

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                    ->orWhere('address', 'like', "%{$q}%");
            });
        }

        $items = $query->orderByDesc('created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        return response()->json([
            'data' => collect($items->items())->map(fn ($c) => $this->transform($c))->values(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
                'per_page'     => $items->perPage(),
                'stats'        => [
                    'pending'  => Community::query()->where('review_status', 'pending')->count(),
                    'approved' => Community::query()->where('review_status', 'approved')->count(),
                    'rejected' => Community::query()->where('review_status', 'rejected')->count(),
                ],
            ],
        ]);
    }

    /** GET /v1/admin/community-requests/{id} */
    public function show(int $id): JsonResponse
    {
        $community = Community::query()
            ->with(['regionRecord', 'requester.profile'])
            ->findOrFail($id);

        return response()->json(['data' => $this->transform($community, detailed: true)]);
    }

    /** PATCH /v1/admin/community-requests/{id}/approve */
    public function approve(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
        ]);

        $community = Community::query()->findOrFail($id);

        if ($community->review_status !== 'pending') {
            return response()->json(['message' => 'This community request is not pending review.'], 422);
        }

        $region = Region::query()->where('status', 'active')->findOrFail($request->integer('region_id'));

        DB::transaction(function () use ($community, $region) {
            $community->update([
                'status'         => 'active',
                'review_status'  => 'approved',
                'region_id'      => $region->id,
                'region'         => $region->title,
                'reviewed_at'    => now(),
                'rejection_reason' => null,
            ]);

            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('status', 'pending')
                ->get()
                ->each(function (CommunityMembership $membership) {
                    $user = User::query()->find($membership->user_id);
                    $membership->update([
                        'status' => 'approved',
                        'role'   => MembershipService::membershipRoleFor($user ?? new User(['role' => 'resident'])),
                        'updated_at' => now(),
                    ]);
                });

            if ($community->requested_by_user_id) {
                $requester = User::query()->find($community->requested_by_user_id);

                CommunityMembership::query()->firstOrCreate(
                    [
                        'user_id'      => $community->requested_by_user_id,
                        'community_id' => $community->id,
                    ],
                    [
                        'role'   => MembershipService::membershipRoleFor($requester ?? new User(['role' => 'resident'])),
                        'status' => 'approved',
                    ],
                )->update([
                    'status' => 'approved',
                    'role'   => MembershipService::membershipRoleFor($requester ?? new User(['role' => 'resident'])),
                    'updated_at' => now(),
                ]);

                NotificationService::send(
                    $community->requested_by_user_id,
                    'success',
                    'Community approved',
                    "{$community->name} has been approved. Your community admin application is still under review — you'll get full access once a system administrator approves your account.",
                );
            }
        });

        ActivityLogService::user(
            'community_approved',
            "Approved community request: {$community->name}",
            'Community',
            $community->id,
        );

        $community->refresh()->load(['regionRecord', 'requester.profile']);

        app(\App\Services\CommunityAdminAccessService::class)->activateTrialIfApproved($community);

        return response()->json([
            'data'    => $this->transform($community, detailed: true),
            'message' => 'Community approved and activated.',
        ]);
    }

    /** PATCH /v1/admin/community-requests/{id}/reject */
    public function reject(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $community = Community::query()->findOrFail($id);

        if ($community->review_status !== 'pending') {
            return response()->json(['message' => 'This community request is not pending review.'], 422);
        }

        DB::transaction(function () use ($community, $request) {
            $community->update([
                'status'           => 'inactive',
                'review_status'    => 'rejected',
                'reviewed_at'      => now(),
                'rejection_reason' => $request->input('reason'),
            ]);

            CommunityMembership::query()
                ->where('community_id', $community->id)
                ->where('status', 'pending')
                ->update(['status' => 'rejected', 'updated_at' => now()]);

            app(\App\Services\CommunityAdminAccessService::class)
                ->cancelBillingOnRejection((int) $community->id, 'community_rejected');

            if ($community->requested_by_user_id) {
                NotificationService::send(
                    $community->requested_by_user_id,
                    'warning',
                    'Community request declined',
                    $request->filled('reason')
                        ? $request->input('reason')
                        : 'Your community request could not be approved. Please contact support or submit a new request.',
                );
            }
        });

        ActivityLogService::user(
            'community_rejected',
            "Rejected community request: {$community->name}",
            'Community',
            $community->id,
            'warning',
        );

        $community->refresh()->load(['regionRecord', 'requester.profile']);

        return response()->json([
            'data'    => $this->transform($community, detailed: true),
            'message' => 'Community request rejected.',
        ]);
    }

    /** PUT /v1/admin/communities/{id} */
    public function update(int $id, Request $request): JsonResponse
    {
        $community = Community::query()->findOrFail($id);

        if (! in_array($community->review_status, [null, 'approved'], true)) {
            return response()->json([
                'message' => 'Only approved communities can be edited. Use the requests tab to review pending communities.',
            ], 422);
        }

        $validated = $request->validate([
            'name'        => ['sometimes', 'string', 'max:255'],
            'region_id'   => ['sometimes', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
            'address'     => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        if (array_key_exists('region_id', $validated)) {
            $region = Region::query()->where('status', 'active')->findOrFail($validated['region_id']);
            $validated['region'] = $region->title;
        }

        $community->update($validated);

        ActivityLogService::user(
            'community_updated',
            "Updated community: {$community->name}",
            'Community',
            $community->id,
        );

        $community->refresh()->load(['regionRecord', 'requester.profile']);

        return response()->json([
            'data'    => $this->transformListItem($community),
            'message' => 'Community updated successfully.',
        ]);
    }

    /** DELETE /v1/admin/communities/{id} */
    public function destroy(int $id): JsonResponse
    {
        $community = Community::query()->findOrFail($id);

        if ($community->review_status === 'pending') {
            return response()->json([
                'message' => 'Pending community requests cannot be deleted here. Reject the request instead.',
            ], 422);
        }

        $name = $community->name;
        $communityId = $community->id;

        DB::transaction(fn () => $community->delete());

        ActivityLogService::user(
            'community_deleted',
            "Deleted community: {$name}",
            'Community',
            $communityId,
            'warning',
        );

        return response()->json(['message' => 'Community deleted.']);
    }

    /** PATCH /v1/admin/communities/{id}/status */
    public function updateStatus(int $id, Request $request, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['active', 'inactive'])],
        ]);

        $community = Community::query()->findOrFail($id);

        if (! in_array($community->review_status, [null, 'approved'], true)) {
            return response()->json([
                'message' => 'Only approved communities can be activated or deactivated.',
            ], 422);
        }

        if ($validated['status'] === 'inactive') {
            $lifecycle->deactivateCommunity($community);
            $message = 'Community deactivated. All admins and residents in this community can no longer sign in.';
        } else {
            $lifecycle->activateCommunity($community);
            $message = 'Community reactivated. Admins and residents restored.';
        }

        ActivityLogService::user(
            $validated['status'] === 'inactive' ? 'community_deactivated' : 'community_reactivated',
            ucfirst($validated['status'])." community: {$community->name}",
            'Community',
            $community->id,
            $validated['status'] === 'inactive' ? 'warning' : 'info',
        );

        $community->refresh()->load(['regionRecord', 'requester.profile']);

        return response()->json([
            'data'    => $this->transformListItem($community),
            'message' => $message,
        ]);
    }

    /** GET /v1/admin/communities/{id}/admin */
    public function showAdmin(int $id, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $community = Community::query()->with('regionRecord')->findOrFail($id);
        $admin = $lifecycle->getCommunityAdmin($community);

        return response()->json([
            'data' => [
                'community' => $this->transformListItem($community),
                'admin'     => $admin ? [
                    'id'                => $admin->id,
                    'name'              => $admin->name,
                    'email'             => $admin->email,
                    'phone'             => $admin->phone,
                    'status'            => $admin->status,
                    'suspension_reason' => $admin->suspension_reason,
                ] : null,
            ],
        ]);
    }

    /** POST /v1/admin/communities/{id}/assign-admin */
    public function assignAdmin(int $id, Request $request, CommunityLifecycleService $lifecycle): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'name'    => ['nullable', 'string', 'max:100'],
            'email'   => ['nullable', 'email', 'max:255'],
            'phone'   => ['nullable', 'string', 'max:30'],
        ]);

        $hasNewUser = $request->filled('email') && $request->filled('phone');
        if (empty($validated['user_id']) && ! $hasNewUser) {
            return response()->json([
                'message' => 'Provide user_id or new admin contact details.',
                'errors'  => ['user_id' => ['A community admin must be selected or created.']],
            ], 422);
        }

        $community = Community::query()->findOrFail($id);

        if ($hasNewUser) {
            $phone = \App\Support\PhoneNormalizer::normalize($validated['phone']);
            if (! $phone) {
                return response()->json(['message' => 'Invalid phone number.', 'errors' => ['phone' => ['Invalid phone format.']]], 422);
            }

            $existingUser = User::query()->where('phone', $phone)->first();
            if ($existingUser) {
                if (($existingUser->role ?? '') === 'resident') {
                    ContactIdentityService::failDuplicate('phone', ContactIdentityService::DUPLICATE_PHONE_MESSAGE);
                }

                try {
                    $lifecycle->assertCanAdminCommunity($existingUser, $community);
                } catch (ValidationException $e) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'errors'  => $e->errors(),
                    ], 422);
                }

                $newAdmin = $existingUser;
                $keepSystemRole = AdminRoleService::isSystemAdmin($existingUser);
            } else {
                ContactIdentityService::assertAvailableForRegistration($validated['email'], $phone);
                $displayName = trim($validated['name'] ?? '') ?: 'Neighbor';
                $newAdmin = User::query()->create([
                    'name'                   => $displayName,
                    'email'                  => $validated['email'],
                    'phone'                  => $phone,
                    'password'               => Str::random(32),
                    'status'                 => 'active',
                    'role'                   => 'community_admin',
                    'community_admin_status' => 'approved',
                ]);
                Profile::query()->create([
                    'user_id'      => $newAdmin->id,
                    'display_name' => $displayName,
                ]);
                $keepSystemRole = false;
            }
        } else {
            $newAdmin = User::query()->findOrFail((int) $validated['user_id']);
            $keepSystemRole = AdminRoleService::isSystemAdmin($newAdmin);
            try {
                $lifecycle->assertCanAdminCommunity($newAdmin, $community);
            } catch (ValidationException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors'  => $e->errors(),
                ], 422);
            }
        }

        if (AdminRoleService::isSystemAdmin($newAdmin)) {
            return response()->json([
                'message' => 'A system administrator cannot be assigned as a community admin. Invite a community admin instead.',
            ], 422);
        }

        try {
            $assigned = $lifecycle->assignCommunityAdmin($community, $newAdmin, $keepSystemRole);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'errors'  => $e->errors(),
            ], 422);
        }

        ActivityLogService::user(
            'community_admin_assigned',
            "Assigned {$assigned->name} as admin for {$community->name}",
            'Community',
            $community->id,
        );

        NotificationService::send(
            $assigned->id,
            'success',
            'Community admin access granted',
            "You have been assigned to manage {$community->name} in Havena.",
        );

        return response()->json([
            'data'    => [
                'community' => $this->transformListItem($community->fresh(['regionRecord'])),
                'admin'     => [
                    'id'    => $assigned->id,
                    'name'  => $assigned->name,
                    'email' => $assigned->email,
                    'phone' => $assigned->phone,
                    'role'  => $assigned->role,
                ],
            ],
            'message' => 'Community admin assigned successfully.',
        ]);
    }

    private function transform(Community $community, bool $detailed = false): array
    {
        $requester = $community->requester;
        $profile = $requester?->profile;

        $payload = [
            'id'             => $community->id,
            'name'           => $community->name,
            'address'        => $community->address,
            'description'    => $community->description,
            'region'         => $community->region,
            'region_id'      => $community->region_id,
            'status'         => $community->status,
            'review_status'  => $community->review_status,
            'rejection_reason' => $community->rejection_reason,
            'requested_by'   => $requester ? [
                'id'    => $requester->id,
                'name'  => $profile?->display_name ?: $requester->name,
                'email' => $requester->email,
                'phone' => $requester->phone,
            ] : null,
            'region_detail'  => $community->regionRecord ? [
                'id'    => $community->regionRecord->id,
                'title' => $community->regionRecord->title,
                'area'  => $community->regionRecord->area,
                'state' => $community->regionRecord->state,
            ] : null,
            'created_at'     => $community->created_at?->toIso8601String(),
            'reviewed_at'    => $community->reviewed_at?->toIso8601String(),
        ];

        if ($profile && ($detailed || $community->review_status === 'pending')) {
            $payload['requester_profile'] = [
                'unit_number'      => $profile->unit_number,
                'residence_type'   => $profile->residence_type,
                'utility_bill_url' => $this->resolveMediaUrl($profile->utility_bill_url),
            ];
        }

        return $payload;
    }

    /** Approved resident memberships scoped to this community. */
    private function residentsCountRelation(): array
    {
        return [
            'memberships as residents_count' => function ($q) {
                $q->where('role', 'member')
                    ->where('status', 'approved')
                    ->whereHas('user', function ($user) {
                        $user->where('role', 'resident')
                            ->where('status', '!=', 'deleted');
                    });
            },
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

    private function transformListItem(Community $community): array
    {
        $requester = $community->relationLoaded('requester') ? $community->requester : null;
        $profile = $requester?->profile;
        $lifecycle = app(CommunityLifecycleService::class);
        $admin = $lifecycle->getCommunityAdmin($community);

        return [
            'id'             => $community->id,
            'name'           => $community->name,
            'address'        => $community->address,
            'description'    => $community->description,
            'region'         => $community->region,
            'region_id'      => $community->region_id,
            'region_title'   => $community->regionRecord?->title ?? $community->region,
            'status'         => $community->status,
            'review_status'  => $community->review_status,
            'rejection_reason' => $community->rejection_reason,
            'requested_by'   => $requester ? [
                'id'    => $requester->id,
                'name'  => $profile?->display_name ?: $requester->name,
                'email' => $requester->email,
                'phone' => $requester->phone,
            ] : null,
            'admin_user'     => $admin ? [
                'id'                => $admin->id,
                'name'              => $admin->name,
                'email'             => $admin->email,
                'phone'             => $admin->phone,
                'status'            => $admin->status,
                'suspension_reason' => $admin->suspension_reason,
            ] : null,
            'residents_count' => (int) ($community->residents_count ?? 0),
            'created_at'     => $community->created_at?->toIso8601String(),
            'reviewed_at'    => $community->reviewed_at?->toIso8601String(),
        ];
    }
}
