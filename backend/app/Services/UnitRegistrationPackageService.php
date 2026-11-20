<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Self-signup initial packages + add-on unit requests (admin approve/reject).
 * Admin-invited initial units do NOT use this queue.
 */
class UnitRegistrationPackageService
{
    public const KIND_INITIAL = 'initial';

    public const KIND_ADDON = 'addon';

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public function __construct(
        private UnitAssignmentService $units,
    ) {}

    public function hasPendingInitialPackage(int $userId, int $communityId): bool
    {
        return DB::table('unit_registration_packages')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_INITIAL)
            ->where('status', self::STATUS_PENDING)
            ->exists();
    }

    /**
     * When an admin approves membership, also clear any pending initial unit package
     * so mobile is not stuck on the pending-approval screen.
     *
     * @return int Number of packages approved
     */
    public function approvePendingInitialPackagesForUser(int $userId, int $communityId, int $reviewerId): int
    {
        $ids = DB::table('unit_registration_packages')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_INITIAL)
            ->where('status', self::STATUS_PENDING)
            ->pluck('id');

        $count = 0;
        foreach ($ids as $packageId) {
            $this->approvePackage((int) $packageId, $reviewerId);
            $count++;
        }

        return $count;
    }

    /**
     * Rejecting the resident request also closes the initial unit package.
     * The membership rejection already tells the resident, so this stays quiet.
     */
    public function rejectPendingInitialPackagesForUser(int $userId, int $communityId, int $reviewerId, string $reason): int
    {
        $ids = DB::table('unit_registration_packages')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('kind', self::KIND_INITIAL)
            ->where('status', self::STATUS_PENDING)
            ->pluck('id');

        $count = 0;
        foreach ($ids as $packageId) {
            $this->rejectPackage((int) $packageId, $reviewerId, $reason, false);
            $count++;
        }

        return $count;
    }

    public function hasApprovedInitialOrActiveUnit(int $userId, int $communityId): bool
    {
        return in_array($communityId, $this->communityIdsWithApprovedInitialOrActiveUnit($userId, [$communityId]), true);
    }

    /**
     * Communities where this resident already has an active residential unit
     * or an approved initial registration. One lookup for the whole switch list.
     *
     * @param  list<int>  $communityIds
     * @return list<int>
     */
    public function communityIdsWithApprovedInitialOrActiveUnit(int $userId, array $communityIds): array
    {
        $communityIds = array_values(array_unique(array_filter(
            array_map(static fn ($id) => (int) $id, $communityIds),
            static fn (int $id) => $id > 0,
        )));

        if ($userId < 1 || $communityIds === []) {
            return [];
        }

        $fromUnits = DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->whereIn('ur.community_id', $communityIds)
            ->where('ur.status', UnitAssignmentService::RESIDENT_ACTIVE)
            ->where('units.kind', UnitAssignmentService::KIND_RESIDENTIAL)
            ->distinct()
            ->pluck('ur.community_id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        $remaining = array_values(array_diff($communityIds, $fromUnits));
        if ($remaining === []) {
            return $fromUnits;
        }

        $fromPackages = DB::table('unit_registration_packages')
            ->where('user_id', $userId)
            ->whereIn('community_id', $remaining)
            ->where('kind', self::KIND_INITIAL)
            ->where('status', self::STATUS_APPROVED)
            ->distinct()
            ->pluck('community_id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        return array_values(array_unique(array_merge($fromUnits, $fromPackages)));
    }

    /**
     * Full app access for self-signup requires approved initial package (or admin-assigned active unit).
     */
    public function residentHasFullUnitAccess(int $userId, int $communityId): bool
    {
        if ($this->units->activeUnitCountForUser($userId, $communityId) > 0) {
            // Admin-invited / already approved units unlock the app.
            if ($this->hasPendingInitialPackage($userId, $communityId)) {
                return false;
            }

            return true;
        }

        return false;
    }

    /**
     * @param  list<array{
     *   unit_number: string,
     *   is_new_unit?: bool,
     *   residence_type?: string|null,
     *   utility_bill_url?: string|null,
     *   ownership_proof_url?: string|null,
     *   tenancy_proof_url?: string|null
     * }>  $items
     */
    public function submitPackage(
        int $userId,
        int $communityId,
        string $kind,
        array $items,
    ): object {
        if (! in_array($kind, [self::KIND_INITIAL, self::KIND_ADDON], true)) {
            throw ValidationException::withMessages(['kind' => 'Invalid package kind.']);
        }

        if ($items === []) {
            throw ValidationException::withMessages(['units' => 'Add at least one unit.']);
        }

        if ($kind === self::KIND_ADDON && ! $this->residentHasFullUnitAccess($userId, $communityId)) {
            throw ValidationException::withMessages([
                'units' => 'Complete your initial unit approval before requesting additional units.',
            ]);
        }

        if ($kind === self::KIND_INITIAL && $this->hasPendingInitialPackage($userId, $communityId)) {
            throw ValidationException::withMessages([
                'units' => 'You already have a unit registration pending admin review.',
            ]);
        }

        $package = DB::transaction(function () use ($userId, $communityId, $kind, $items) {
            // Rejected initial packages: allow resubmit by creating a new package.
            $packageId = DB::table('unit_registration_packages')->insertGetId([
                'community_id' => $communityId,
                'user_id' => $userId,
                'kind' => $kind,
                'status' => self::STATUS_PENDING,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($items as $index => $raw) {
                $unitNumber = trim((string) ($raw['unit_number'] ?? ''));
                if ($unitNumber === '') {
                    throw ValidationException::withMessages([
                        "units.{$index}.unit_number" => 'Unit number is required.',
                    ]);
                }

                $normalized = $this->units->normalizeUnitNumber($unitNumber);
                $isNew = (bool) ($raw['is_new_unit'] ?? false);
                $existing = $this->units->findUnitByNormalizedNumber($communityId, $normalized);
                if ($existing && $isNew) {
                    throw ValidationException::withMessages([
                        "units.{$index}.unit_number" => UnitAssignmentService::DUPLICATE_UNIT_MESSAGE,
                    ]);
                }
                if (! $existing && ! $isNew) {
                    // Treat as new unit create request.
                    $isNew = true;
                }

                $residenceType = isset($raw['residence_type']) ? trim((string) $raw['residence_type']) : null;
                if ($residenceType !== null && $residenceType !== '' && ! in_array($residenceType, ['homeowner', 'tenant'], true)) {
                    throw ValidationException::withMessages([
                        "units.{$index}.residence_type" => 'Residence type must be homeowner or tenant.',
                    ]);
                }

                $itemId = DB::table('unit_registration_package_items')->insertGetId([
                    'package_id' => $packageId,
                    'unit_id' => $existing?->id,
                    'unit_number' => $unitNumber,
                    'unit_number_normalized' => $normalized,
                    'is_new_unit' => $isNew,
                    'residence_type' => $residenceType ?: null,
                    'status' => self::STATUS_PENDING,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->storeProofsForItem(
                    $communityId,
                    $userId,
                    $itemId,
                    $existing?->id,
                    $residenceType,
                    $raw,
                    $index,
                );

                // Pending association so My units can show the request.
                $unitId = $existing?->id;
                if (! $unitId && $isNew) {
                    $created = $this->units->createUnit($communityId, $unitNumber);
                    $unitId = (int) $created->id;
                    DB::table('unit_registration_package_items')->where('id', $itemId)->update([
                        'unit_id' => $unitId,
                        'updated_at' => now(),
                    ]);
                }

                if ($unitId) {
                    $residentId = $this->units->attachUserToUnit(
                        $communityId,
                        $userId,
                        (int) $unitId,
                        UnitAssignmentService::RESIDENT_PENDING,
                        $kind === self::KIND_INITIAL ? 'package' : 'addon',
                    );
                    DB::table('unit_registration_package_items')->where('id', $itemId)->update([
                        'unit_resident_id' => $residentId,
                        'updated_at' => now(),
                    ]);
                    DB::table('unit_proof_documents')
                        ->where('package_item_id', $itemId)
                        ->update(['unit_id' => $unitId, 'updated_at' => now()]);
                }
            }

            return DB::table('unit_registration_packages')->find($packageId);
        });

        $this->notifyAdminsOfPackageRequest($package);

        return $package;
    }

    public function approvePackage(int $packageId, int $reviewerId): object
    {
        $package = DB::table('unit_registration_packages')->find($packageId);
        abort_if(! $package, 404, 'Registration package not found.');
        if ($package->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages(['status' => 'This package was already reviewed.']);
        }

        $fresh = DB::transaction(function () use ($package, $reviewerId) {
            $items = DB::table('unit_registration_package_items')
                ->where('package_id', $package->id)
                ->get();

            foreach ($items as $item) {
                $unitId = (int) ($item->unit_id ?? 0);
                if ($unitId < 1) {
                    $existing = $this->units->findUnitByNormalizedNumber(
                        (int) $package->community_id,
                        (string) $item->unit_number_normalized,
                    );
                    if ($existing) {
                        $unitId = (int) $existing->id;
                    } else {
                        $created = $this->units->createUnit((int) $package->community_id, (string) $item->unit_number);
                        $unitId = (int) $created->id;
                    }
                }

                $this->units->attachUserToUnit(
                    (int) $package->community_id,
                    (int) $package->user_id,
                    $unitId,
                    UnitAssignmentService::RESIDENT_ACTIVE,
                    $package->kind === self::KIND_INITIAL ? 'package' : 'addon',
                );

                // New unit → requester becomes billing contact. Existing unit → contact unchanged.
                if ($item->is_new_unit) {
                    $unitRow = DB::table('units')->where('id', $unitId)->lockForUpdate()->first();
                    if ($unitRow && empty($unitRow->billing_contact_user_id)) {
                        DB::table('units')->where('id', $unitId)->update([
                            'billing_contact_user_id' => $package->user_id,
                            'updated_at' => now(),
                        ]);
                    }
                }

                DB::table('unit_registration_package_items')->where('id', $item->id)->update([
                    'unit_id' => $unitId,
                    'status' => self::STATUS_APPROVED,
                    'updated_at' => now(),
                ]);

                DB::table('unit_proof_documents')
                    ->where('package_item_id', $item->id)
                    ->update([
                        'unit_id' => $unitId,
                        'review_status' => self::STATUS_APPROVED,
                        'updated_at' => now(),
                    ]);
            }

            DB::table('unit_registration_packages')->where('id', $package->id)->update([
                'status' => self::STATUS_APPROVED,
                'reviewed_by' => $reviewerId,
                'reviewed_at' => now(),
                'rejection_reason' => null,
                'updated_at' => now(),
            ]);

            if ($package->kind === self::KIND_INITIAL) {
                DB::table('community_memberships')
                    ->where('user_id', $package->user_id)
                    ->where('community_id', $package->community_id)
                    ->where('status', 'pending')
                    ->update([
                        'status' => 'approved',
                        'rejection_reason' => null,
                        'rejected_by' => null,
                        'updated_at' => now(),
                    ]);
            }

            $this->units->syncProfileUnitNumberDisplay((int) $package->user_id, (int) $package->community_id);

            return DB::table('unit_registration_packages')->find($package->id);
        });

        $this->notifyResidentOfPackageDecision($fresh, self::STATUS_APPROVED);

        return $fresh;
    }

    public function rejectPackage(int $packageId, int $reviewerId, string $reason, bool $notifyResident = true): object
    {
        $package = DB::table('unit_registration_packages')->find($packageId);
        abort_if(! $package, 404, 'Registration package not found.');
        if ($package->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages(['status' => 'This package was already reviewed.']);
        }

        $reason = trim($reason);
        if ($reason === '') {
            throw ValidationException::withMessages(['reason' => 'A rejection reason is required.']);
        }

        $fresh = DB::transaction(function () use ($package, $reviewerId, $reason) {
            $items = DB::table('unit_registration_package_items')
                ->where('package_id', $package->id)
                ->get();

            foreach ($items as $item) {
                if ($item->unit_resident_id) {
                    DB::table('unit_residents')->where('id', $item->unit_resident_id)->update([
                        'status' => UnitAssignmentService::RESIDENT_REJECTED,
                        'rejection_reason' => $reason,
                        'updated_at' => now(),
                    ]);
                } elseif ($item->unit_id) {
                    DB::table('unit_residents')
                        ->where('unit_id', $item->unit_id)
                        ->where('user_id', $package->user_id)
                        ->where('status', UnitAssignmentService::RESIDENT_PENDING)
                        ->update([
                            'status' => UnitAssignmentService::RESIDENT_REJECTED,
                            'rejection_reason' => $reason,
                            'updated_at' => now(),
                        ]);
                }

                DB::table('unit_registration_package_items')->where('id', $item->id)->update([
                    'status' => self::STATUS_REJECTED,
                    'updated_at' => now(),
                ]);
            }

            DB::table('unit_registration_packages')->where('id', $package->id)->update([
                'status' => self::STATUS_REJECTED,
                'rejection_reason' => $reason,
                'reviewed_by' => $reviewerId,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

            return DB::table('unit_registration_packages')->find($package->id);
        });

        if ($notifyResident) {
            $this->notifyResidentOfPackageDecision($fresh, self::STATUS_REJECTED, $reason);
        }

        return $fresh;
    }

    /** @return list<object> */
    public function listPackagesForCommunity(int $communityId, ?string $status = null, ?string $kind = null): array
    {
        $query = DB::table('unit_registration_packages as p')
            ->join('users', 'users.id', '=', 'p.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('p.community_id', $communityId)
            ->orderByDesc('p.created_at')
            ->select(
                'p.*',
                'users.name',
                'users.email',
                'profiles.display_name',
            );

        if ($status) {
            $query->where('p.status', $status);
        }
        if ($kind) {
            $query->where('p.kind', $kind);
        }

        // Initial signup units are reviewed with the resident request.
        $query->where(function ($outer) {
            $outer->where('p.kind', '!=', self::KIND_INITIAL)
                ->orWhere('p.status', '!=', self::STATUS_PENDING)
                ->orWhereNotExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('community_memberships as cm')
                        ->whereColumn('cm.user_id', 'p.user_id')
                        ->whereColumn('cm.community_id', 'p.community_id')
                        ->where('cm.status', 'pending');
                });
        });

        return $query->get()->map(fn ($row) => $this->formatPackage($row))->all();
    }

    public function formatPackage(object $package): array
    {
        $items = DB::table('unit_registration_package_items')
            ->where('package_id', $package->id)
            ->orderBy('id')
            ->get()
            ->map(function ($item) {
                $proofs = DB::table('unit_proof_documents')
                    ->where('package_item_id', $item->id)
                    ->get()
                    ->map(fn ($p) => [
                        'id' => (int) $p->id,
                        'kind' => $p->kind,
                        'file_url' => $p->file_url,
                        'review_status' => $p->review_status,
                    ])
                    ->all();

                return [
                    'id' => (int) $item->id,
                    'unit_id' => $item->unit_id ? (int) $item->unit_id : null,
                    'unit_number' => $item->unit_number,
                    'is_new_unit' => (bool) $item->is_new_unit,
                    'residence_type' => $item->residence_type,
                    'status' => $item->status,
                    'proofs' => $proofs,
                ];
            })
            ->all();

        return [
            'id' => (int) $package->id,
            'community_id' => (int) $package->community_id,
            'user_id' => (int) $package->user_id,
            'kind' => $package->kind,
            'status' => $package->status,
            'rejection_reason' => $package->rejection_reason,
            'reviewed_at' => $package->reviewed_at,
            'created_at' => $package->created_at,
            'resident_name' => $package->display_name ?? $package->name ?? null,
            'resident_email' => $package->email ?? null,
            'units' => $items,
            'unit_count' => count($items),
        ];
    }

    /**
     * Admin-invited onboarding: assign invite units as active and store per-unit proofs.
     * Extra units the resident adds themselves go to the addon queue (pending admin review).
     * Access is granted through the admin-assigned unit without waiting on extras.
     *
     * @param  list<array{
     *   unit_number: string,
     *   is_new_unit?: bool,
     *   residence_type?: string|null,
     *   utility_bill_url?: string|null,
     *   ownership_proof_url?: string|null,
     *   tenancy_proof_url?: string|null
     * }>  $items
     * @return list<object>
     */
    public function completeInvitedOnboarding(int $userId, int $communityId, array $items): array
    {
        if ($items === []) {
            throw ValidationException::withMessages(['units' => 'Add at least one unit.']);
        }

        $inviteNumbers = $this->units->listInviteUnitNumbers($communityId, $userId);
        $expected = [];
        foreach ($inviteNumbers as $number) {
            $expected[$this->units->normalizeUnitNumber($number)] = $number;
        }

        // Legacy first-home invites without invite rows: treat the first submitted unit as assigned.
        if ($expected === []) {
            $first = trim((string) ($items[0]['unit_number'] ?? ''));
            if ($first !== '') {
                $expected[$this->units->normalizeUnitNumber($first)] = $first;
            }
        }

        if ($expected === []) {
            throw ValidationException::withMessages(['units' => 'No invited units found for this resident.']);
        }

        $submitted = [];
        $extraItems = [];
        foreach ($items as $index => $raw) {
            $unitNumber = trim((string) ($raw['unit_number'] ?? ''));
            $key = $this->units->normalizeUnitNumber($unitNumber);
            if ($key === '') {
                throw ValidationException::withMessages([
                    "units.{$index}.unit_number" => 'Unit number is required.',
                ]);
            }
            if (isset($expected[$key])) {
                $submitted[$key] = $raw;
                continue;
            }
            $extraItems[] = $raw;
        }

        foreach ($expected as $key => $displayNumber) {
            if (! isset($submitted[$key])) {
                throw ValidationException::withMessages([
                    'units' => "Proof is required for unit {$displayNumber}.",
                ]);
            }
        }

        $assigned = DB::transaction(function () use ($userId, $communityId, $expected, $submitted) {
            $assigned = $this->units->assignUserToMultipleUnitNumbers(
                $communityId,
                $userId,
                array_values($expected),
                'invite',
            );

            $byNormalized = [];
            foreach ($assigned as $unit) {
                $byNormalized[$this->units->normalizeUnitNumber((string) $unit->unit_number)] = $unit;
            }

            $index = 0;
            foreach ($expected as $key => $displayNumber) {
                $raw = $submitted[$key];
                $unit = $byNormalized[$key] ?? null;
                $unitId = $unit ? (int) $unit->id : null;
                $residenceType = isset($raw['residence_type']) ? trim((string) $raw['residence_type']) : null;

                // Invited proofs are completion requirements (auto-accepted for access).
                $this->storeDirectProofs(
                    $communityId,
                    $userId,
                    $unitId,
                    $residenceType,
                    $raw,
                    $index,
                    self::STATUS_APPROVED,
                );
                $index++;
            }

            return $assigned;
        });

        if ($extraItems !== []) {
            $this->submitPackage($userId, $communityId, self::KIND_ADDON, $extraItems);
        }

        MembershipService::approvePendingInviteForCommunity($userId, $communityId);

        return $assigned;
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function storeDirectProofs(
        int $communityId,
        int $userId,
        ?int $unitId,
        ?string $residenceType,
        array $raw,
        int $index,
        string $reviewStatus = self::STATUS_PENDING,
    ): void {
        $utility = trim((string) ($raw['utility_bill_url'] ?? ''));
        if ($utility === '') {
            throw ValidationException::withMessages([
                "units.{$index}.utility_bill_url" => 'Utility bill proof is required for each unit.',
            ]);
        }
        $this->insertProof($communityId, $userId, $unitId, null, 'utility_bill', $utility, $reviewStatus);

        $roleProof = $residenceType === 'tenant'
            ? trim((string) ($raw['tenancy_proof_url'] ?? ''))
            : trim((string) ($raw['ownership_proof_url'] ?? $raw['tenancy_proof_url'] ?? ''));

        if ($roleProof !== '') {
            $kind = $residenceType === 'tenant' ? 'tenancy_proof' : 'ownership_proof';
            $this->insertProof($communityId, $userId, $unitId, null, $kind, $roleProof, $reviewStatus);
        }
    }

    private function storeProofsForItem(
        int $communityId,
        int $userId,
        int $itemId,
        ?int $unitId,
        ?string $residenceType,
        array $raw,
        int $index,
    ): void {
        $utility = trim((string) ($raw['utility_bill_url'] ?? ''));
        if ($utility === '') {
            throw ValidationException::withMessages([
                "units.{$index}.utility_bill_url" => 'Utility bill proof is required for each unit.',
            ]);
        }

        $this->insertProof($communityId, $userId, $unitId, $itemId, 'utility_bill', $utility);

        $roleProof = $residenceType === 'tenant'
            ? trim((string) ($raw['tenancy_proof_url'] ?? ''))
            : trim((string) ($raw['ownership_proof_url'] ?? $raw['tenancy_proof_url'] ?? ''));

        if ($roleProof !== '') {
            $kind = $residenceType === 'tenant' ? 'tenancy_proof' : 'ownership_proof';
            $this->insertProof($communityId, $userId, $unitId, $itemId, $kind, $roleProof);
        }
    }

    private function insertProof(
        int $communityId,
        int $userId,
        ?int $unitId,
        ?int $itemId,
        string $kind,
        string $fileUrl,
        string $reviewStatus = self::STATUS_PENDING,
    ): void {
        DB::table('unit_proof_documents')->insert([
            'community_id' => $communityId,
            'user_id' => $userId,
            'unit_id' => $unitId,
            'package_item_id' => $itemId,
            'kind' => $kind,
            'file_url' => $fileUrl,
            'review_status' => $reviewStatus,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function notifyAdminsOfPackageRequest(?object $package): void
    {
        if (! $package || ($package->kind ?? '') !== self::KIND_ADDON) {
            return;
        }

        try {
            $communityId = (int) $package->community_id;
            $userId = (int) $package->user_id;
            $unitLabel = $this->packageUnitLabel((int) $package->id);
            $residentName = DB::table('profiles')->where('user_id', $userId)->value('display_name')
                ?: DB::table('users')->where('id', $userId)->value('name')
                ?: 'A resident';

            $title = 'Additional unit request';
            $body = "{$residentName} requested unit {$unitLabel}. Review in Unit Requests.";

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
                    '/admin/unit-requests',
                    [
                        'kind' => 'unit_registration_request',
                        'package_id' => (int) $package->id,
                        'package_kind' => $package->kind,
                        'community_id' => $communityId,
                    ],
                    $communityId,
                );
            }
        } catch (\Throwable $e) {
            Log::warning('Unit registration admin notify failed', [
                'package_id' => $package->id ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function notifyResidentOfPackageDecision(?object $package, string $decision, ?string $reason = null): void
    {
        if (! $package) {
            return;
        }

        try {
            $userId = (int) $package->user_id;
            $communityId = (int) $package->community_id;
            $unitLabel = $this->packageUnitLabel((int) $package->id);
            $isAddon = ($package->kind ?? '') === self::KIND_ADDON;

            if ($decision === self::STATUS_APPROVED) {
                NotificationService::send(
                    $userId,
                    'success',
                    $isAddon ? 'Unit request approved' : 'Unit registration approved',
                    $isAddon
                        ? "Unit {$unitLabel} is now active on your account."
                        : "Your unit registration for {$unitLabel} was approved. Welcome!",
                    '/screens/my-units',
                    [
                        'kind' => 'unit_registration_approved',
                        'package_id' => (int) $package->id,
                        'community_id' => $communityId,
                    ],
                    $communityId,
                );

                return;
            }

            $body = $isAddon
                ? "Your request for unit {$unitLabel} was rejected."
                : "Your unit registration for {$unitLabel} was rejected.";
            if ($reason !== null && trim($reason) !== '') {
                $body .= ' Reason: '.trim($reason);
            }

            NotificationService::send(
                $userId,
                'warning',
                $isAddon ? 'Unit request rejected' : 'Unit registration rejected',
                $body,
                '/screens/my-units',
                [
                    'kind' => 'unit_registration_rejected',
                    'package_id' => (int) $package->id,
                    'community_id' => $communityId,
                ],
                $communityId,
            );
        } catch (\Throwable $e) {
            Log::warning('Unit registration resident notify failed', [
                'package_id' => $package->id ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function packageUnitLabel(int $packageId): string
    {
        $numbers = DB::table('unit_registration_package_items')
            ->where('package_id', $packageId)
            ->orderBy('id')
            ->pluck('unit_number')
            ->map(fn ($n) => trim((string) $n))
            ->filter()
            ->values()
            ->all();

        if ($numbers === []) {
            return 'requested unit(s)';
        }

        if (count($numbers) === 1) {
            return (string) $numbers[0];
        }

        return implode(', ', $numbers);
    }
}
