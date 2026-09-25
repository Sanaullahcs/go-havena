<?php

namespace App\Services;

use App\Models\User;
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

    public const RESIDENT_LEFT = 'left';

    public const PLACEHOLDER_UNITS = ['office', 'management office'];

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
        return DB::table('unit_residents as ur')
            ->join('units', 'units.id', '=', 'ur.unit_id')
            ->where('ur.user_id', $userId)
            ->where('ur.community_id', $communityId)
            ->where('ur.status', self::RESIDENT_ACTIVE)
            ->select('units.*', 'ur.id as unit_resident_id')
            ->first();
    }

    /** @return array<string, mixed>|null */
    public function userUnitBrief(User $user, ?int $communityId = null): ?array
    {
        $communityId = $communityId ?: $this->approvedCommunityId((int) $user->id);
        if (! $communityId) {
            return null;
        }

        $unit = $this->findActiveUnitForUser((int) $user->id, $communityId);
        if (! $unit) {
            return null;
        }

        $unit = $this->refreshBillingContactIfStale((int) $unit->id) ?? $unit;

        return $this->formatUnit($unit, (int) $user->id);
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

        $unitNumber = trim((string) ($user->profile?->unit_number ?? ''));
        if ($unitNumber === '') {
            return $this->findActiveUnitForUser((int) $user->id, $communityId);
        }

        return $this->assignUserToUnitNumber($communityId, (int) $user->id, $unitNumber, false);
    }

    public function assignUserToUnitNumber(int $communityId, int $userId, string $unitNumber, bool $isAdmin = false): object
    {
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

        return DB::transaction(function () use ($communityId, $userId, $unitNumber, $normalized, $kind, $isAdmin) {
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

            $this->moveUserToUnit($communityId, $userId, (int) $unit->id);

            $unit = DB::table('units')->lockForUpdate()->find($unit->id);
            if (
                $unit
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

            DB::table('profiles')->where('user_id', $userId)->update([
                'unit_number' => $unit->unit_number,
                'updated_at' => $now,
            ]);

            return $unit;
        });
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
        $existing = DB::table('units')
            ->where('community_id', $communityId)
            ->where('unit_number_normalized', $normalized)
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'unit_number' => 'This unit already exists in the community.',
            ]);
        }

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

        return DB::table('units')->find($id);
    }

    public function updateUnit(int $communityId, int $unitId, array $data): object
    {
        $unit = DB::table('units')->where('id', $unitId)->where('community_id', $communityId)->first();
        abort_if(! $unit, 404, 'Unit not found.');

        $updates = ['updated_at' => now()];

        if (isset($data['unit_number'])) {
            $unitNumber = trim((string) $data['unit_number']);
            $normalized = $this->normalizeUnitNumber($unitNumber);
            $duplicate = DB::table('units')
                ->where('community_id', $communityId)
                ->where('unit_number_normalized', $normalized)
                ->where('id', '!=', $unitId)
                ->exists();
            if ($duplicate) {
                throw ValidationException::withMessages([
                    'unit_number' => 'This unit already exists in the community.',
                ]);
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
        $unit = $this->findActiveUnitForUser($userId, $communityId);
        if (! $unit) {
            return false;
        }

        $effectiveId = $this->resolveEffectiveBillingContactId($unit);

        return $effectiveId !== null && $effectiveId === $userId;
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

    /** @return list<array{user_id: int, unit_id: int, unit_number: string}> */
    public function billingContactsForCommunity(int $communityId): array
    {
        $seen = [];
        $contacts = [];
        foreach ($this->eligibleResidentialUnits($communityId) as $unit) {
            $userId = (int) ($unit->billing_contact_user_id ?? 0);
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

    private function moveUserToUnit(int $communityId, int $userId, int $unitId, bool $cancelPendingTransfers = true): void
    {
        $now = now();
        $current = DB::table('unit_residents')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('status', self::RESIDENT_ACTIVE)
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
            if ($oldUnit && (int) ($oldUnit->billing_contact_user_id ?? 0) === $userId) {
                $next = $this->nextEligibleBillingContact((int) $row->unit_id, $communityId);
                DB::table('units')->where('id', $row->unit_id)->update([
                    'billing_contact_user_id' => $next,
                    'updated_at' => $now,
                ]);
            }

            if ($cancelPendingTransfers) {
                app(BillingContactTransferService::class)->cancelPendingForUser($userId, $communityId);
            }
        }

        $existing = DB::table('unit_residents')
            ->where('unit_id', $unitId)
            ->where('user_id', $userId)
            ->first();

        if ($existing) {
            DB::table('unit_residents')->where('id', $existing->id)->update([
                'status' => self::RESIDENT_ACTIVE,
                'joined_at' => $existing->joined_at ?: $now,
                'left_at' => null,
                'updated_at' => $now,
            ]);

            return;
        }

        DB::table('unit_residents')->insert([
            'unit_id' => $unitId,
            'community_id' => $communityId,
            'user_id' => $userId,
            'status' => self::RESIDENT_ACTIVE,
            'joined_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
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

    private function approvedCommunityId(int $userId): ?int
    {
        $id = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->value('community_id');

        return $id ? (int) $id : null;
    }
}
