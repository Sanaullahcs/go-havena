<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Services\UnitAssignmentService;
use App\Services\UnitRegistrationPackageService;
use App\Support\MediaUrl;
use App\Support\OnboardingContext;
use Illuminate\Support\Facades\DB;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $profile = $this->profile;
        $units = app(UnitAssignmentService::class)->userUnitsBrief(
            $this->resource,
            \App\Services\UserActingContextService::currentCommunityId($this->resource),
        );
        $activeUnits = array_values(array_filter(
            $units,
            fn (array $row) => ($row['association_status'] ?? 'active') === 'active',
        ));
        $billingContactUnitCount = count(array_values(array_filter(
            $activeUnits,
            fn (array $row) => ! empty($row['is_billing_contact']),
        )));
        $isBillingContact = $billingContactUnitCount > 0;

        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'role' => $this->role ?? 'resident',
            'community_admin_status' => $this->community_admin_status,
            'status' => $this->status ?? 'active',
            'profile' => [
                'display_name' => $profile?->display_name ?? $this->name ?? '',
                'avatar_url' => MediaUrl::toPublic($profile?->avatar_url, $request),
                'utility_bill_url' => MediaUrl::toPublic($profile?->utility_bill_url, $request),
                'bio' => $profile?->bio,
                'unit_number' => $profile?->unit_number,
                'residence_type' => $profile?->residence_type,
                'office_address' => $profile?->office_address,
                'region_id' => $profile?->region_id,
                'region' => $profile?->relationLoaded('region') && $profile->region ? [
                    'id' => $profile->region->id,
                    'title' => $profile->region->title,
                    'area' => $profile->region->area,
                    'state' => $profile->region->state,
                ] : null,
            ],
            'memberships' => $this->whenLoaded('memberships', function () {
                return $this->memberships->map(fn ($m) => [
                    'id' => $m->id,
                    'community_id' => $m->community_id,
                    'role' => $m->role,
                    'status' => $m->status,
                    'invite_code_used' => $m->invite_code_used,
                    'rejection_reason' => $m->rejection_reason,
                    'rejected_by' => $m->rejected_by,
                    'created_at' => $m->created_at,
                    'updated_at' => $m->updated_at,
                    'community' => $m->relationLoaded('community') ? [
                        'id' => $m->community->id,
                        'name' => $m->community->name,
                        'region' => $m->community->region,
                        'region_id' => $m->community->region_id,
                        'address' => $m->community->address,
                        'status' => $m->community->status,
                        'review_status' => $m->community->review_status,
                        'rejection_reason' => $m->community->rejection_reason,
                        'currency' => app(\App\Services\CommunityCurrencyService::class)
                            ->forCommunity($m->community),
                        'payment_provider' => app(\App\Services\Payments\PaymentRouting::class)
                            ->provider((int) $m->community->id),
                    ] : null,
                ]);
            }),
            'unit' => $activeUnits[0] ?? $units[0] ?? null,
            'units' => $units,
            'units_meta' => [
                'unit_count' => count($activeUnits),
                'association_count' => count($units),
                'billing_contact_unit_count' => $billingContactUnitCount,
            ],
            'is_billing_contact' => $isBillingContact,
            'invite_units' => $this->inviteUnitsPayload(),
            ...$this->unitAccessPayload(),
            'guest_access' => \App\Services\GuestAccessService::guestAccessSummary($this->resource),
            'family' => \App\Services\FamilyService::onboardingBrief($this->resource),
            // Money display for the community the user is currently acting in.
            // Clients read this once per session instead of threading a
            // currency through every amenity, bill, and listing payload.
            'currency' => app(\App\Services\CommunityCurrencyService::class)->forUser($this->resource),
            'staff_access' => app(\App\Services\CommunityStaffService::class)->access($this->resource),
            'needs_invite_code' => \App\Services\InviteCodeService::userNeedsInviteCode($this->resource),
            'pending_invitation_count' => \App\Models\InviteCode::query()->pendingForUser((int) $this->id)->count(),
            'invited_by_admin' => OnboardingContext::invitedByAdmin($this->resource),
            'resident_features' => $this->residentFeaturesPayload(),
            ...\App\Services\UserActingContextService::payload($this->resource),
        ];
    }

    /** @return list<array{unit_number: string, locked: bool}> */
    private function inviteUnitsPayload(): array
    {
        $unitsService = app(UnitAssignmentService::class);
        $communityId = $this->inviteUnitsCommunityId();

        if (! $communityId) {
            // Invite may exist before membership row in some flows — scan all invite rows.
            if (! \Illuminate\Support\Facades\Schema::hasTable('invite_unit_assignments')) {
                return [];
            }
            $numbers = DB::table('invite_unit_assignments')
                ->where('user_id', $this->id)
                ->orderBy('sort_order')
                ->pluck('unit_number')
                ->map(fn ($n) => trim((string) $n))
                ->filter()
                ->values()
                ->all();

            return array_map(
                fn (string $number) => ['unit_number' => $number, 'locked' => true],
                $numbers,
            );
        }

        $numbers = $communityId
            ? $unitsService->listInviteUnitNumbers($communityId, (int) $this->id)
            : [];
        if ($numbers === []) {
            $pendingCommunityId = $this->pendingInvitedCommunityId();
            if ($pendingCommunityId && $pendingCommunityId !== $communityId) {
                $numbers = $unitsService->listInviteUnitNumbers($pendingCommunityId, (int) $this->id);
            }
        }
        if ($numbers === []) {
            $outstandingCommunityId = $this->outstandingInviteCommunityId();
            if ($outstandingCommunityId && $outstandingCommunityId !== $communityId) {
                $numbers = $unitsService->listInviteUnitNumbers($outstandingCommunityId, (int) $this->id);
            }
        }

        return array_map(
            fn (string $number) => ['unit_number' => $number, 'locked' => true],
            $numbers,
        );
    }

    private function inviteUnitsCommunityId(): ?int
    {
        $requestedCommunityId = (int) request()->input('invite_community_id', 0);
        if ($requestedCommunityId > 0) {
            return $requestedCommunityId;
        }

        $pendingCommunityId = $this->pendingInvitedCommunityId();
        if ($pendingCommunityId) {
            return $pendingCommunityId;
        }

        return $this->outstandingInviteCommunityId();
    }

    private function outstandingInviteCommunityId(): ?int
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('invite_unit_assignments')) {
            return null;
        }

        $activeId = \App\Services\UserActingContextService::currentCommunityId($this->resource);
        $query = DB::table('invite_unit_assignments')
            ->where('user_id', $this->id)
            ->orderByDesc('id');
        if ($activeId) {
            $query->where('community_id', '!=', $activeId);
        }

        $communityId = $query->value('community_id');

        return $communityId ? (int) $communityId : null;
    }

    private function pendingInvitedCommunityId(): ?int
    {
        if ($this->resource->relationLoaded('memberships')) {
            $pending = $this->resource->memberships->first(
                fn ($membership) => ($membership->status ?? '') === 'pending'
                    && filled($membership->invite_code_used),
            );

            return $pending ? (int) $pending->community_id : null;
        }

        $pending = DB::table('community_memberships')
            ->where('user_id', $this->id)
            ->where('status', 'pending')
            ->whereNotNull('invite_code_used')
            ->where('invite_code_used', '!=', '')
            ->orderByDesc('id')
            ->value('community_id');

        return $pending ? (int) $pending : null;
    }

    /** @return array<string, mixed> */
    private function residentFeaturesPayload(): array
    {
        $features = app(\App\Services\CommunityFeatureService::class);

        return $features->payloadForCommunity(
            $features->communityIdForUser($this->resource),
            $this->resource,
        );
    }

    /** @return array{pending_unit_package: bool, has_full_unit_access: bool} */
    private function unitAccessPayload(): array
    {
        $communityId = \App\Services\UserActingContextService::currentCommunityId($this->resource);

        if (! $communityId) {
            return [
                'pending_unit_package' => false,
                'has_full_unit_access' => false,
            ];
        }

        $packages = app(UnitRegistrationPackageService::class);

        return [
            'pending_unit_package' => $packages->hasPendingInitialPackage((int) $this->id, (int) $communityId),
            'has_full_unit_access' => $packages->residentHasFullUnitAccess((int) $this->id, (int) $communityId),
        ];
    }
}
