<?php

namespace App\Services\Landlord;

use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use App\Support\Landlord\UnitOwnershipStatus;
use Illuminate\Support\Facades\DB;

class LandlordAccessService
{
    public function __construct(
        private readonly UnitAssignmentService $units,
    ) {}

    /**
     * Resolve resident vs landlord capabilities for one user in one community.
     *
     * @return array{
     *   community_id: int,
     *   membership_approved: bool,
     *   resident: bool,
     *   landlord_dashboard: bool,
     *   owner_only: bool,
     *   landlord_enabled: bool,
     *   primary_residence_unit_id: int|null,
     *   active_resident_unit_count: int,
     *   approved_ownership_count: int,
     *   landlord_unit_count: int,
     *   owned_units: list<array<string, mixed>>,
     *   landlord_units: list<array<string, mixed>>
     * }
     */
    public function resolve(int $userId, int $communityId): array
    {
        $membershipApproved = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();

        $activeResidents = $this->units->findActiveUnitsForUser($userId, $communityId);
        $resident = $membershipApproved && count($activeResidents) > 0;

        $profile = DB::table('user_community_landlord_profiles')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->first();

        $landlordEnabled = (bool) ($profile->landlord_enabled ?? false);
        $primaryResidenceUnitId = isset($profile->primary_residence_unit_id)
            ? (int) $profile->primary_residence_unit_id
            : null;

        $ownershipRows = DB::table('unit_ownerships as o')
            ->join('units', 'units.id', '=', 'o.unit_id')
            ->where('o.user_id', $userId)
            ->where('o.community_id', $communityId)
            ->where('o.status', UnitOwnershipStatus::APPROVED)
            ->orderBy('units.unit_number')
            ->select(
                'o.id as ownership_id',
                'o.unit_id',
                'o.occupancy',
                'o.status',
                'o.created_at as claimed_at',
                'units.unit_number',
                'units.billing_contact_user_id',
            )
            ->get();

        $ownedUnits = [];
        $landlordUnits = [];

        foreach ($ownershipRows as $row) {
            $residentCount = (int) DB::table('unit_residents')
                ->where('unit_id', $row->unit_id)
                ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
                ->count();

            $isBillingContact = (int) ($row->billing_contact_user_id ?? 0) === $userId;
            $occupancy = (string) $row->occupancy;

            $payload = [
                'ownership_id' => (int) $row->ownership_id,
                'unit_id' => (int) $row->unit_id,
                'unit_number' => (string) $row->unit_number,
                'occupancy' => $occupancy,
                'claimed_at' => $row->claimed_at,
                'resident_count' => $residentCount,
                'is_billing_contact' => $isBillingContact,
                'landlord_can_pay_bills' => UnitOwnershipOccupancy::qualifiesForLandlordDashboard($occupancy)
                    && $isBillingContact,
                'landlord_bill_status_only' => $occupancy === UnitOwnershipOccupancy::RENTED && ! $isBillingContact,
            ];

            $ownedUnits[] = $payload;

            if (UnitOwnershipOccupancy::qualifiesForLandlordDashboard($occupancy)) {
                $landlordUnits[] = $payload;
            }
        }

        $hasApprovedOwnership = count($ownedUnits) > 0;
        $landlordDashboard = $hasApprovedOwnership && count($landlordUnits) > 0;
        // Resident app: live in a unit, or own a rented/vacant unit without living there.
        $resident = $membershipApproved && (count($activeResidents) > 0 || $landlordDashboard);
        // Owner-only lockout is retired for non-resident owners. Keep the flag only for
        // approved live-here ownership that still has no residency (not a resident app yet).
        $ownerOnly = $hasApprovedOwnership && ! $resident;

        if ($primaryResidenceUnitId === null && $resident && count($activeResidents) === 1) {
            $primaryResidenceUnitId = (int) $activeResidents[0]->id;
        }

        return [
            'community_id' => $communityId,
            'membership_approved' => $membershipApproved,
            'resident' => $resident,
            'landlord_dashboard' => $landlordDashboard,
            'owner_only' => $ownerOnly,
            'landlord_enabled' => $landlordEnabled,
            'primary_residence_unit_id' => $primaryResidenceUnitId,
            'active_resident_unit_count' => count($activeResidents),
            'approved_ownership_count' => count($ownedUnits),
            'landlord_unit_count' => count($landlordUnits),
            'owned_units' => $ownedUnits,
            'landlord_units' => $landlordUnits,
        ];
    }

    /**
     * Communities where user has landlord dashboard access (for multi-community picker).
     *
     * @return list<int>
     */
    public function landlordCommunityIds(int $userId): array
    {
        return DB::table('unit_ownerships')
            ->where('user_id', $userId)
            ->where('status', UnitOwnershipStatus::APPROVED)
            ->whereIn('occupancy', [UnitOwnershipOccupancy::RENTED, UnitOwnershipOccupancy::VACANT])
            ->distinct()
            ->pluck('community_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * Rented-unit owners may view bill status when a tenant is billing contact.
     * They must not pay while they are not the unit billing contact.
     */
    public function rentedOwnerCannotPay(int $userId, int $unitId): bool
    {
        if ($unitId < 1 || $userId < 1) {
            return false;
        }

        $isRentedOwner = DB::table('unit_ownerships')
            ->where('user_id', $userId)
            ->where('unit_id', $unitId)
            ->where('status', UnitOwnershipStatus::APPROVED)
            ->where('occupancy', UnitOwnershipOccupancy::RENTED)
            ->exists();

        if (! $isRentedOwner) {
            return false;
        }

        $billingContactId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);

        return $billingContactId !== $userId;
    }
}