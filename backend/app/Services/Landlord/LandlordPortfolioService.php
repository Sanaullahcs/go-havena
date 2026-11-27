<?php

namespace App\Services\Landlord;

use App\Services\UnitAssignmentService;
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
        if ($this->ensureLiveHereBillingContact($userId, $communityId, $access['owned_units'] ?? [])) {
            $access = $this->access->resolve($userId, $communityId);
        }

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

        $ownedUnits = $this->presentUnits($access['owned_units'] ?? [], $userId);
        $landlordUnitIds = [];
        foreach ($access['landlord_units'] as $row) {
            $landlordUnitIds[(int) $row['unit_id']] = true;
        }
        $landlordUnits = array_values(array_filter(
            $ownedUnits,
            fn (array $row) => isset($landlordUnitIds[(int) $row['unit_id']]),
        ));

        return [
            'access' => $access,
            'pending_claims' => $pendingClaims,
            'owned_units' => $ownedUnits,
            'landlord_units' => $landlordUnits,
            'advisory_reviews' => app(LandlordAdvisoryService::class)->pendingForLandlord($userId, $communityId),
            'dashboard_stats' => $this->dashboardStats($access, $userId, $communityId),
            'occupancy_graph' => $this->occupancyGraph($access, $userId, $communityId),
        ];
    }

    /**
     * A live-here ownership should already have the owner as an active resident and,
     * until they hand it off, as the billing contact. Older status changes stored neither.
     *
     * @param  list<array<string, mixed>>  $owned
     */
    private function ensureLiveHereBillingContact(int $userId, int $communityId, array $owned): bool
    {
        $changed = false;
        $assignments = app(UnitAssignmentService::class);

        foreach ($owned as $row) {
            if (($row['occupancy'] ?? '') !== UnitOwnershipOccupancy::LIVE_HERE) {
                continue;
            }

            $unitId = (int) $row['unit_id'];
            $ownerActive = DB::table('unit_residents')
                ->where('unit_id', $unitId)
                ->where('user_id', $userId)
                ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
                ->exists();

            if (! $ownerActive) {
                $assignments->assignUserToUnitNumber(
                    $communityId,
                    $userId,
                    (string) $row['unit_number'],
                    false,
                    false,
                    UnitAssignmentService::RESIDENT_ACTIVE,
                    'landlord_ownership',
                );
                $changed = true;
            }

            $billingId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
            $someoneElseIsContact = $billingId > 0
                && $billingId !== $userId
                && DB::table('unit_residents')
                    ->where('unit_id', $unitId)
                    ->where('user_id', $billingId)
                    ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
                    ->exists();
            if ($someoneElseIsContact || $billingId === $userId) {
                continue;
            }

            $assignments->transferBillingContact($communityId, $unitId, $userId);
            $changed = true;
        }

        return $changed;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function presentUnits(array $rows, int $userId): array
    {
        $presented = [];
        foreach ($rows as $row) {
            $unitId = (int) $row['unit_id'];
            $billingName = null;
            $storedBillingId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
            $billingId = $storedBillingId;
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
            $isBillingContact = $storedBillingId === $userId;
            $outgoingTransfer = null;
            if ($isBillingContact) {
                $outgoingTransfer = app(\App\Services\BillingContactTransferService::class)->outgoingFor($unitId, $userId);
            }
            $presented[] = array_merge($row, [
                'is_billing_contact' => $isBillingContact,
                'outgoing_billing_transfer' => $outgoingTransfer,
                'residents' => app(LandlordAdvisoryService::class)->roster($unitId),
                'billing_contact' => $billingId > 0 ? ['id' => $billingId, 'name' => $billingName] : null,
                'bill_status' => $this->summarizeBillStatus(
                    $unitId,
                    (string) $row['occupancy'],
                    (bool) ($row['landlord_bill_status_only'] ?? false),
                ),
            ]);
        }

        return $presented;
    }

    /**
     * Units the landlord owns, plus units they live in as a tenant.
     *
     * @param  array<string, mixed>  $access
     * @return list<array{
     *   unit_id: int,
     *   unit_number: string,
     *   relationship: string,
     *   occupancy_status: string,
     *   kind: string,
     *   family_member_count: int,
     *   resident_count: int
     * }>
     */
    private function occupancyGraph(array $access, int $userId, int $communityId): array
    {
        $points = [];
        $ownedIds = [];

        foreach ($access['owned_units'] ?? [] as $row) {
            $unitId = (int) ($row['unit_id'] ?? 0);
            if ($unitId < 1) {
                continue;
            }
            $ownedIds[$unitId] = true;
            $occupancy = (string) ($row['occupancy'] ?? '');
            $status = match ($occupancy) {
                UnitOwnershipOccupancy::LIVE_HERE => 'self_occupied',
                UnitOwnershipOccupancy::VACANT => 'vacant',
                default => 'rented',
            };
            $points[$unitId] = [
                'unit_id' => $unitId,
                'unit_number' => (string) ($row['unit_number'] ?? ''),
                'relationship' => 'owner',
                'occupancy_status' => $status,
                'kind' => $status,
            ];
        }

        $residentUnits = app(UnitAssignmentService::class)->findActiveUnitsForUser($userId, $communityId);
        foreach ($residentUnits as $unit) {
            $unitId = (int) ($unit->id ?? 0);
            if ($unitId < 1 || isset($ownedIds[$unitId])) {
                continue;
            }
            $points[$unitId] = [
                'unit_id' => $unitId,
                'unit_number' => trim((string) ($unit->unit_number ?? '')),
                'relationship' => 'tenant',
                'occupancy_status' => 'rented',
                'kind' => 'tenant',
            ];
        }

        $counts = $this->unitPeopleCounts(array_keys($points));
        foreach ($points as $unitId => $point) {
            $points[$unitId]['resident_count'] = $counts[$unitId]['residents'] ?? 0;
            $points[$unitId]['family_member_count'] = $counts[$unitId]['family'] ?? 0;
        }

        $list = array_values($points);
        usort($list, fn (array $a, array $b) => strnatcasecmp($a['unit_number'], $b['unit_number']));

        return $list;
    }

    /**
     * @param  list<int>  $unitIds
     * @return array<int, array{residents: int, family: int}>
     */
    private function unitPeopleCounts(array $unitIds): array
    {
        $result = [];
        foreach ($unitIds as $unitId) {
            $result[(int) $unitId] = ['residents' => 0, 'family' => 0];
        }
        if ($unitIds === []) {
            return $result;
        }

        $rows = DB::table('unit_residents')
            ->whereIn('unit_id', $unitIds)
            ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
            ->get(['unit_id', 'user_id']);

        $usersByUnit = [];
        $userIds = [];
        foreach ($rows as $row) {
            $unitId = (int) $row->unit_id;
            $residentId = (int) $row->user_id;
            $usersByUnit[$unitId][] = $residentId;
            $userIds[$residentId] = true;
            if (isset($result[$unitId])) {
                $result[$unitId]['residents']++;
            }
        }

        $familyUsers = [];
        if ($userIds !== [] && Schema::hasTable('family_members')) {
            $familyUsers = DB::table('family_members')
                ->whereIn('user_id', array_keys($userIds))
                ->where('status', 'active')
                ->pluck('user_id')
                ->map(fn ($id) => (int) $id)
                ->flip()
                ->all();
        }

        foreach ($usersByUnit as $unitId => $ids) {
            $family = 0;
            foreach (array_unique($ids) as $id) {
                if (isset($familyUsers[$id])) {
                    $family++;
                }
            }
            if (isset($result[$unitId])) {
                $result[$unitId]['family'] = $family;
            }
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $access
     * @return array{
     *   total_owned_units: int,
     *   rented_units: int,
     *   vacant_units: int,
     *   self_occupied_units: int,
     *   tenant_status: array{
     *     is_also_tenant: bool,
     *     summary: string,
     *     resident_unit_numbers: list<string>
     *   }
     * }
     */
    private function dashboardStats(array $access, int $userId, int $communityId): array
    {
        $owned = $access['owned_units'] ?? [];
        $rented = 0;
        $vacant = 0;
        $liveHere = 0;
        $liveHereUnitIds = [];

        foreach ($owned as $row) {
            $occupancy = (string) ($row['occupancy'] ?? '');
            if ($occupancy === UnitOwnershipOccupancy::RENTED) {
                $rented++;
            } elseif ($occupancy === UnitOwnershipOccupancy::VACANT) {
                $vacant++;
            } elseif ($occupancy === UnitOwnershipOccupancy::LIVE_HERE) {
                $liveHere++;
                $liveHereUnitIds[] = (int) ($row['unit_id'] ?? 0);
            }
        }

        $residentUnits = app(UnitAssignmentService::class)->findActiveUnitsForUser($userId, $communityId);
        $rentingElsewhere = [];
        foreach ($residentUnits as $unit) {
            $unitId = (int) ($unit->id ?? 0);
            if ($unitId < 1) {
                continue;
            }
            if (in_array($unitId, $liveHereUnitIds, true)) {
                continue;
            }
            $number = trim((string) ($unit->unit_number ?? ''));
            if ($number !== '') {
                $rentingElsewhere[] = $number;
            }
        }

        $isAlsoTenant = $rentingElsewhere !== [];
        $summary = $isAlsoTenant
            ? 'Also living in unit '.implode(', ', array_filter($rentingElsewhere)).' as a resident (not your owned home).'
            : 'You are not currently living in a unit you rent from someone else in this community.';

        return [
            'total_owned_units' => count($owned),
            'rented_units' => $rented,
            'vacant_units' => $vacant,
            'self_occupied_units' => $liveHere,
            'tenant_status' => [
                'is_also_tenant' => $isAlsoTenant,
                'summary' => $summary,
                'resident_unit_numbers' => array_values(array_filter($rentingElsewhere)),
            ],
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