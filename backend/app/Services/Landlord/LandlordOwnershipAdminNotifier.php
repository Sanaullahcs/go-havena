<?php

namespace App\Services\Landlord;

use App\Services\NotificationService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class LandlordOwnershipAdminNotifier
{
    public function notifyPendingClaim(int $ownershipId): void
    {
        if (! DB::getSchemaBuilder()->hasTable('unit_ownerships')) {
            return;
        }

        $claim = DB::table('unit_ownerships as o')
            ->join('units', 'units.id', '=', 'o.unit_id')
            ->join('users', 'users.id', '=', 'o.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('o.id', $ownershipId)
            ->select(
                'o.community_id',
                'o.user_id',
                'o.occupancy',
                'units.unit_number',
                DB::raw('COALESCE(profiles.display_name, users.name) as resident_name'),
            )
            ->first();

        if (! $claim) {
            return;
        }

        try {
            $communityId = (int) $claim->community_id;
            $userId = (int) $claim->user_id;
            $occupancy = $this->occupancyLabel((string) $claim->occupancy);
            $residentName = trim((string) ($claim->resident_name ?? 'A resident'));
            $unitNumber = trim((string) ($claim->unit_number ?? ''));

            $title = 'Landlord ownership claim';
            $body = "{$residentName} claimed unit {$unitNumber} ({$occupancy}). Review in Landlord Claims.";

            $adminIds = DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->whereIn('role', ['admin', 'moderator'])
                ->pluck('user_id');

            foreach ($adminIds as $adminId) {
                if ((int) $adminId === $userId) {
                    continue;
                }
                NotificationService::send(
                    (int) $adminId,
                    'info',
                    $title,
                    $body,
                    '/admin/landlord-ownership',
                    [
                        'kind' => 'landlord_ownership_claim',
                        'ownership_id' => $ownershipId,
                        'community_id' => $communityId,
                    ],
                    $communityId,
                );
            }
        } catch (\Throwable $e) {
            Log::warning('Landlord ownership admin notify failed', [
                'ownership_id' => $ownershipId,
                'message' => $e->getMessage(),
            ]);
        }
    }

    private function occupancyLabel(string $occupancy): string
    {
        return match ($occupancy) {
            UnitOwnershipOccupancy::LIVE_HERE => 'I live here',
            UnitOwnershipOccupancy::RENTED => 'Rented out',
            UnitOwnershipOccupancy::VACANT => 'Vacant',
            default => $occupancy,
        };
    }
}