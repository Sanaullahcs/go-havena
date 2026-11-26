<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class UnitAssignmentService
{
    public const KIND_RESIDENTIAL = 'residential';

    public const KIND_OFFICE = 'office';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    public const RESIDENT_ACTIVE = 'active';

    public const RESIDENT_PENDING = 'pending';

    public const RESIDENT_REJECTED = 'rejected';

    public const RESIDENT_LEFT = 'left';

    public const PLACEHOLDER_UNITS = ['office', 'management office'];

    public const DUPLICATE_UNIT_MESSAGE = 'This unit already exists in the community.';

    public const CANNOT_DELETE_ASSIGNED_UNIT_MESSAGE = 'Remove all residents from this unit before deleting it.';

    public const CANNOT_DELETE_OFFICE_UNIT_MESSAGE = 'Office units cannot be deleted.';

    public function normalizeUnitNumber(string $value): string
    {
        $trimmed = trim(preg_replace('/\s+/', ' ', $value) ?? $value);

        return mb_strtolower($trimmed);
    }

    public function isPlaceholderUnitNumber(?string $value): bool
    {
        $normalized = $this->normalizeUnitNumber((string) $value);

        return $normalized === '' || in_array($normalized, self::PLACEHOLDER_UNITS, true);
    }

    /** Case-insensitive lookup (matches admin create / update validation). */
    public function findUnitByNormalizedNumber(int $communityId, string $normalized, ?int $exceptUnitId = null): ?object
    {
        $query = DB::table('units')
            ->where('community_id', $communityId)
            ->where(function ($builder) use ($normalized) {
                $builder->where('unit_number_normalized', $normalized)
                    ->orWhereRaw('LOWER(TRIM(unit_number)) = ?', [$normalized]);
            });

        if ($exceptUnitId) {
            $query->where('id', '!=', $exceptUnitId);
        }

        return $query->first();
    }

    public function unitNumberExistsInCommunity(int $communityId, string $unitNumber, ?int $exceptUnitId = null): bool
    {
        $normalized = $this->normalizeUnitNumber($unitNumber);
        if ($normalized === '') {
            return false;
        }

        return $this->findUnitByNormalizedNumber($communityId, $normalized, $exceptUnitId) !== null;
    }

    public function listCommunityUnits(int $communityId, bool $includeOffice = false): array
    {
        $query = DB::table('units')
            ->where('community_id', $communityId)
            ->where('status', self::STATUS_ACTIVE)
            ->orderBy('unit_number');

        if (! $includeOffice) {
            $query->where('kind', self::KIND_RESIDENTIAL);
        }

        return $query->get()->map(fn ($row) => $this->formatUnit($row))->all();
    }

    public function findActiveUnitForUser(int $userId, int $communityId): ?object
    {
        return $this->findActiveUnitsForUser($userId, $communityId)[0] ?? null;
    }

    /** @return list<object> */
    public function findActiveUnitsForUser(int $userId, int $communityId): array
    {
        return DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', $communityId)
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->where('units.kind', self::KIND_RESIDENTIAL)
            ->orderBy('units.unit_number')
            ->select('units.*', 'ur.id as unit_resident_id', 'ur.status as unit_resident_status', 'ur.source as unit_resident_source')
            ->get()
            ->all();
    }

    /** @return list<object> */
    public function findUnitAssociationsForUser(int $userId, int $communityId): array
    {
        return DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', $communityId)
            ->whereIn('ur.status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING, self::RESIDENT_REJECTED])
            ->where('units.kind', self::KIND_RESIDENTIAL)
            ->orderByRaw("CASE ur.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END")
            ->orderBy('units.unit_number')
            ->select(
                'units.*',
                'ur.id as unit_resident_id',
                'ur.status as unit_resident_status',
                'ur.source as unit_resident_source',
                'ur.rejection_reason as unit_resident_rejection_reason',
                'ur.joined_at as unit_resident_joined_at',
            )
            ->get()
            ->all();
    }

    /** @return array<string, mixed>|null First active unit — legacy single-unit clients. */
    public function userUnitBrief(User $user, ?int $communityId = null): ?array
    {
        $units = $this->userUnitsBrief($user, $communityId);

        return $units[0] ?? null;
    }

    /** @return list<array<string, mixed>> */
    public function userUnitsBrief(User $user, ?int $communityId = null): array
    {
        $communityId = $communityId ?: $this->approvedCommunityId((int) $user->id);
        if (! $communityId) {
            return [];
        }

        $this->pruneUnitsCopiedFromOtherCommunities((int) $user->id, $communityId);

        $rows = $this->findUnitAssociationsForUser((int) $user->id, $communityId);
        $ownershipByUnit = $this->ownershipRowsForUser((int) $user->id, $communityId);
        $packageOccupancy = $this->packageOccupancyByUnit((int) $user->id, $communityId);

        $briefs = array_map(function ($unit) use ($user, $ownershipByUnit, $packageOccupancy) {
            // Preserve join aliases — refreshBillingContactIfStale reloads units.* only.
            $associationStatus = $unit->unit_resident_status ?? self::RESIDENT_ACTIVE;
            $associationSource = $unit->unit_resident_source ?? null;
            $associationRejectionReason = $unit->unit_resident_rejection_reason ?? null;
            $unitResidentId = isset($unit->unit_resident_id) ? (int) $unit->unit_resident_id : null;

            $contactId = (int) ($unit->billing_contact_user_id ?? 0);
            $fresh = ($contactId > 0 && $contactId !== (int) $user->id)
                ? ($this->refreshBillingContactIfStale((int) $unit->id) ?? $unit)
                : $unit;
            $payload = $this->formatUnit($fresh, (int) $user->id);
            $payload['association_status'] = $associationStatus;
            $payload['association_source'] = $associationSource;
            $payload['association_rejection_reason'] = $associationRejectionReason;
            $payload['unit_resident_id'] = $unitResidentId;
            $this->attachOccupancyAndApproval($payload, $ownershipByUnit, $packageOccupancy);

            return $payload;
        }, $rows);

        $seen = [];
        foreach ($briefs as $payload) {
            $seen[(int) $payload['id']] = true;
        }

        foreach ($ownershipByUnit as $unitId => $ownership) {
            if (isset($seen[$unitId])) {
                continue;
            }
            $unit = DB::table('units')
                ->where('id', $unitId)
                ->where('kind', self::KIND_RESIDENTIAL)
                ->first();
            if (! $unit) {
                continue;
            }
            $payload = $this->formatUnit($unit, (int) $user->id);
            // Not an active residency. Callers that count association_status=active must skip this row.
            $payload['association_status'] = 'ownership';
            $payload['association_source'] = 'ownership';
            $payload['association_rejection_reason'] = null;
            $payload['unit_resident_id'] = null;
            $this->attachOccupancyAndApproval($payload, $ownershipByUnit, $packageOccupancy);
            $briefs[] = $payload;
        }

        usort($briefs, function (array $a, array $b): int {
            return strnatcasecmp((string) ($a['unit_number'] ?? ''), (string) ($b['unit_number'] ?? ''));
        });

        return $briefs;
    }

    /**
     * @return array<int, object>
     */
    private function ownershipRowsForUser(int $userId, int $communityId): array
    {
        if (! Schema::hasTable('unit_ownerships')) {
            return [];
        }

        $rows = DB::table('unit_ownerships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->whereIn('status', ['pending', 'approved', 'rejected'])
            ->orderByDesc('id')
            ->get();

        $byUnit = [];
        foreach ($rows as $row) {
            $unitId = (int) $row->unit_id;
            if (! isset($byUnit[$unitId])) {
                $byUnit[$unitId] = $row;
            }
        }

        return $byUnit;
    }

    /**
     * Latest stored occupancy on a registration package item, keyed by unit id.
     *
     * @return array<int, string>
     */
    private function packageOccupancyByUnit(int $userId, int $communityId): array
    {
        if (! Schema::hasTable('unit_registration_package_items')
            || ! Schema::hasColumn('unit_registration_package_items', 'occupancy')) {
            return [];
        }

        $rows = DB::table('unit_registration_package_items as items')
            ->join('unit_registration_packages as packages', 'packages.id', '=', 'items.package_id')
            ->where('packages.user_id', $userId)
            ->where('packages.community_id', $communityId)
            ->whereNotNull('items.unit_id')
            ->whereIn('items.occupancy', ['live_here', 'rented', 'vacant'])
            ->orderByDesc('items.id')
            ->get(['items.unit_id', 'items.occupancy']);

        $byUnit = [];
        foreach ($rows as $row) {
            $unitId = (int) $row->unit_id;
            if (! isset($byUnit[$unitId])) {
                $byUnit[$unitId] = (string) $row->occupancy;
            }
        }

        return $byUnit;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, object>  $ownershipByUnit
     * @param  array<int, string>  $packageOccupancy
     */
    private function attachOccupancyAndApproval(array &$payload, array $ownershipByUnit, array $packageOccupancy): void
    {
        $unitId = (int) ($payload['id'] ?? 0);
        $ownership = $ownershipByUnit[$unitId] ?? null;
        $storedOccupancy = $ownership && in_array((string) ($ownership->occupancy ?? ''), ['live_here', 'rented', 'vacant'], true)
            ? (string) $ownership->occupancy
            : ($packageOccupancy[$unitId] ?? null);

        $payload['occupancy'] = $storedOccupancy;
        $payload['ownership_id'] = $ownership ? (int) $ownership->id : null;
        $payload['ownership_status'] = $ownership ? (string) $ownership->status : null;

        $association = (string) ($payload['association_status'] ?? '');
        if (in_array($association, [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING, self::RESIDENT_REJECTED], true)) {
            $payload['approval_status'] = $association === self::RESIDENT_ACTIVE ? 'approved' : $association;

            return;
        }

        $payload['approval_status'] = $ownership ? (string) $ownership->status : null;
    }

    public function activeUnitCountForUser(int $userId, int $communityId): int
    {
        return (int) DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', $communityId)
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->where('units.kind', self::KIND_RESIDENTIAL)
            ->count();
    }

    public function syncUserToCommunity(User $user, int $communityId): ?object
    {
        $user->loadMissing('profile');
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->first();

        if (! $membership || ($membership->status ?? '') !== 'approved') {
            return null;
        }

        $isAdmin = $this->isStaffMembership($membership, $user);
        if ($isAdmin) {
            return $this->assignUserToUnitNumber($communityId, (int) $user->id, 'Office', true);
        }

        $inviteUnits = [];
        if (Schema::hasTable('invite_unit_assignments')) {
            $inviteUnits = DB::table('invite_unit_assignments')
                ->where('community_id', $communityId)
                ->where('user_id', $user->id)
                ->orderBy('sort_order')
                ->pluck('unit_number')
                ->map(fn ($n) => trim((string) $n))
                ->filter()
                ->values()
                ->all();
        }

        $this->pruneUnitsCopiedFromOtherCommunities((int) $user->id, $communityId);

        if ($inviteUnits !== []) {
            $assigned = $this->assignUserToMultipleUnitNumbers(
                $communityId,
                (int) $user->id,
                $inviteUnits,
                'invite',
            );

            return $assigned[0] ?? null;
        }

        // Never collapse multi-unit residents back to the single profile display unit.
        // Pending requests in THIS community already identify the units to review.
        $existing = $this->findUnitAssociationsForUser((int) $user->id, $communityId);
        $active = array_values(array_filter(
            $existing,
            fn ($unit) => ($unit->unit_resident_status ?? '') === self::RESIDENT_ACTIVE,
        ));
        if ($active !== []) {
            $this->syncProfileUnitNumberDisplay((int) $user->id, $communityId);

            return $active[0];
        }
        if ($existing !== []) {
            return $existing[0];
        }

        // profiles.unit_number is a single global display field. Never copy it
        // into a second community — it belongs to the resident's other home.
        if ($this->userHasUnitsInOtherCommunity((int) $user->id, $communityId)
            || $this->userHasOtherCommunityMembership((int) $user->id, $communityId)
            || $this->userHasPackageOrInviteUnitsInCommunity((int) $user->id, $communityId)) {
            return null;
        }

        $unitNumber = trim((string) ($user->profile?->unit_number ?? ''));
        if ($unitNumber === '') {
            return null;
        }

        return $this->assignUserToUnitNumber($communityId, (int) $user->id, $unitNumber, false);
    }

    /**
     * Batch brief unit lists for admin identity labels (chat, notices, guests, etc.).
     *
     * @param  list<int>  $userIds
     * @return array<int, list<array{id: int, unit_number: string}>>
     */
    public function unitsBriefMapForUsers(int $communityId, array $userIds): array
    {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds))));
        if ($userIds === [] || $communityId < 1) {
            return [];
        }

        // Identity labels (chat, notices, etc.) only show approved associations.
        $rows = DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.community_id', $communityId)
            ->whereIn('ur.user_id', $userIds)
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->where('units.kind', self::KIND_RESIDENTIAL)
            ->orderBy('units.unit_number')
            ->get([
                'ur.user_id',
                'units.id',
                'units.unit_number',
            ]);

        $map = [];
        foreach ($rows as $row) {
            $uid = (int) $row->user_id;
            $map[$uid] ??= [];
            $map[$uid][] = [
                'id' => (int) $row->id,
                'unit_number' => (string) $row->unit_number,
            ];
        }

        return $map;
    }

    /** @return list<string> */
    public function listInviteUnitNumbers(int $communityId, int $userId): array
    {
        if (! Schema::hasTable('invite_unit_assignments')) {
            return [];
        }

        return DB::table('invite_unit_assignments')
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->orderBy('sort_order')
            ->pluck('unit_number')
            ->map(fn ($n) => trim((string) $n))
            ->filter()
            ->values()
            ->all();
    }

    /** Persist admin-invite unit list applied at membership sync. */
    public function storeInviteUnitAssignments(int $communityId, int $userId, array $unitNumbers): void
    {
        if (! Schema::hasTable('invite_unit_assignments')) {
            return;
        }

        DB::table('invite_unit_assignments')
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->delete();

        $order = 0;
        $seen = [];
        foreach ($unitNumbers as $raw) {
            $trimmed = trim((string) $raw);
            if ($trimmed === '') {
                continue;
            }
            $normalized = $this->normalizeUnitNumber($trimmed);
            if ($normalized === '' || isset($seen[$normalized])) {
                continue;
            }
            $seen[$normalized] = true;
            DB::table('invite_unit_assignments')->insert([
                'community_id' => $communityId,
                'user_id' => $userId,
                'unit_number' => $trimmed,
                'unit_number_normalized' => $normalized,
                'sort_order' => $order++,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if ($seen !== []) {
            $first = reset($seen);
            $hasOtherApproved = DB::table('community_memberships')
                ->where('user_id', $userId)
                ->where('community_id', '!=', $communityId)
                ->where('status', 'approved')
                ->exists();
            if (! $hasOtherApproved) {
                // Keep profile display in sync with first invited unit number string.
                $firstNumber = DB::table('invite_unit_assignments')
                    ->where('community_id', $communityId)
                    ->where('user_id', $userId)
                    ->orderBy('sort_order')
                    ->value('unit_number');
                if ($firstNumber) {
                    DB::table('profiles')->where('user_id', $userId)->update([
                        'unit_number' => $firstNumber,
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    /**
     * @param  bool  $replaceOthers  When true (legacy), leave other units in this community.
     *                               When false, attach as an additional unit (multi-unit).
     */
    public function assignUserToUnitNumber(
        int $communityId,
        int $userId,
        string $unitNumber,
        bool $isAdmin = false,
        bool $replaceOthers = true,
        string $status = self::RESIDENT_ACTIVE,
        ?string $source = null,
        bool $claimBillingContactIfEmpty = true,
    ): object {
        $user = User::query()->find($userId);
        $membership = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->first();
        $isAdmin = $isAdmin || $this->isStaffMembership($membership, $user);

        $unitNumber = trim($unitNumber);
        if ($unitNumber === '') {
            throw ValidationException::withMessages([
                'unit_number' => 'Unit / Apartment is required.',
            ]);
        }

        if ($isAdmin) {
            $unitNumber = $this->isPlaceholderUnitNumber($unitNumber) ? trim($unitNumber) : 'Office';
            if ($unitNumber === '' || ! $this->isPlaceholderUnitNumber($unitNumber)) {
                $unitNumber = 'Office';
            }
        }

        $normalized = $this->normalizeUnitNumber($unitNumber);
        $kind = $isAdmin ? self::KIND_OFFICE : self::KIND_RESIDENTIAL;

        $unit = DB::transaction(function () use (
            $communityId,
            $userId,
            $unitNumber,
            $normalized,
            $kind,
            $isAdmin,
            $replaceOthers,
            $status,
            $source,
            $claimBillingContactIfEmpty,
        ) {
            $unit = DB::table('units')
                ->where('community_id', $communityId)
                ->where('unit_number_normalized', $normalized)
                ->lockForUpdate()
                ->first();

            $now = now();

            if (! $unit) {
                $unitId = DB::table('units')->insertGetId([
                    'community_id' => $communityId,
                    'unit_number' => $unitNumber,
                    'unit_number_normalized' => $normalized,
                    'kind' => $kind,
                    'status' => self::STATUS_ACTIVE,
                    'billing_contact_user_id' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $unit = DB::table('units')->find($unitId);
            }

            if ($replaceOthers) {
                $this->moveUserToUnit($communityId, $userId, (int) $unit->id, true, $status, $source);
            } else {
                $this->attachUserToUnit($communityId, $userId, (int) $unit->id, $status, $source);
            }

            $unit = DB::table('units')->lockForUpdate()->find($unit->id);
            if (
                $claimBillingContactIfEmpty
                && $status === self::RESIDENT_ACTIVE
                && $unit
                && $unit->kind === self::KIND_RESIDENTIAL
                && empty($unit->billing_contact_user_id)
                && ! $isAdmin
                && $this->isEligibleBillingContact($communityId, $userId)
            ) {
                DB::table('units')->where('id', $unit->id)->update([
                    'billing_contact_user_id' => $userId,
                    'updated_at' => $now,
                ]);
                $unit->billing_contact_user_id = $userId;
                $this->clearMissingBillingContactNotifications($communityId, (int) $unit->id, (string) $unit->unit_number);
            }

            $this->syncProfileUnitNumberDisplay($userId, $communityId, $unit?->unit_number);

            return $unit;
        });

        if ($unit && ($unit->kind ?? '') === self::KIND_RESIDENTIAL) {
            app(UnitServiceBillService::class)->syncDueAutomaticBillsForUnit(
                (int) $unit->id,
                $communityId,
                $userId,
            );
        }

        return $unit;
    }

    public function createUnit(int $communityId, string $unitNumber, string $kind = self::KIND_RESIDENTIAL): object
    {
        $unitNumber = trim($unitNumber);
        if ($unitNumber === '') {
            throw ValidationException::withMessages([
                'unit_number' => 'Unit / Apartment is required.',
            ]);
        }

        $normalized = $this->normalizeUnitNumber($unitNumber);

        return DB::transaction(function () use ($communityId, $unitNumber, $normalized, $kind) {
            if ($this->findUnitByNormalizedNumber($communityId, $normalized)) {
                $this->throwDuplicateUnitNumber();
            }

            try {
                $id = DB::table('units')->insertGetId([
                    'community_id' => $communityId,
                    'unit_number' => $unitNumber,
                    'unit_number_normalized' => $normalized,
                    'kind' => $kind === self::KIND_OFFICE ? self::KIND_OFFICE : self::KIND_RESIDENTIAL,
                    'status' => self::STATUS_ACTIVE,
                    'billing_contact_user_id' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (UniqueConstraintViolationException) {
                $this->throwDuplicateUnitNumber();
            }

            return DB::table('units')->find($id);
        });
    }

    public function updateUnit(int $communityId, int $unitId, array $data): object
    {
        $unit = DB::table('units')->where('id', $unitId)->where('community_id', $communityId)->first();
        abort_if(! $unit, 404, 'Unit not found.');

        $updates = ['updated_at' => now()];

        if (isset($data['unit_number'])) {
            $unitNumber = trim((string) $data['unit_number']);
            $normalized = $this->normalizeUnitNumber($unitNumber);
            if ($this->findUnitByNormalizedNumber($communityId, $normalized, $unitId)) {
                $this->throwDuplicateUnitNumber();
            }
            $updates['unit_number'] = $unitNumber;
            $updates['unit_number_normalized'] = $normalized;
        }

        if (isset($data['status']) && in_array($data['status'], [self::STATUS_ACTIVE, self::STATUS_INACTIVE], true)) {
            $updates['status'] = $data['status'];
        }

        if (isset($data['kind']) && in_array($data['kind'], [self::KIND_RESIDENTIAL, self::KIND_OFFICE], true)) {
            $updates['kind'] = $data['kind'];
        }

        DB::table('units')->where('id', $unitId)->update($updates);

        if (isset($updates['unit_number'])) {
            $residentIds = DB::table('unit_residents')
                ->where('unit_id', $unitId)
                ->where('status', self::RESIDENT_ACTIVE)
                ->pluck('user_id');
            DB::table('profiles')->whereIn('user_id', $residentIds)->update([
                'unit_number' => $updates['unit_number'],
                'updated_at' => now(),
            ]);
        }

        return DB::table('units')->find($unitId);
    }

    public function deleteUnit(int $communityId, int $unitId): void
    {
        $unit = DB::table('units')
            ->where('id', $unitId)
            ->where('community_id', $communityId)
            ->first();

        abort_if(! $unit, 404, 'Unit not found.');

        if (($unit->kind ?? '') === self::KIND_OFFICE) {
            throw ValidationException::withMessages([
                'unit_id' => self::CANNOT_DELETE_OFFICE_UNIT_MESSAGE,
            ]);
        }

        if ($this->residentMembersQuery($unitId)->exists()) {
            throw ValidationException::withMessages([
                'unit_id' => self::CANNOT_DELETE_ASSIGNED_UNIT_MESSAGE,
            ]);
        }

        DB::transaction(function () use ($unitId) {
            app(BillingContactTransferService::class)->cancelPendingForUnit($unitId, 'Unit was deleted.');
            DB::table('units')->where('id', $unitId)->delete();
        });
    }

    public function transferBillingContact(int $communityId, int $unitId, int $userId, bool $cancelPending = true): object
    {
        $unit = DB::table('units')->where('id', $unitId)->where('community_id', $communityId)->first();
        abort_if(! $unit, 404, 'Unit not found.');

        $resident = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('user_id', $userId)
            ->where('status', self::RESIDENT_ACTIVE)
            ->first();

        if (! $resident || ! $this->isEligibleBillingContact($communityId, $userId)) {
            throw ValidationException::withMessages([
                'user_id' => 'Billing contact must be an active resident of this unit. Community admins cannot be billing contacts.',
            ]);
        }

        DB::table('units')->where('id', $unitId)->update([
            'billing_contact_user_id' => $userId,
            'updated_at' => now(),
        ]);

        if ($cancelPending) {
            app(BillingContactTransferService::class)->cancelPendingForUnit($unitId, 'Cancelled because the billing contact was updated.');
        }

        $this->clearMissingBillingContactNotifications($communityId, $unitId, (string) $unit->unit_number);

        return DB::table('units')->find($unitId);
    }

    public function approvedCommunityIdFor(int $userId): ?int
    {
        return $this->approvedCommunityId($userId);
    }

    public function isEligibleBillingContactFor(int $communityId, int $userId): bool
    {
        return $this->isEligibleBillingContact($communityId, $userId);
    }

    /** @return list<array{id: int, name: string, email: ?string, joined_at: mixed, is_billing_contact: bool}> */
    public function listResidentMembers(int $unitId, ?int $billingContactUserId = null): array
    {
        if ($billingContactUserId === null) {
            $billingContactUserId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
        }

        return $this->residentMembersQuery($unitId)
            ->orderBy('users.name')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => $row->display_name ?: $row->name,
                'email' => $row->email,
                'joined_at' => $row->joined_at,
                'is_billing_contact' => (int) $billingContactUserId === (int) $row->id,
            ])
            ->all();
    }

    public function isBillingContact(int $userId, int $communityId): bool
    {
        foreach ($this->findActiveUnitsForUser($userId, $communityId) as $unit) {
            $effectiveId = $this->effectiveBillingContactUserId($unit);
            if ($effectiveId !== null && $effectiveId === $userId) {
                return true;
            }
        }

        return false;
    }

    /** @return list<object> Units where the user is the effective billing contact. */
    public function billingContactUnitsForUser(int $userId, int $communityId): array
    {
        $out = [];
        foreach ($this->findActiveUnitsForUser($userId, $communityId) as $unit) {
            $effectiveId = $this->effectiveBillingContactUserId($unit);
            if ($effectiveId !== null && $effectiveId === $userId) {
                $out[] = $unit;
            }
        }

        return $out;
    }

    public function effectiveBillingContactUserId(object $unit): ?int
    {
        $fresh = $this->refreshBillingContactIfStale((int) $unit->id) ?? $unit;

        return $this->resolveEffectiveBillingContactId($fresh);
    }

    public function eligibleResidentialUnits(int $communityId): array
    {
        return DB::table('units')
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_RESIDENTIAL)
            ->where('status', self::STATUS_ACTIVE)
            ->orderBy('unit_number')
            ->get()
            ->all();
    }

    /** Active residential units that currently have an approved resident. */
    public function occupiedResidentialUnits(int $communityId): array
    {
        return array_values(array_filter(
            $this->eligibleResidentialUnits($communityId),
            fn ($unit) => $this->hasActiveResident((int) $unit->id),
        ));
    }

    public function occupiedResidentialUnitCount(int $communityId): int
    {
        return DB::table('units')
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_RESIDENTIAL)
            ->where('status', self::STATUS_ACTIVE)
            ->whereExists(fn ($query) => $this->constrainToActiveResident($query))
            ->count();
    }

    public function hasActiveResident(int $unitId): bool
    {
        return DB::table('units')
            ->where('id', $unitId)
            ->where('kind', self::KIND_RESIDENTIAL)
            ->where('status', self::STATUS_ACTIVE)
            ->whereExists(fn ($query) => $this->constrainToActiveResident($query))
            ->exists();
    }

    private function constrainToActiveResident($query): void
    {
        $query->selectRaw('1')
            ->from('unit_residents as ur')
            ->join('users', 'users.id', '=', 'ur.user_id')
            ->join('community_memberships as cm', function ($join) {
                $join->on('cm.user_id', '=', 'ur.user_id')
                    ->on('cm.community_id', '=', 'ur.community_id');
            })
            ->whereColumn('ur.unit_id', 'units.id')
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->where('cm.status', 'approved')
            ->where('cm.role', 'member');
    }

    /** @return list<array{user_id: int, unit_id: int, unit_number: string}> */
    public function billingContactsForCommunity(int $communityId): array
    {
        $seen = [];
        $contacts = [];
        foreach ($this->eligibleResidentialUnits($communityId) as $unit) {
            $userId = (int) ($this->effectiveBillingContactUserId($unit) ?? 0);
            if ($userId < 1 || isset($seen[$userId])) {
                continue;
            }
            $seen[$userId] = true;
            $contacts[] = [
                'user_id' => $userId,
                'unit_id' => (int) $unit->id,
                'unit_number' => (string) $unit->unit_number,
            ];
        }

        return $contacts;
    }

    public function formatUnit(object $unit, ?int $viewerId = null): array
    {
        $residentCount = $this->residentMembersQuery((int) $unit->id)->count();

        $billingContactId = $this->resolveEffectiveBillingContactId($unit);
        $contact = null;
        if ($billingContactId) {
            $user = DB::table('users')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('users.id', $billingContactId)
                ->select('users.id', 'users.name', 'profiles.display_name')
                ->first();
            $contact = [
                'id' => $billingContactId,
                'name' => $user
                    ? ($user->display_name ?: $user->name)
                    : 'Billing contact',
            ];
        }

        return [
            'id' => (int) $unit->id,
            'community_id' => (int) $unit->community_id,
            'unit_number' => $unit->unit_number,
            'kind' => $unit->kind,
            'status' => $unit->status,
            'billing_contact_user_id' => $billingContactId,
            'billing_contact' => $contact,
            'resident_count' => $residentCount,
            'is_billing_contact' => $viewerId !== null
                && $billingContactId !== null
                && $billingContactId === $viewerId,
            'created_at' => $unit->created_at ?? null,
            'updated_at' => $unit->updated_at ?? null,
        ];
    }

    public function formatAdminUnit(object $unit): array
    {
        $payload = $this->formatUnit($unit);
        $payload['residents'] = $this->listResidentMembers(
            (int) $unit->id,
            $payload['billing_contact_user_id'],
        );

        return $payload;
    }

    public function refreshBillingContactIfStale(int $unitId): ?object
    {
        $unit = DB::table('units')->find($unitId);
        if (! $unit) {
            return null;
        }

        $rawId = ! empty($unit->billing_contact_user_id) ? (int) $unit->billing_contact_user_id : null;
        $effectiveId = $this->resolveEffectiveBillingContactId($unit);
        if ($rawId === $effectiveId) {
            return $unit;
        }

        $nextId = $effectiveId ?? $this->nextEligibleBillingContact($unitId, (int) $unit->community_id);
        DB::table('units')->where('id', $unitId)->update([
            'billing_contact_user_id' => $nextId,
            'updated_at' => now(),
        ]);

        if ($nextId) {
            $this->clearMissingBillingContactNotifications((int) $unit->community_id, $unitId, (string) $unit->unit_number);
        }

        return DB::table('units')->find($unitId);
    }

    private function resolveEffectiveBillingContactId(object $unit): ?int
    {
        $rawId = ! empty($unit->billing_contact_user_id) ? (int) $unit->billing_contact_user_id : null;
        if ($rawId === null) {
            return null;
        }

        if (! $this->isEligibleBillingContact((int) $unit->community_id, $rawId)) {
            return null;
        }

        $isActiveResident = DB::table('unit_residents')
            ->where('unit_id', (int) $unit->id)
            ->where('user_id', $rawId)
            ->where('status', self::RESIDENT_ACTIVE)
            ->exists();

        return $isActiveResident ? $rawId : null;
    }

    public function notifyAdminsMissingBillingContact(int $communityId, string $unitNumber, string $serviceName, ?int $unitId = null): void
    {
        $adminIds = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->whereIn('cm.role', ['admin', 'moderator'])
            ->where('cm.status', 'approved')
            ->where('users.status', '!=', 'deleted')
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $query = http_build_query(array_filter([
            'unitId' => $unitId,
            'unitNumber' => $unitNumber,
        ]));

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                $adminId,
                'warning',
                'Unit has no billing contact',
                "{$unitNumber} has no billing contact. {$serviceName} was created but no resident was notified.",
                '/screens/admin-units'.($query !== '' ? '?'.$query : ''),
                [
                    'kind' => 'unit_missing_billing_contact',
                    'community_id' => $communityId,
                    'unit_id' => $unitId,
                    'unit_number' => $unitNumber,
                ],
            );
        }
    }

    public function clearMissingBillingContactNotifications(int $communityId, ?int $unitId = null, ?string $unitNumber = null): void
    {
        if (! Schema::hasTable('app_notifications')) {
            return;
        }

        $query = DB::table('app_notifications')
            ->where('title', 'Unit has no billing contact')
            ->whereNull('read_at');

        if (Schema::hasColumn('app_notifications', 'data') && ($unitId || $unitNumber || $communityId)) {
            $query->where(function ($inner) use ($communityId, $unitId, $unitNumber) {
                if ($unitId) {
                    $inner->orWhere('data', 'like', '%"unit_id":'.$unitId.'%')
                        ->orWhere('data', 'like', '%"unit_id":"'.$unitId.'"%');
                }
                if ($unitNumber) {
                    $inner->orWhere('body', 'like', $unitNumber.'%')
                        ->orWhere('data', 'like', '%"unit_number":"'.$unitNumber.'"%');
                }
                if ($communityId && ! $unitId && ! $unitNumber) {
                    $inner->orWhere('data', 'like', '%"community_id":'.$communityId.'%');
                }
            });
        } elseif ($unitNumber) {
            $query->where('body', 'like', $unitNumber.'%');
        }

        $query->update([
            'read_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Attach user to a unit without removing other active unit associations.
     */
    public function attachUserToUnit(
        int $communityId,
        int $userId,
        int $unitId,
        string $status = self::RESIDENT_ACTIVE,
        ?string $source = null,
    ): int {
        $now = now();
        $existing = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('user_id', $userId)
            ->first();

        $payload = [
            'status' => $status,
            'left_at' => null,
            'rejection_reason' => null,
            'updated_at' => $now,
        ];
        if ($source !== null && Schema::hasColumn('unit_residents', 'source')) {
            $payload['source'] = $source;
        }

        if ($existing) {
            if ($status === self::RESIDENT_ACTIVE) {
                $payload['joined_at'] = $existing->joined_at ?: $now;
            }
            DB::table('unit_residents')->where('id', $existing->id)->update($payload);
            $residentId = (int) $existing->id;
        } else {
            $insert = [
                'unit_id' => $unitId,
                'community_id' => $communityId,
                'user_id' => $userId,
                'status' => $status,
                'joined_at' => $status === self::RESIDENT_ACTIVE ? $now : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            if (Schema::hasColumn('unit_residents', 'source')) {
                $insert['source'] = $source;
            }

            $residentId = (int) DB::table('unit_residents')->insertGetId($insert);
        }

        if (in_array($status, [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING], true)) {
            app(\App\Services\Landlord\LandlordAdvisoryService::class)->syncForResident(
                $communityId,
                $unitId,
                $userId,
                $residentId,
            );
        }

        if ($status === self::RESIDENT_ACTIVE) {
            app(\App\Services\Landlord\LandlordBillingContactService::class)->syncForUnit($unitId);
        }

        return $residentId;
    }

    /** Leave other units, then attach (legacy single-unit move). */
    private function moveUserToUnit(
        int $communityId,
        int $userId,
        int $unitId,
        bool $cancelPendingTransfers = true,
        string $status = self::RESIDENT_ACTIVE,
        ?string $source = null,
    ): void {
        $now = now();
        $current = DB::table('unit_residents')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->whereIn('status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING])
            ->get();

        foreach ($current as $row) {
            if ((int) $row->unit_id === $unitId) {
                continue;
            }

            DB::table('unit_residents')->where('id', $row->id)->update([
                'status' => self::RESIDENT_LEFT,
                'left_at' => $now,
                'updated_at' => $now,
            ]);

            $oldUnit = DB::table('units')->find($row->unit_id);
            $leftUnitId = (int) $row->unit_id;
            if ($oldUnit && (int) ($oldUnit->billing_contact_user_id ?? 0) === $userId) {
                $landlordBilling = app(\App\Services\Landlord\LandlordBillingContactService::class);
                if ($landlordBilling->appliesToUnit($leftUnitId)) {
                    $landlordBilling->syncForUnit($leftUnitId);
                } else {
                    $next = $this->nextEligibleBillingContact($leftUnitId, $communityId);
                    DB::table('units')->where('id', $leftUnitId)->update([
                        'billing_contact_user_id' => $next,
                        'updated_at' => $now,
                    ]);
                }
            } elseif ($oldUnit) {
                app(\App\Services\Landlord\LandlordBillingContactService::class)->syncForUnit($leftUnitId);
            }

            if ($cancelPendingTransfers) {
                app(BillingContactTransferService::class)->cancelPendingForUser($userId, $communityId);
            }
        }

        $this->attachUserToUnit($communityId, $userId, $unitId, $status, $source);
    }

    /** Keep profiles.unit_number as a display hint (first active residential unit). */
    public function syncProfileUnitNumberDisplay(int $userId, int $communityId, ?string $fallbackUnitNumber = null): void
    {
        $first = $this->findActiveUnitForUser($userId, $communityId);
        $unitNumber = $first?->unit_number ?? $fallbackUnitNumber;
        if ($unitNumber === null || trim((string) $unitNumber) === '') {
            return;
        }

        DB::table('profiles')->where('user_id', $userId)->update([
            'unit_number' => $unitNumber,
            'updated_at' => now(),
        ]);
    }

    /**
     * Assign multiple units for admin invite / create (one seat; all units active).
     *
     * @param  list<string>  $unitNumbers
     * @return list<object>
     */
    public function assignUserToMultipleUnitNumbers(
        int $communityId,
        int $userId,
        array $unitNumbers,
        string $source = 'invite',
    ): array {
        $normalizedList = [];
        foreach ($unitNumbers as $raw) {
            $trimmed = trim((string) $raw);
            if ($trimmed === '') {
                continue;
            }
            $key = $this->normalizeUnitNumber($trimmed);
            if ($key === '' || isset($normalizedList[$key])) {
                continue;
            }
            $normalizedList[$key] = $trimmed;
        }

        if ($normalizedList === []) {
            throw ValidationException::withMessages([
                'units' => 'At least one unit is required.',
            ]);
        }

        $assigned = [];
        foreach ($normalizedList as $unitNumber) {
            // Always attach — never leave sibling units mid-loop (that dropped multi-unit rows).
            $assigned[] = $this->assignUserToUnitNumber(
                $communityId,
                $userId,
                $unitNumber,
                false,
                false,
                self::RESIDENT_ACTIVE,
                $source,
                true,
            );
        }

        $this->syncProfileUnitNumberDisplay($userId, $communityId);

        return $assigned;
    }

    public function repairStaffAssignments(int $communityId): void
    {
        $staffIds = $this->staffUserIds($communityId);
        if ($staffIds === []) {
            return;
        }

        $now = now();
        $residentialIds = DB::table('units')
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_RESIDENTIAL)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($residentialIds !== []) {
            DB::table('unit_residents')
                ->whereIn('unit_id', $residentialIds)
                ->whereIn('user_id', $staffIds)
                ->where('status', self::RESIDENT_ACTIVE)
                ->update([
                    'status' => self::RESIDENT_LEFT,
                    'left_at' => $now,
                    'updated_at' => $now,
                ]);

            DB::table('units')
                ->whereIn('id', $residentialIds)
                ->whereIn('billing_contact_user_id', $staffIds)
                ->update([
                    'billing_contact_user_id' => null,
                    'updated_at' => $now,
                ]);

            foreach ($residentialIds as $unitId) {
                $unit = DB::table('units')->find($unitId);
                if ($unit && empty($unit->billing_contact_user_id)) {
                    DB::table('units')->where('id', $unitId)->update([
                        'billing_contact_user_id' => $this->nextEligibleBillingContact($unitId, $communityId),
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        foreach ($staffIds as $staffId) {
            $user = User::query()->find($staffId);
            if ($user) {
                $this->assignUserToUnitNumber($communityId, $staffId, 'Office', true);
            }
        }
    }

    private function residentMembersQuery(int $unitId)
    {
        return DB::table('unit_residents as ur')
            ->join('users', 'users.id', '=', 'ur.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('community_memberships as cm', function ($join) {
                $join->on('cm.user_id', '=', 'ur.user_id')
                    ->on('cm.community_id', '=', 'ur.community_id');
            })
            ->where('ur.unit_id', $unitId)
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->where('users.role', 'resident')
            ->where(function ($query) {
                $query->whereNull('cm.role')->orWhere('cm.role', 'member');
            })
            ->select('users.id', 'users.name', 'users.email', 'profiles.display_name', 'ur.joined_at');
    }

    private function isStaffMembership(?object $membership, ?User $user = null): bool
    {
        if ($membership && in_array((string) $membership->role, ['admin', 'moderator'], true)) {
            return true;
        }

        return $user && (AdminRoleService::isCommunityAdminRole($user) || AdminRoleService::isSystemAdmin($user));
    }

    private function isEligibleBillingContact(int $communityId, int $userId): bool
    {
        $user = User::query()->find($userId);
        if (! $user || ($user->role ?? '') !== 'resident' || ($user->status ?? '') === 'deleted') {
            return false;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->first();

        return $membership && ($membership->role ?? 'member') === 'member';
    }

    private function nextEligibleBillingContact(int $unitId, int $communityId): ?int
    {
        $candidates = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('status', self::RESIDENT_ACTIVE)
            ->orderBy('joined_at')
            ->pluck('user_id');

        foreach ($candidates as $candidateId) {
            if ($this->isEligibleBillingContact($communityId, (int) $candidateId)) {
                return (int) $candidateId;
            }
        }

        return null;
    }

    /** @return list<int> */
    private function staffUserIds(int $communityId): array
    {
        return DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->where(function ($query) {
                $query->whereIn('cm.role', ['admin', 'moderator'])
                    ->orWhereIn('users.role', ['community_admin', 'system_admin', 'admin']);
            })
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Units copied from another community (same number, no invite/package source)
     * must not stay associated here — they belong to the other home.
     */
    public function pruneUnitsCopiedFromOtherCommunities(int $userId, int $communityId): void
    {
        if ($userId < 1 || $communityId < 1) {
            return;
        }

        $hasCopiedNumber = DB::table('unit_residents as ur')
            ->join('units as here', 'here.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', $communityId)
            ->whereIn('ur.status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING])
            ->whereExists(function ($sub) use ($userId, $communityId) {
                $sub->selectRaw('1')
                    ->from('unit_residents as other')
                    ->join('units as there', 'there.id', '=', 'other.unit_id')
                    ->whereColumn('there.unit_number_normalized', 'here.unit_number_normalized')
                    ->where('other.user_id', $userId)
                    ->where('other.community_id', '!=', $communityId)
                    ->whereIn('other.status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING]);
            })
            ->exists();

        if (! $hasCopiedNumber) {
            return;
        }

        $foreignKeys = [];
        $foreignRows = DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', '!=', $communityId)
            ->whereIn('ur.status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING])
            ->get(['units.unit_number', 'units.unit_number_normalized']);

        foreach ($foreignRows as $row) {
            $key = $this->normalizeUnitNumber((string) ($row->unit_number_normalized ?: $row->unit_number));
            if ($key !== '') {
                $foreignKeys[$key] = true;
            }
        }

        if ($foreignKeys === []) {
            return;
        }

        $protected = $this->protectedUnitNumbersInCommunity($userId, $communityId);
        $now = now();

        foreach ($this->findUnitAssociationsForUser($userId, $communityId) as $unit) {
            $status = (string) ($unit->unit_resident_status ?? '');
            if (! in_array($status, [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING], true)) {
                continue;
            }

            $key = $this->normalizeUnitNumber((string) ($unit->unit_number_normalized ?? $unit->unit_number ?? ''));
            if ($key === '' || ! isset($foreignKeys[$key]) || isset($protected[$key])) {
                continue;
            }

            $source = (string) ($unit->unit_resident_source ?? '');
            if (in_array($source, ['package', 'addon', 'invite'], true)) {
                continue;
            }

            $residentId = isset($unit->unit_resident_id) ? (int) $unit->unit_resident_id : 0;
            $unitId = (int) ($unit->id ?? 0);
            if ($residentId > 0) {
                DB::table('unit_residents')->where('id', $residentId)->update([
                    'status' => self::RESIDENT_LEFT,
                    'left_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            if ($unitId > 0) {
                $landlordBilling = app(\App\Services\Landlord\LandlordBillingContactService::class);
                if ($landlordBilling->appliesToUnit($unitId)) {
                    $landlordBilling->syncForUnit($unitId);
                } elseif ((int) ($unit->billing_contact_user_id ?? 0) === $userId) {
                    $next = $this->nextEligibleBillingContact($unitId, $communityId);
                    DB::table('units')->where('id', $unitId)->update([
                        'billing_contact_user_id' => $next,
                        'updated_at' => $now,
                    ]);
                }
            }

            if ($unitId > 0) {
                try {
                    $this->deleteUnit($communityId, $unitId);
                } catch (\Throwable) {
                    // Keep the catalog row when it still has residents or cannot be removed.
                }
            }
        }
    }

    public function pruneCopiedUnitsForCommunity(int $communityId): void
    {
        if ($communityId < 1) {
            return;
        }

        $userIds = DB::table('unit_residents')
            ->where('community_id', $communityId)
            ->whereIn('status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING])
            ->distinct()
            ->pluck('user_id');

        foreach ($userIds as $userId) {
            $this->pruneUnitsCopiedFromOtherCommunities((int) $userId, $communityId);
        }
    }

    private function userHasUnitsInOtherCommunity(int $userId, int $communityId): bool
    {
        return DB::table('unit_residents')
            ->where('user_id', $userId)
            ->where('community_id', '!=', $communityId)
            ->whereIn('status', [self::RESIDENT_ACTIVE, self::RESIDENT_PENDING])
            ->exists();
    }

    private function userHasOtherCommunityMembership(int $userId, int $communityId): bool
    {
        return DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', '!=', $communityId)
            ->whereIn('status', ['approved', 'pending'])
            ->exists();
    }

    private function userHasPackageOrInviteUnitsInCommunity(int $userId, int $communityId): bool
    {
        if (Schema::hasTable('unit_registration_packages')
            && DB::table('unit_registration_packages')
                ->where('user_id', $userId)
                ->where('community_id', $communityId)
                ->whereIn('status', ['pending', 'approved'])
                ->exists()) {
            return true;
        }

        if (Schema::hasTable('invite_unit_assignments')
            && DB::table('invite_unit_assignments')
                ->where('user_id', $userId)
                ->where('community_id', $communityId)
                ->exists()) {
            return true;
        }

        return false;
    }

    /** @return array<string, true> */
    private function protectedUnitNumbersInCommunity(int $userId, int $communityId): array
    {
        $out = [];

        if (Schema::hasTable('unit_registration_package_items')) {
            $numbers = DB::table('unit_registration_package_items as items')
                ->join('unit_registration_packages as packages', 'packages.id', '=', 'items.package_id')
                ->where('packages.user_id', $userId)
                ->where('packages.community_id', $communityId)
                ->pluck('items.unit_number_normalized');
            foreach ($numbers as $number) {
                $key = $this->normalizeUnitNumber((string) $number);
                if ($key !== '') {
                    $out[$key] = true;
                }
            }
        }

        if (Schema::hasTable('invite_unit_assignments')) {
            $numbers = DB::table('invite_unit_assignments')
                ->where('user_id', $userId)
                ->where('community_id', $communityId)
                ->pluck('unit_number_normalized');
            foreach ($numbers as $number) {
                $key = $this->normalizeUnitNumber((string) $number);
                if ($key !== '') {
                    $out[$key] = true;
                }
            }
        }

        return $out;
    }

    private function approvedCommunityId(int $userId): ?int
    {
        $user = \App\Models\User::query()
            ->select('id', 'active_context_community_id', 'role', 'active_context')
            ->find($userId);

        return \App\Services\UserActingContextService::currentCommunityId($user);
    }

    private function throwDuplicateUnitNumber(): never
    {
        throw ValidationException::withMessages([
            'unit_number' => self::DUPLICATE_UNIT_MESSAGE,
        ]);
    }
}
