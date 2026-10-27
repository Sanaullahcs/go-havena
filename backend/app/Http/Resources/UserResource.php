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
            'unit' => app(UnitAssignmentService::class)->userUnitBrief($this->resource),
            'units' => app(UnitAssignmentService::class)->userUnitsBrief($this->resource),
            'invite_units' => $this->inviteUnitsPayload(),
            ...$this->unitAccessPayload(),
            'guest_access' => \App\Services\GuestAccessService::guestAccessSummary($this->resource),
            'family' => \App\Services\FamilyService::onboardingBrief($this->resource),
            // Money display for the community the user is currently acting in.
            // Clients read this once per session instead of threading a
            // currency through every amenity, bill, and listing payload.
            'currency' => app(\App\Services\CommunityCurrencyService::class)->forUser($this->resource),
            'needs_invite_code' => \App\Services\InviteCodeService::userNeedsInviteCode($this->resource),
            'invited_by_admin' => OnboardingContext::invitedByAdmin($this->resource),
            'resident_features' => $this->residentFeaturesPayload(),
            ...\App\Services\UserActingContextService::payload($this->resource),
        ];
    }

    /** @return list<array{unit_number: string, locked: bool}> */
    private function inviteUnitsPayload(): array
    {
        $unitsService = app(UnitAssignmentService::class);
        $membership = DB::table('community_memberships')
            ->where('user_id', $this->id)
            ->whereIn('status', ['approved', 'pending'])
            ->orderByDesc('created_at')
            ->first();

        $communityId = $membership?->community_id
            ? (int) $membership->community_id
            : null;

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

        $numbers = $unitsService->listInviteUnitNumbers($communityId, (int) $this->id);

        return array_map(
            fn (string $number) => ['unit_number' => $number, 'locked' => true],
            $numbers,
        );
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
        $communityId = DB::table('community_memberships')
            ->where('user_id', $this->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->value('community_id');

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
