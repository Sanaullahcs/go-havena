<?php

namespace App\Services\Landlord;

use App\Models\User;
use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use App\Support\Landlord\UnitOwnershipStatus;
use Illuminate\Support\Facades\DB;

/**
 * Keeps billing contact aligned with landlord occupancy (vacant / rented).
 * No-ops for units without approved rented or vacant ownership.
 */
class LandlordBillingContactService
{
    public function __construct(
        private readonly UnitAssignmentService $units,
    ) {}

    public function appliesToUnit(int $unitId): bool
    {
        if ($unitId < 1) {
            return false;
        }

        return DB::table('unit_ownerships')
            ->where('unit_id', $unitId)
            ->where('status', UnitOwnershipStatus::APPROVED)
            ->whereIn('occupancy', [UnitOwnershipOccupancy::VACANT, UnitOwnershipOccupancy::RENTED])
            ->exists();
    }

    public function syncForUnit(int $unitId): void
    {
        if (! $this->appliesToUnit($unitId)) {
            return;
        }

        $unit = DB::table('units')->where('id', $unitId)->first();
        if (! $unit || ($unit->kind ?? UnitAssignmentService::KIND_RESIDENTIAL) !== UnitAssignmentService::KIND_RESIDENTIAL) {
            return;
        }

        $communityId = (int) $unit->community_id;

        $ownership = DB::table('unit_ownerships')
            ->where('unit_id', $unitId)
            ->where('status', UnitOwnershipStatus::APPROVED)
            ->whereIn('occupancy', [UnitOwnershipOccupancy::VACANT, UnitOwnershipOccupancy::RENTED])
            ->orderByDesc('id')
            ->first();

        if (! $ownership) {
            return;
        }

        $ownerUserId = (int) $ownership->user_id;
        $occupancy = (string) $ownership->occupancy;
        $targetId = $ownerUserId;

        if ($occupancy === UnitOwnershipOccupancy::RENTED) {
            $tenantId = $this->firstEligibleActiveTenant($unitId, $communityId, $ownerUserId);
            if ($tenantId !== null) {
                $targetId = $tenantId;
            }
        }

        $this->assignBillingContact($unitId, $communityId, $targetId, (string) $unit->unit_number, $ownerUserId);
    }

    private function firstEligibleActiveTenant(int $unitId, int $communityId, int $ownerUserId): ?int
    {
        $candidates = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
            ->orderBy('joined_at')
            ->pluck('user_id');

        foreach ($candidates as $candidateId) {
            $candidateId = (int) $candidateId;
            if ($candidateId === $ownerUserId) {
                continue;
            }
            if ($this->isEligibleBillingContact($communityId, $candidateId, $unitId, $ownerUserId)) {
                return $candidateId;
            }
        }

        return null;
    }

    private function assignBillingContact(int $unitId, int $communityId, int $userId, string $unitNumber, int $landlordOwnerUserId): void
    {
        if (! $this->isEligibleBillingContact($communityId, $userId, $unitId, $landlordOwnerUserId)) {
            return;
        }

        $current = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
        if ($current === $userId) {
            return;
        }

        DB::table('units')->where('id', $unitId)->update([
            'billing_contact_user_id' => $userId,
            'updated_at' => now(),
        ]);

        $this->units->clearMissingBillingContactNotifications($communityId, $unitId, $unitNumber);
    }

    private function isEligibleBillingContact(
        int $communityId,
        int $userId,
        ?int $unitId = null,
        ?int $landlordOwnerUserId = null,
    ): bool {
        $user = User::query()->find($userId);
        if (! $user || ($user->status ?? '') === 'deleted') {
            return false;
        }

        if (
            $unitId !== null
            && $landlordOwnerUserId !== null
            && $userId === $landlordOwnerUserId
            && $this->isApprovedLandlordOwner($unitId, $userId)
        ) {
            return true;
        }

        if (($user->role ?? '') !== 'resident') {
            return false;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->first();

        return $membership && ($membership->role ?? 'member') === 'member';
    }

    private function isApprovedLandlordOwner(int $unitId, int $userId): bool
    {
        return DB::table('unit_ownerships')
            ->where('unit_id', $unitId)
            ->where('user_id', $userId)
            ->where('status', UnitOwnershipStatus::APPROVED)
            ->whereIn('occupancy', [UnitOwnershipOccupancy::VACANT, UnitOwnershipOccupancy::RENTED])
            ->exists();
    }
}