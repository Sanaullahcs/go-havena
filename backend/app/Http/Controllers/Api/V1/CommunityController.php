<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\InviteCode;
use App\Models\Region;
use App\Services\AdminRoleService;
use App\Services\CommunityBillingService;
use App\Services\CommunityLifecycleService;
use App\Services\InviteCodeService;
use App\Services\MembershipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CommunityController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $query = Community::query()
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            });

        if ($regionId = $request->integer('region_id')) {
            $region = Region::query()->where('status', 'active')->find($regionId);
            if ($region) {
                $query->where(function ($w) use ($region) {
                    $w->where('region_id', $region->id)
                        ->orWhere('region', 'like', '%'.$region->title.'%');
                });
            }
        } elseif ($region = $request->string('region')->trim()->toString()) {
            $query->where('region', 'like', '%'.$region.'%');
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('name', 'like', '%'.$q.'%')
                    ->orWhere('region', 'like', '%'.$q.'%')
                    ->orWhere('address', 'like', '%'.$q.'%');
            });
        }

        if ($request->boolean('unassigned_only')) {
            $query->withoutAssignedAdmin();
        }

        $lifecycle = app(CommunityLifecycleService::class);
        $communities = $query->orderBy('name')->limit(50)->get();

        return response()->json([
            'data' => $communities->map(fn (Community $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'region' => $c->region,
                'region_id' => $c->region_id,
                'description' => $c->description,
                'address' => $c->address,
                'has_admin' => $lifecycle->hasCommunityAdminAssigned($c),
            ]),
        ]);
    }

    public function join(Request $request, int $id): JsonResponse
    {
        $lifecycle = app(CommunityLifecycleService::class);

        $community = Community::query()
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->findOrFail($id);
        $user = $request->user()->load('profile');
        $isCommunityAdmin = AdminRoleService::isCommunityAdminRole($user);

        $validated = $request->validate([
            'invite_code' => ['nullable', 'string', 'max:64'],
        ]);

        if ($isCommunityAdmin) {
            if (! empty($validated['invite_code'])) {
                throw ValidationException::withMessages([
                    'invite_code' => ['Community admins cannot join using an invite code.'],
                ]);
            }

            if ($lifecycle->hasCommunityAdminAssigned($community)) {
                throw ValidationException::withMessages([
                    'community_id' => ['This community already has a community admin assigned.'],
                ]);
            }

            $lifecycle->assertCanAdminCommunity($user, $community);
        }

        $existing = CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('community_id', $community->id)
            ->first();

        if ($existing) {
            $inviteModel = null;
            if (! empty($validated['invite_code'])) {
                $inviteModel = InviteCode::query()
                    ->where('community_id', $community->id)
                    ->whereRaw('UPPER(code) = ?', [strtoupper(trim($validated['invite_code']))])
                    ->first();

                if (! $inviteModel || ! $inviteModel->isValid()) {
                    throw ValidationException::withMessages([
                        'invite_code' => ['Invalid or expired invite code.'],
                    ]);
                }

                // Invited placeholder redeeming their own code (or legacy approved invite rows).
                $inviteModel->increment('used_count');
                $existing->update([
                    'status' => 'approved',
                    'invite_code_used' => $inviteModel->code,
                ]);
                $existing->refresh();

                $billing = app(CommunityBillingService::class);
                if (filled($inviteModel->invited_user_id)) {
                    $billing->consumeReservationsForUser($community->id, (int) $inviteModel->invited_user_id);
                }

                return response()->json([
                    'data' => [
                        'membership' => [
                            'id' => $existing->id,
                            'community_id' => $existing->community_id,
                            'role' => $existing->role,
                            'status' => $existing->status,
                            'invite_code_used' => $existing->invite_code_used,
                        ],
                        'community' => $this->communityPayload($community),
                        'invited_profile' => null,
                        'user' => new UserResource($user->fresh(['profile', 'memberships.community'])),
                    ],
                ]);
            }

            if ($existing->status === 'pending') {
                $existing->update([
                    'status' => MembershipService::joinStatusFor($community, $user, false),
                ]);
                $existing->refresh();
            }

            return response()->json([
                'data' => [
                    'membership' => [
                        'id' => $existing->id,
                        'community_id' => $existing->community_id,
                        'role' => $existing->role,
                        'status' => $existing->status,
                        'invite_code_used' => $existing->invite_code_used,
                    ],
                    'community' => $this->communityPayload($community),
                ],
            ]);
        }

        $status = 'pending';
        $inviteUsed = null;
        $inviteModel = null;
        $seatAlreadyHeldByInvite = false;

        if ($isCommunityAdmin) {
            $status = 'pending';
        } elseif (! empty($validated['invite_code'])) {
            $inviteModel = InviteCode::query()
                ->where('community_id', $community->id)
                ->whereRaw('UPPER(code) = ?', [strtoupper(trim($validated['invite_code']))])
                ->first();

            if (! $inviteModel || ! $inviteModel->isValid()) {
                throw ValidationException::withMessages([
                    'invite_code' => ['Invalid or expired invite code.'],
                ]);
            }

            $status = 'approved';
            $inviteUsed = $inviteModel->code;
            // Admin member invites already allocated a seat to the placeholder user.
            $seatAlreadyHeldByInvite = filled($inviteModel->invited_user_id);
            $inviteModel->increment('used_count');
        } else {
            $status = MembershipService::joinStatusFor($community, $user, false);
        }

        $billing = app(CommunityBillingService::class);
        if ($status === 'approved' && ! $isCommunityAdmin && ! $seatAlreadyHeldByInvite) {
            $billing->releaseExpiredReservations($community->id);
            $billing->assertCanAllocateSeat($community->id);
        }

        $membership = CommunityMembership::query()->create([
            'user_id' => $user->id,
            'community_id' => $community->id,
            'role' => MembershipService::membershipRoleFor($user),
            'status' => $status,
            'invite_code_used' => $inviteUsed,
        ]);

        $invitedProfile = null;
        if ($inviteModel) {
            $invitedProfile = InviteCodeService::claimInvitedMember($user, $inviteModel);
            $user->refresh()->load(['profile', 'memberships.community']);
            if ($seatAlreadyHeldByInvite) {
                $billing->consumeReservationsForUser($community->id, (int) $inviteModel->invited_user_id);
            }
        }

        // Family create/join is handled by Complete Profile (ensure / join-request),
        // or by MemberController when community membership is approved.

        return response()->json([
            'data' => [
                'membership' => [
                    'id' => $membership->id,
                    'community_id' => $membership->community_id,
                    'role' => $membership->role,
                    'status' => $membership->status,
                    'invite_code_used' => $membership->invite_code_used,
                ],
                'community' => $this->communityPayload($community),
                'invited_profile' => $invitedProfile,
                'user' => new UserResource($user->fresh(['profile.region', 'memberships.community'])),
            ],
        ], 201);
    }

    /** Join by invite code without knowing community id upfront. */
    public function joinByInvite(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'invite_code' => ['required', 'string', 'min:6', 'max:64'],
        ]);

        $invite = InviteCode::query()
            ->whereRaw('UPPER(code) = ?', [strtoupper(trim($validated['invite_code']))])
            ->with('community')
            ->first();

        if (! $invite || ! $invite->isValid()) {
            throw ValidationException::withMessages([
                'invite_code' => ['Invalid or expired invite code.'],
            ]);
        }

        $request->merge(['invite_code' => $invite->code]);

        return $this->join($request, $invite->community_id);
    }

    /**
     * Web onboarding: create a community request (pending system review) and admin membership.
     * Admin stays pending until System Admin approval. Billing can still proceed next.
     */
    public function selfServeCreate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'community_name' => ['required', 'string', 'min:2', 'max:150'],
            'address' => ['required', 'string', 'min:5', 'max:255'],
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
            'estimated_residents' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        $user = $request->user();

        if (AdminRoleService::isCommunityAdminRejected($user)) {
            throw ValidationException::withMessages([
                'community_name' => ['Your community admin application was not approved. Please contact support.'],
            ]);
        }

        if (($user->role ?? '') === 'resident') {
            throw ValidationException::withMessages([
                'community_name' => ['Resident accounts cannot create communities. Use community admin signup.'],
            ]);
        }

        if (! AdminRoleService::isCommunityAdminRole($user)) {
            $user->update([
                'role' => 'community_admin',
                'community_admin_status' => 'pending',
            ]);
            $user->refresh();
        } elseif (AdminRoleService::isCommunityAdminRejected($user)) {
            throw ValidationException::withMessages([
                'community_name' => ['Your community admin application was not approved. Please contact support.'],
            ]);
        }

        $lifecycle = app(CommunityLifecycleService::class);
        $lifecycle->assertCanRequestCommunityAdmin($user);

        $region = Region::query()->where('status', 'active')->findOrFail($validated['region_id']);

        $existingActive = Community::query()
            ->where('name', $validated['community_name'])
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->exists();

        if ($existingActive) {
            throw ValidationException::withMessages([
                'community_name' => ['This community already exists. Choose a different name.'],
            ]);
        }

        $community = Community::query()->create([
            'name' => $validated['community_name'],
            'address' => $validated['address'],
            'description' => $validated['address'],
            'region_id' => $region->id,
            'region' => $region->title,
            'timezone' => 'America/New_York',
            'status' => 'inactive',
            'review_status' => 'pending',
            'requested_by_user_id' => $user->id,
            'estimated_residents' => $validated['estimated_residents'] ?? null,
        ]);

        $membership = CommunityMembership::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role' => 'admin',
                'status' => 'pending',
            ],
        );

        $user->load(['profile.region', 'memberships.community']);

        app(\App\Services\ReferralService::class)->linkCommunity($user, $community);

        return response()->json([
            'data' => [
                'membership' => [
                    'id' => $membership->id,
                    'community_id' => $membership->community_id,
                    'role' => $membership->role,
                    'status' => $membership->status,
                ],
                'community' => $this->communityPayload($community),
                'user' => new UserResource($user),
                'access' => app(\App\Services\CommunityAdminAccessService::class)->accessPayload($user),
            ],
            'message' => 'Community submitted for review. Complete billing next — access unlocks after system approval.',
        ], 201);
    }

    public function requestCommunity(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'community_name' => ['required', 'string', 'min:2', 'max:150'],
            'address' => ['required', 'string', 'min:5', 'max:255'],
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
            'estimated_residents' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        $user = $request->user();

        if (AdminRoleService::isCommunityAdminRejected($user)) {
            throw ValidationException::withMessages([
                'community_name' => ['Your community admin application was not approved. Please contact support.'],
            ]);
        }

        app(CommunityLifecycleService::class)->assertCanRequestCommunityAdmin($user);

        $region = Region::query()->where('status', 'active')->findOrFail($validated['region_id']);

        $existingActive = Community::query()
            ->where('name', $validated['community_name'])
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->exists();

        if ($existingActive) {
            $message = AdminRoleService::isCommunityAdminRole($user)
                ? 'This community already exists. Select it from your region list to apply as community admin, or choose a different name.'
                : 'This community already exists. Please search and join it from your region list.';

            throw ValidationException::withMessages([
                'community_name' => [$message],
            ]);
        }

        $community = Community::query()->create([
            'name' => $validated['community_name'],
            'address' => $validated['address'],
            'description' => $validated['address'],
            'region_id' => $region->id,
            'region' => $region->title,
            'timezone' => 'America/New_York',
            'status' => 'inactive',
            'review_status' => 'pending',
            'requested_by_user_id' => $user->id,
            'estimated_residents' => $validated['estimated_residents'] ?? null,
        ]);

        $membership = CommunityMembership::query()->firstOrCreate(
            [
                'user_id' => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role' => MembershipService::membershipRoleFor($user),
                'status' => 'pending',
            ],
        );

        $user->load(['profile.region', 'memberships.community']);

        app(\App\Services\ReferralService::class)->linkCommunity($user, $community);

        return response()->json([
            'data' => [
                'membership' => [
                    'id' => $membership->id,
                    'community_id' => $membership->community_id,
                    'role' => $membership->role,
                    'status' => $membership->status,
                ],
                'community' => $this->communityPayload($community),
                'user' => new UserResource($user),
            ],
            'message' => 'Community request submitted for admin review.',
        ], 201);
    }

    private function communityPayload(Community $community): array
    {
        return [
            'id' => $community->id,
            'name' => $community->name,
            'region' => $community->region,
            'region_id' => $community->region_id,
            'address' => $community->address,
            'status' => $community->status,
            'review_status' => $community->review_status,
        ];
    }
}
