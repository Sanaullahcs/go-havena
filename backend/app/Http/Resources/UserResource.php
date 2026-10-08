<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Services\UnitAssignmentService;
use App\Support\MediaUrl;
use App\Support\OnboardingContext;

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

    /** @return array<string, mixed> */
    private function residentFeaturesPayload(): array
    {
        $features = app(\App\Services\CommunityFeatureService::class);

        return $features->payloadForCommunity(
            $features->communityIdForUser($this->resource),
            $this->resource,
        );
    }
}
