<?php

namespace App\Services\Landlord;

use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use Illuminate\Support\Facades\DB;

/**
 * Advisory landlord reviews for tenant membership on rented owned units.
 * Never blocks community-admin approval.
 */
class LandlordAdvisoryService
{
    public function syncForResident(int $communityId, int $unitId, int $subjectUserId, ?int $unitResidentId = null): void
    {
        $ownership = DB::table('unit_ownerships')
            ->where('unit_id', $unitId)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('occupancy', UnitOwnershipOccupancy::RENTED)
            ->orderByDesc('id')
            ->first();

        if (! $ownership || (int) $ownership->user_id === $subjectUserId) {
            return;
        }

        $existing = DB::table('landlord_membership_reviews')
            ->where('unit_id', $unitId)
            ->where('subject_user_id', $subjectUserId)
            ->where('landlord_user_id', $ownership->user_id)
            ->whereIn('status', ['pending', 'approved', 'rejected'])
            ->orderByDesc('id')
            ->first();

        if ($existing && $existing->status === 'pending') {
            if ($unitResidentId && empty($existing->unit_resident_id)) {
                DB::table('landlord_membership_reviews')->where('id', $existing->id)->update([
                    'unit_resident_id' => $unitResidentId,
                    'updated_at' => now(),
                ]);
            }

            return;
        }

        if ($existing && in_array($existing->status, ['approved', 'rejected'], true)) {
            return;
        }

        DB::table('landlord_membership_reviews')->insert([
            'community_id' => $communityId,
            'unit_id' => $unitId,
            'subject_user_id' => $subjectUserId,
            'landlord_user_id' => (int) $ownership->user_id,
            'unit_resident_id' => $unitResidentId,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return list<object> */
    public function pendingForLandlord(int $landlordUserId, int $communityId): array
    {
        return DB::table('landlord_membership_reviews as r')
            ->join('units', 'units.id', '=', 'r.unit_id')
            ->join('users', 'users.id', '=', 'r.subject_user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('unit_residents as ur', 'ur.id', '=', 'r.unit_resident_id')
            ->where('r.landlord_user_id', $landlordUserId)
            ->where('r.community_id', $communityId)
            ->where('r.status', 'pending')
            ->orderByDesc('r.created_at')
            ->select(
                'r.id',
                'r.unit_id',
                'r.subject_user_id',
                'r.status',
                'r.created_at',
                'units.unit_number',
                'users.email',
                'profiles.display_name',
                'ur.status as resident_status',
            )
            ->get()
            ->all();
    }

    public function decide(int $reviewId, int $landlordUserId, string $status, ?string $reason = null): void
    {
        if (! in_array($status, ['approved', 'rejected'], true)) {
            abort(422, 'Status must be approved or rejected.');
        }

        $row = DB::table('landlord_membership_reviews')
            ->where('id', $reviewId)
            ->where('landlord_user_id', $landlordUserId)
            ->first();

        abort_if(! $row, 404, 'Review not found.');

        DB::table('landlord_membership_reviews')->where('id', $reviewId)->update([
            'status' => $status,
            'rejection_reason' => $status === 'rejected' ? $reason : null,
            'reviewed_by' => $landlordUserId,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Latest advisory badge for a subject on a unit (admin UI). Does not gate approval.
     *
     * @return array{status: string, landlord_user_id: int|null}|null
     */
    public function latestForSubject(int $unitId, int $subjectUserId): ?array
    {
        $row = DB::table('landlord_membership_reviews')
            ->where('unit_id', $unitId)
            ->where('subject_user_id', $subjectUserId)
            ->orderByDesc('id')
            ->first();

        if (! $row) {
            return null;
        }

        return [
            'status' => (string) $row->status,
            'landlord_user_id' => (int) $row->landlord_user_id,
            'rejection_reason' => $row->rejection_reason,
        ];
    }

    public function roster(int $unitId): array
    {
        $billingId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);

        return DB::table('unit_residents as ur')
            ->join('users', 'users.id', '=', 'ur.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('ur.unit_id', $unitId)
            ->whereIn('ur.status', [
                UnitAssignmentService::RESIDENT_ACTIVE,
                UnitAssignmentService::RESIDENT_PENDING,
                UnitAssignmentService::RESIDENT_LEFT,
            ])
            ->orderBy('ur.status')
            ->orderBy('users.name')
            ->select('ur.user_id', 'ur.status', 'users.email', 'users.name', 'profiles.display_name')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->user_id,
                'name' => $row->display_name ?: $row->name,
                'email' => $row->email,
                'status' => (string) $row->status,
                'is_billing_contact' => $billingId === (int) $row->user_id,
            ])
            ->all();
    }
}
