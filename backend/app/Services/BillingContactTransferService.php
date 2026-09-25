<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BillingContactTransferService
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    public const SCREEN = '/screens/property-management/billing-contact';

    public function __construct(private UnitAssignmentService $units) {}

    public function enrichResidentUnit(array $payload, User $viewer): array
    {
        $unitId = (int) ($payload['id'] ?? 0);
        $contactId = (int) ($payload['billing_contact_user_id'] ?? 0);
        $payload['residents'] = $this->units->listResidentMembers($unitId, $contactId);
        $payload['outgoing_transfer'] = $this->formatPendingFor(
            $unitId,
            'requested_by_user_id',
            (int) $viewer->id,
        );
        $payload['incoming_transfer'] = $this->formatPendingFor(
            $unitId,
            'nominee_user_id',
            (int) $viewer->id,
        );
        $payload['can_request_transfer'] = (bool) ($payload['is_billing_contact'] ?? false)
            && empty($payload['outgoing_transfer']);

        return $payload;
    }

    public function requestTransfer(User $requester, int $nomineeUserId, ?string $message = null): array
    {
        $unit = $this->requireViewerUnit($requester);
        if ((int) ($unit->billing_contact_user_id ?? 0) !== (int) $requester->id) {
            throw ValidationException::withMessages([
                'unit' => 'Only the current billing contact can nominate another resident.',
            ]);
        }
        if ((int) $nomineeUserId === (int) $requester->id) {
            throw ValidationException::withMessages([
                'nominee_user_id' => 'Choose another resident in your unit.',
            ]);
        }

        $this->assertNomineeEligible($unit, $nomineeUserId);

        $existing = $this->pendingForUnit((int) $unit->id);
        if ($existing && (int) $existing->nominee_user_id === $nomineeUserId) {
            return $this->format($existing);
        }
        if ($existing) {
            throw ValidationException::withMessages([
                'unit' => 'A billing contact request is already pending. Wait for them to approve or reject it.',
            ]);
        }

        $now = now();
        $id = DB::table('unit_billing_contact_transfer_requests')->insertGetId([
            'community_id' => $unit->community_id,
            'unit_id' => $unit->id,
            'requested_by_user_id' => $requester->id,
            'nominee_user_id' => $nomineeUserId,
            'status' => self::STATUS_PENDING,
            'message' => $this->nullableString($message),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $request = DB::table('unit_billing_contact_transfer_requests')->find($id);
        $requesterName = $this->requesterName($requester);
        $this->notify(
            $nomineeUserId,
            'info',
            'Billing contact request',
            "{$requesterName} wants you to become the billing contact for unit {$unit->unit_number}. Approve or reject the request.",
            [
                'kind' => 'billing_contact_transfer_request',
                'transfer_request_id' => $id,
                'unit_id' => (int) $unit->id,
            ],
        );

        ActivityLogService::user(
            'billing_contact_transfer_requested',
            "Nominated a new billing contact for unit {$unit->unit_number}",
            'BillingContactTransfer',
            $id,
            'info',
            (int) $requester->id,
        );

        return $this->format($request);
    }

    public function accept(User $nominee, int $requestId): array
    {
        $request = $this->pendingOwnedByNominee($requestId, $nominee);
        $unit = DB::table('units')->find($request->unit_id);
        abort_if(! $unit, 404, 'Unit not found.');

        if ((int) ($unit->billing_contact_user_id ?? 0) !== (int) $request->requested_by_user_id) {
            $this->markCancelled($request, $nominee, 'The original billing contact is no longer assigned.');
            throw ValidationException::withMessages([
                'request' => 'This request is no longer valid. The current billing contact has not changed.',
            ]);
        }

        $this->assertNomineeEligible($unit, (int) $nominee->id);

        DB::transaction(function () use ($request, $unit, $nominee) {
            $this->units->transferBillingContact((int) $unit->community_id, (int) $unit->id, (int) $nominee->id, false);
            DB::table('unit_billing_contact_transfer_requests')->where('id', $request->id)->update([
                'status' => self::STATUS_ACCEPTED,
                'reviewed_by_user_id' => $nominee->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);
            $this->cancelPendingForUnit((int) $unit->id, 'Cancelled because another billing contact request was accepted.');
        });

        $fresh = DB::table('unit_billing_contact_transfer_requests')->find($request->id);
        $nomineeName = $this->requesterName($nominee);
        $this->notify(
            (int) $request->requested_by_user_id,
            'success',
            'Billing contact accepted',
            "{$nomineeName} accepted and is now the billing contact for unit {$unit->unit_number}.",
            [
                'kind' => 'billing_contact_transfer_accepted',
                'transfer_request_id' => (int) $request->id,
                'unit_id' => (int) $unit->id,
            ],
        );

        ActivityLogService::user(
            'billing_contact_transfer_accepted',
            "Accepted billing contact for unit {$unit->unit_number}",
            'BillingContactTransfer',
            (int) $request->id,
            'info',
            (int) $nominee->id,
        );

        return $this->format($fresh);
    }

    public function reject(User $nominee, int $requestId, ?string $reason = null): array
    {
        $request = $this->pendingOwnedByNominee($requestId, $nominee);
        $unit = DB::table('units')->find($request->unit_id);

        DB::table('unit_billing_contact_transfer_requests')->where('id', $request->id)->update([
            'status' => self::STATUS_REJECTED,
            'rejection_reason' => $this->nullableString($reason),
            'reviewed_by_user_id' => $nominee->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        $fresh = DB::table('unit_billing_contact_transfer_requests')->find($request->id);
        $nomineeName = $this->requesterName($nominee);
        $unitNumber = $unit->unit_number ?? 'your unit';
        $this->notify(
            (int) $request->requested_by_user_id,
            'warning',
            'Billing contact declined',
            "{$nomineeName} declined becoming billing contact for unit {$unitNumber}. You remain the billing contact.",
            [
                'kind' => 'billing_contact_transfer_rejected',
                'transfer_request_id' => (int) $request->id,
                'unit_id' => (int) $request->unit_id,
            ],
        );

        return $this->format($fresh);
    }

    public function cancel(User $requester, int $requestId): array
    {
        $request = DB::table('unit_billing_contact_transfer_requests')->find($requestId);
        abort_if(! $request, 404, 'Transfer request not found.');
        if ((int) $request->requested_by_user_id !== (int) $requester->id) {
            abort(403, 'You can only cancel your own billing contact request.');
        }
        if ($request->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'request' => 'This request is no longer pending.',
            ]);
        }

        $this->markCancelled($request, $requester, 'Cancelled by the current billing contact.');
        $unit = DB::table('units')->find($request->unit_id);
        $this->notify(
            (int) $request->nominee_user_id,
            'info',
            'Billing contact request withdrawn',
            $this->requesterName($requester).' withdrew the request for you to become billing contact of unit '.($unit->unit_number ?? '').'.',
            [
                'kind' => 'billing_contact_transfer_cancelled',
                'transfer_request_id' => (int) $request->id,
                'unit_id' => (int) $request->unit_id,
            ],
        );

        return $this->format(DB::table('unit_billing_contact_transfer_requests')->find($request->id));
    }

    public function cancelPendingForUnit(int $unitId, ?string $reason = null): void
    {
        $pending = DB::table('unit_billing_contact_transfer_requests')
            ->where('unit_id', $unitId)
            ->where('status', self::STATUS_PENDING)
            ->get();

        foreach ($pending as $request) {
            $this->markCancelled($request, null, $reason ?: 'Cancelled because the billing contact changed.');
        }
    }

    public function cancelPendingForUser(int $userId, int $communityId): void
    {
        $pending = DB::table('unit_billing_contact_transfer_requests')
            ->where('community_id', $communityId)
            ->where('status', self::STATUS_PENDING)
            ->where(function ($query) use ($userId) {
                $query->where('requested_by_user_id', $userId)
                    ->orWhere('nominee_user_id', $userId);
            })
            ->get();

        foreach ($pending as $request) {
            $this->markCancelled($request, null, 'Cancelled because a resident left the unit.');
        }
    }

    public function format(?object $request): ?array
    {
        if (! $request) {
            return null;
        }

        $unit = DB::table('units')->find($request->unit_id);

        return [
            'id' => (int) $request->id,
            'community_id' => (int) $request->community_id,
            'unit_id' => (int) $request->unit_id,
            'unit_number' => $unit->unit_number ?? null,
            'requested_by' => $this->userBrief((int) $request->requested_by_user_id),
            'nominee' => $this->userBrief((int) $request->nominee_user_id),
            'status' => $request->status,
            'message' => $request->message,
            'rejection_reason' => $request->rejection_reason,
            'reviewed_at' => $request->reviewed_at,
            'created_at' => $request->created_at,
            'updated_at' => $request->updated_at,
        ];
    }

    private function requireViewerUnit(User $user): object
    {
        $communityId = $this->units->approvedCommunityIdFor((int) $user->id);
        abort_if(! $communityId, 422, 'No approved community membership found.');
        $unit = $this->units->findActiveUnitForUser((int) $user->id, $communityId);
        abort_if(! $unit, 422, 'You are not assigned to a unit.');

        return $unit;
    }

    private function assertNomineeEligible(object $unit, int $nomineeUserId): void
    {
        $resident = DB::table('unit_residents')
            ->where('unit_id', $unit->id)
            ->where('user_id', $nomineeUserId)
            ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
            ->first();

        if (! $resident || ! $this->units->isEligibleBillingContactFor((int) $unit->community_id, $nomineeUserId)) {
            throw ValidationException::withMessages([
                'nominee_user_id' => 'Choose an active resident of this unit. Community admins cannot be billing contacts.',
            ]);
        }
    }

    private function pendingOwnedByNominee(int $requestId, User $nominee): object
    {
        $request = DB::table('unit_billing_contact_transfer_requests')->find($requestId);
        abort_if(! $request, 404, 'Transfer request not found.');
        if ((int) $request->nominee_user_id !== (int) $nominee->id) {
            abort(403, 'This request was sent to a different resident.');
        }
        if ($request->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'request' => 'This request is no longer pending. The current billing contact is unchanged.',
            ]);
        }

        return $request;
    }

    private function pendingForUnit(int $unitId): ?object
    {
        return DB::table('unit_billing_contact_transfer_requests')
            ->where('unit_id', $unitId)
            ->where('status', self::STATUS_PENDING)
            ->orderByDesc('id')
            ->first();
    }

    private function formatPendingFor(int $unitId, string $column, int $userId): ?array
    {
        $row = DB::table('unit_billing_contact_transfer_requests')
            ->where('unit_id', $unitId)
            ->where($column, $userId)
            ->where('status', self::STATUS_PENDING)
            ->orderByDesc('id')
            ->first();

        return $this->format($row);
    }

    private function markCancelled(object $request, ?User $actor, ?string $reason): void
    {
        DB::table('unit_billing_contact_transfer_requests')->where('id', $request->id)->update([
            'status' => self::STATUS_CANCELLED,
            'rejection_reason' => $this->nullableString($reason),
            'reviewed_by_user_id' => $actor?->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function userBrief(int $userId): array
    {
        $user = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.id', $userId)
            ->select('users.id', 'users.name', 'users.email', 'profiles.display_name')
            ->first();

        return [
            'id' => $userId,
            'name' => $user ? ($user->display_name ?: $user->name) : 'Resident',
            'email' => $user->email ?? null,
        ];
    }

    private function requesterName(User $user): string
    {
        $profile = $user->profile ?? null;

        return trim((string) ($profile?->display_name ?: $user->name)) ?: 'A resident';
    }

    private function notify(int $userId, string $type, string $title, string $body, array $data): void
    {
        NotificationService::send($userId, $type, $title, $body, self::SCREEN, $data);
    }

    private function nullableString(?string $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }
}
