<?php

namespace App\Services\Landlord;

use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use App\Support\Landlord\UnitOwnershipStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UnitOwnershipService
{
    public function assertValidOccupancy(string $occupancy): void
    {
        if (! UnitOwnershipOccupancy::isValid($occupancy)) {
            throw ValidationException::withMessages([
                'occupancy' => 'Occupancy must be live_here, rented, or vacant.',
            ]);
        }
    }

    /**
     * Create or update a pending ownership claim (signup / become a landlord).
     */
    public function claim(
        int $communityId,
        int $unitId,
        int $userId,
        string $occupancy,
        string $source = 'signup',
        ?string $proofUrl = null,
    ): int {
        $this->assertValidOccupancy($occupancy);
        $this->assertLiveHereAllowed($unitId, $userId, $occupancy);

        $existing = DB::table('unit_ownerships')
            ->where('unit_id', $unitId)
            ->where('user_id', $userId)
            ->first();

        $now = now();

        if ($existing) {
            $update = [
                'occupancy' => $occupancy,
                'status' => UnitOwnershipStatus::PENDING,
                'source' => $source,
                'reviewed_by' => null,
                'reviewed_at' => null,
                'rejection_reason' => null,
                'updated_at' => $now,
            ];
            if ($proofUrl !== null) {
                $update['proof_url'] = $proofUrl;
            }
            DB::table('unit_ownerships')->where('id', $existing->id)->update($update);

            return (int) $existing->id;
        }

        return (int) DB::table('unit_ownerships')->insertGetId([
            'community_id' => $communityId,
            'unit_id' => $unitId,
            'user_id' => $userId,
            'status' => UnitOwnershipStatus::PENDING,
            'occupancy' => $occupancy,
            'source' => $source,
            'proof_url' => $proofUrl,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function approve(int $ownershipId, int $reviewedByUserId): void
    {
        $row = DB::table('unit_ownerships')->where('id', $ownershipId)->first();
        DB::table('unit_ownerships')->where('id', $ownershipId)->update([
            'status' => UnitOwnershipStatus::APPROVED,
            'reviewed_by' => $reviewedByUserId,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        if ($row) {
            app(LandlordBillingContactService::class)->syncForUnit((int) $row->unit_id);
        }
    }

    public function setLandlordEnabled(int $userId, int $communityId, bool $enabled = true): void
    {
        $existing = DB::table('user_community_landlord_profiles')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->first();

        $now = now();

        if ($existing) {
            DB::table('user_community_landlord_profiles')->where('id', $existing->id)->update([
                'landlord_enabled' => $enabled,
                'updated_at' => $now,
            ]);

            return;
        }

        DB::table('user_community_landlord_profiles')->insert([
            'user_id' => $userId,
            'community_id' => $communityId,
            'landlord_enabled' => $enabled,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * Change occupancy on an approved ownership. Blocks live_here while other residents remain.
     * Moving off live_here ends the owner's residency on that unit only.
     */
    public function setOccupancy(int $ownershipId, int $userId, string $occupancy): void
    {
        $this->assertValidOccupancy($occupancy);

        $row = DB::table('unit_ownerships')->where('id', $ownershipId)->where('user_id', $userId)->first();
        abort_if(! $row, 404, 'Ownership not found.');
        if ($row->status !== UnitOwnershipStatus::APPROVED) {
            throw ValidationException::withMessages([
                'occupancy' => 'Occupancy can change only after ownership is approved.',
            ]);
        }

        $this->assertLiveHereAllowed((int) $row->unit_id, $userId, $occupancy);

        $previous = (string) $row->occupancy;
        DB::table('unit_ownerships')->where('id', $ownershipId)->update([
            'occupancy' => $occupancy,
            'updated_at' => now(),
        ]);

        if ($previous === UnitOwnershipOccupancy::LIVE_HERE && $occupancy !== UnitOwnershipOccupancy::LIVE_HERE) {
            DB::table('unit_residents')
                ->where('unit_id', $row->unit_id)
                ->where('user_id', $userId)
                ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
                ->update([
                    'status' => UnitAssignmentService::RESIDENT_LEFT,
                    'left_at' => now(),
                    'updated_at' => now(),
                ]);
        }

        if (in_array($occupancy, [UnitOwnershipOccupancy::VACANT, UnitOwnershipOccupancy::RENTED], true)) {
            app(LandlordBillingContactService::class)->syncForUnit((int) $row->unit_id);
        }

        if ($occupancy === UnitOwnershipOccupancy::LIVE_HERE) {
            $this->setPrimaryResidence($userId, (int) $row->community_id, (int) $row->unit_id);
        }
    }

    /**
     * Admin-approved signup package: record ownership without a second queue.
     * Rented/vacant does not create residency. Live here does not remove an existing residency row.
     */
    public function recordApprovedFromPackage(
        int $communityId,
        int $unitId,
        int $userId,
        string $occupancy,
        int $reviewedBy,
        ?string $proofUrl = null,
    ): int {
        $id = $this->claim($communityId, $unitId, $userId, $occupancy, 'signup', $proofUrl);
        $this->approve($id, $reviewedBy);
        if ($occupancy === UnitOwnershipOccupancy::LIVE_HERE) {
            $this->setPrimaryResidence($userId, $communityId, $unitId);
        } else {
            $this->setLandlordEnabled($userId, $communityId, true);
        }

        return $id;
    }

    private function assertLiveHereAllowed(int $unitId, int $userId, string $occupancy): void
    {
        if ($occupancy !== UnitOwnershipOccupancy::LIVE_HERE) {
            return;
        }

        $others = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('user_id', '!=', $userId)
            ->whereIn('status', [UnitAssignmentService::RESIDENT_ACTIVE, UnitAssignmentService::RESIDENT_PENDING])
            ->exists();

        if ($others) {
            throw ValidationException::withMessages([
                'occupancy' => 'This unit already has other residents. Clear tenancy before marking live here.',
            ]);
        }
    }

    public function setPrimaryResidence(int $userId, int $communityId, ?int $unitId): void
    {
        $existing = DB::table('user_community_landlord_profiles')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->first();

        $now = now();

        if ($existing) {
            DB::table('user_community_landlord_profiles')->where('id', $existing->id)->update([
                'primary_residence_unit_id' => $unitId,
                'updated_at' => $now,
            ]);

            return;
        }

        DB::table('user_community_landlord_profiles')->insert([
            'user_id' => $userId,
            'community_id' => $communityId,
            'landlord_enabled' => false,
            'primary_residence_unit_id' => $unitId,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}