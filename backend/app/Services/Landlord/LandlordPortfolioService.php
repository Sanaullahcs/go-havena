<?php

namespace App\Services\Landlord;

use App\Support\Landlord\UnitOwnershipOccupancy;
use App\Support\Landlord\UnitOwnershipStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LandlordPortfolioService
{
    public function __construct(
        private readonly LandlordAccessService $access,
    ) {}

    /**
     * @return array{access: array, pending_claims: list<object>, landlord_units: list<array<string, mixed>>}
     */
    public function portfolio(int $userId, int $communityId): array
    {
        $access = $this->access->resolve($userId, $communityId);

        $pendingClaims = DB::table('unit_ownerships as o')
            ->join('units', 'units.id', '=', 'o.unit_id')
            ->where('o.user_id', $userId)
            ->where('o.community_id', $communityId)
            ->where('o.status', UnitOwnershipStatus::PENDING)
            ->orderByDesc('o.updated_at')
            ->select(
                'o.id',
                'o.unit_id',
                'o.occupancy',
                'o.status',
                'o.created_at',
                'units.unit_number',
            )
            ->get()
            ->all();

        $landlordUnits = [];
        foreach ($access['landlord_units'] as $row) {
            $unitId = (int) $row['unit_id'];
            $billingName = null;
            $billingId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
            if ($billingId < 1 && ($row['occupancy'] ?? '') === UnitOwnershipOccupancy::VACANT) {
                $billingId = $userId;
            }
            if ($billingId > 0) {
                $billingUser = DB::table('users')
                    ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
                    ->where('users.id', $billingId)
                    ->select('users.name', 'profiles.display_name')
                    ->first();
                $billingName = $billingUser ? (string) ($billingUser->display_name ?: $billingUser->name) : null;
            }
            $landlordUnits[] = array_merge($row, [
                'residents' => app(LandlordAdvisoryService::class)->roster($unitId),
                'billing_contact' => $billingId > 0 ? ['id' => $billingId, 'name' => $billingName] : null,
                'bill_status' => $this->summarizeBillStatus(
                    $unitId,
                    (string) $row['occupancy'],
                    (bool) ($row['landlord_bill_status_only'] ?? false),
                ),
            ]);
        }

        return [
            'access' => $access,
            'pending_claims' => $pendingClaims,
            'landlord_units' => $landlordUnits,
            'advisory_reviews' => app(LandlordAdvisoryService::class)->pendingForLandlord($userId, $communityId),
        ];
    }

    /**
     * @return array{label: string, status: string|null, detail: string|null}
     */
    private function summarizeBillStatus(int $unitId, string $occupancy, bool $viewOnly): array
    {
        if (! Schema::hasTable('unit_service_bills')) {
            return ['label' => 'unavailable', 'status' => null, 'detail' => null];
        }

        $payDetail = $viewOnly ? 'view_only' : 'owner_pays';

        $latest = DB::table('unit_service_bills')
            ->where('unit_id', $unitId)
            ->orderByDesc('id')
            ->first();

        if (! $latest) {
            return [
                'label' => $occupancy === UnitOwnershipOccupancy::RENTED ? 'no_bills_yet' : 'no_bills',
                'status' => null,
                'detail' => $payDetail,
            ];
        }

        $raw = strtolower((string) ($latest->status ?? 'unpaid'));
        $paidLike = in_array($raw, ['paid', 'acknowledged', 'pending_verification'], true);
        $label = $paidLike ? 'paid' : ($raw === 'overdue' ? 'overdue' : 'unpaid');

        return [
            'label' => $label,
            'status' => $raw,
            'detail' => $payDetail,
        ];
    }
}