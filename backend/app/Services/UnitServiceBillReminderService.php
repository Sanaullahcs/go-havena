<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class UnitServiceBillReminderService
{
    public const KIND_CREATED = 'bill_created';

    public const KIND_SERVICE_PUBLISHED = 'service_published';

    public const KIND_OPTIONAL_SERVICE_AVAILABLE = 'optional_service_available';

    public const KIND_DUE_SOON = 'due_soon';

    public const KIND_DUE_DATE = 'due_date';

    public const KIND_OVERDUE = 'overdue';

    public const KIND_PROOF_SUBMITTED = 'proof_submitted';

    public const KIND_APPROVED = 'approved';

    public const KIND_REJECTED = 'rejected';

    public const KIND_ADMIN_ACKNOWLEDGED = 'admin_acknowledged';

    public const DUE_SOON_DAYS = 3;

    public const CREATED_TITLE = 'New Service Bill';

    public const SERVICE_PUBLISHED_TITLE = 'New Service';

    public const SERVICE_AVAILABLE_TITLE = 'New Service Available';

    public const PROOF_SUBMITTED_TITLE = 'Payment Proof Submitted';

    public const PROOF_SUBMITTED_BODY = 'Your payment proof is waiting for admin review.';

    public const APPROVED_TITLE = 'Payment Approved';

    public const REJECTED_TITLE = 'Payment Proof Rejected';

    public const REJECTED_BODY = 'Your payment proof was rejected. Please review the bill and upload a new payment proof.';

    public function markOverdue(?int $userId = null, ?int $communityId = null): int
    {
        $query = DB::table('unit_service_bills')
            ->whereIn('status', [
                UnitServiceBillService::STATUS_UNPAID,
            ])
            ->whereDate('due_date', '<', now()->toDateString());

        if ($userId) {
            $query->where('billing_contact_user_id', $userId);
        }
        if ($communityId) {
            $query->where('community_id', $communityId);
        }

        $ids = $query->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($ids === []) {
            return 0;
        }

        return DB::table('unit_service_bills')
            ->whereIn('id', $ids)
            ->update([
                'status' => UnitServiceBillService::STATUS_OVERDUE,
                'updated_at' => now(),
            ]);
    }

    /** @return array{overdue_marked: int, sent: int} */
    public function processReminders(): array
    {
        $overdueMarked = $this->markOverdue();
        $sent = 0;
        $today = now()->toDateString();

        $rows = DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->whereNotNull('usb.billing_contact_user_id')
            ->whereIn('usb.status', [
                UnitServiceBillService::STATUS_UNPAID,
                UnitServiceBillService::STATUS_ACKNOWLEDGED,
                UnitServiceBillService::STATUS_REJECTED,
                UnitServiceBillService::STATUS_OVERDUE,
            ])
            ->select([
                'usb.id',
                'usb.billing_contact_user_id',
                'usb.due_date',
                'usb.status',
                'usb.service_id',
                'usb.billing_period',
                'ps.name as service_name',
                'units.unit_number',
            ])
            ->get();

        foreach ($rows as $row) {
            $dueDate = Carbon::parse((string) $row->due_date)->toDateString();
            $dueSoonOn = Carbon::parse($dueDate)->subDays(self::DUE_SOON_DAYS)->toDateString();

            if ($today < $dueDate && $today >= $dueSoonOn && $this->notify($row, self::KIND_DUE_SOON, 'warning', 'Service bill due soon', "{$row->service_name} for {$row->unit_number} is due on {$dueDate}.")) {
                $sent++;
            }
            if ($today === $dueDate && $this->notify($row, self::KIND_DUE_DATE, 'warning', 'Service bill due today', "{$row->service_name} for {$row->unit_number} is due today.")) {
                $sent++;
            }
            if ((string) $row->status === UnitServiceBillService::STATUS_OVERDUE && $this->notify($row, self::KIND_OVERDUE, 'warning', 'Service bill overdue', "{$row->service_name} for {$row->unit_number} is overdue.")) {
                $sent++;
            }
        }

        return ['overdue_marked' => $overdueMarked, 'sent' => $sent];
    }

    public function notifyCreated(object $bill, string $serviceName, string $unitNumber): void
    {
        if (empty($bill->billing_contact_user_id)) {
            return;
        }

        $this->notify((object) [
            'id' => $bill->id,
            'billing_contact_user_id' => $bill->billing_contact_user_id,
            'service_id' => $bill->service_id,
            'service_name' => $serviceName,
            'unit_number' => $unitNumber,
        ], self::KIND_CREATED, 'info', self::CREATED_TITLE, $this->createdMessage($serviceName, $bill));
    }

    /**
     * Notify every residential billing contact that a service was published.
     * Contacts who already received a bill-created notification are skipped.
     *
     * @param  list<int>  $alreadyNotifiedUserIds
     */
    public function notifyServicePublished(object $service, array $alreadyNotifiedUserIds = []): void
    {
        if (! ($service->send_notification ?? true)) {
            return;
        }
        if (($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
            return;
        }

        $isOptional = ($service->application_type ?? '') === PropertyServiceCatalogService::TYPE_OPTIONAL;
        $name = trim((string) ($service->name ?? '')) ?: 'Service';
        $title = $isOptional ? self::SERVICE_AVAILABLE_TITLE : self::SERVICE_PUBLISHED_TITLE;
        $body = $isOptional
            ? "{$name} is now available for your unit. Open Available Services to subscribe."
            : "{$name} has been added for your unit.";
        $url = $isOptional
            ? '/screens/property-management/available-services'
            : '/screens/property-management/unit-bills';
        $kind = $isOptional ? self::KIND_OPTIONAL_SERVICE_AVAILABLE : self::KIND_SERVICE_PUBLISHED;
        $skip = array_fill_keys(array_map('intval', $alreadyNotifiedUserIds), true);

        foreach (app(UnitAssignmentService::class)->billingContactsForCommunity((int) $service->community_id) as $contact) {
            $userId = (int) ($contact['user_id'] ?? 0);
            if ($userId < 1 || isset($skip[$userId])) {
                continue;
            }

            NotificationService::send(
                $userId,
                'info',
                $title,
                $body,
                $url,
                [
                    'kind' => $kind,
                    'service_id' => (int) $service->id,
                    'unit_id' => (int) ($contact['unit_id'] ?? 0),
                ],
            );
        }
    }

    public function notifyProofSubmitted(object $bill): void
    {
        $this->notifyLifecycle($bill, self::KIND_PROOF_SUBMITTED, 'info', self::PROOF_SUBMITTED_TITLE, self::PROOF_SUBMITTED_BODY);
    }

    public function notifyAdminsAcknowledged(object $bill, int $actorId): void
    {
        if (! $this->claimNotification((int) $bill->id, self::KIND_ADMIN_ACKNOWLEDGED)) {
            return;
        }

        $adminIds = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', (int) $bill->community_id)
            ->whereIn('cm.role', ['admin', 'moderator'])
            ->where('cm.status', 'approved')
            ->where('users.status', '!=', 'deleted')
            ->where('cm.user_id', '!=', $actorId)
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($adminIds === []) {
            return;
        }

        $profile = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.id', $actorId)
            ->first(['users.name', 'profiles.display_name']);
        $memberName = trim((string) ($profile->display_name ?? ''));
        if ($memberName === '') {
            $memberName = trim((string) ($profile->name ?? ''));
        }
        if ($memberName === '') {
            $memberName = 'A resident';
        }

        $serviceName = trim((string) ($bill->service_name ?? '')) ?: 'service';
        $billTitle = trim((string) ($bill->title ?? ''));
        $reference = $billTitle !== '' ? $billTitle : "{$serviceName} bill";
        $unitNumber = trim((string) ($bill->unit_number ?? ''));
        $unitLabel = $unitNumber !== '' ? " (Unit {$unitNumber})" : '';
        $amount = $this->formatAmount((float) ($bill->amount ?? 0));
        $body = "{$memberName}{$unitLabel} acknowledged {$reference} ({$serviceName}, {$amount}).";

        foreach ($adminIds as $adminId) {
            NotificationService::send(
                $adminId,
                'info',
                'Service bill acknowledged',
                $body,
                '/screens/admin-service-bills?billId='.(int) $bill->id,
                [
                    'kind' => 'service_bill_'.self::KIND_ADMIN_ACKNOWLEDGED,
                    'bill_id' => (int) $bill->id,
                    'service_id' => (int) ($bill->service_id ?? 0),
                    'unit_id' => (int) ($bill->unit_id ?? 0),
                ],
            );
        }
    }

    public function notifyApproved(object $bill, string $serviceName): void
    {
        $this->notifyLifecycle(
            $bill,
            self::KIND_APPROVED,
            'success',
            self::APPROVED_TITLE,
            "Your payment for {$serviceName} has been approved.",
        );
    }

    public function notifyRejected(object $bill): void
    {
        $reason = trim((string) ($bill->rejection_reason ?? ''));
        $body = $reason !== ''
            ? "Your payment proof was rejected: {$reason} Open My unit bills to upload a new payment proof."
            : self::REJECTED_BODY;

        $this->notifyLifecycle($bill, self::KIND_REJECTED, 'warning', self::REJECTED_TITLE, $body);
    }

    public function createdMessage(string $serviceName, object $bill): string
    {
        $amount = $this->formatAmount((float) ($bill->amount ?? 0));
        $subject = $this->billSubjectLabel($serviceName);
        $availability = "Your {$subject} of {$amount} is now available.";

        if (empty($bill->due_date)) {
            return $availability;
        }

        $dueDate = Carbon::parse((string) $bill->due_date)->format('F j');

        return "{$availability} Due date: {$dueDate}.";
    }

    /** Avoid "Water Bill bill" when the service name already ends with "bill". */
    public function billSubjectLabel(string $serviceName): string
    {
        $name = trim($serviceName);
        if ($name === '') {
            return 'service bill';
        }
        if (preg_match('/\bbill\s*$/iu', $name)) {
            return $name;
        }

        return "{$name} bill";
    }

    private function notifyLifecycle(object $bill, string $kind, string $type, string $title, string $body): void
    {
        if (empty($bill->billing_contact_user_id)) {
            return;
        }

        NotificationService::send(
            (int) $bill->billing_contact_user_id,
            $type,
            $title,
            $body,
            '/screens/property-management/unit-bills',
            [
                'kind' => 'service_bill_'.$kind,
                'bill_id' => (int) $bill->id,
                'service_id' => (int) ($bill->service_id ?? 0),
            ],
        );
    }

    private function notify(object $row, string $kind, string $type, string $title, string $body): bool
    {
        if (! $this->claimNotification((int) $row->id, $kind)) {
            return false;
        }

        NotificationService::send(
            (int) $row->billing_contact_user_id,
            $type,
            $title,
            $body,
            '/screens/property-management/unit-bills',
            [
                'kind' => 'service_bill_'.$kind,
                'bill_id' => (int) $row->id,
                'service_id' => (int) ($row->service_id ?? 0),
            ],
        );

        return true;
    }

    private function formatAmount(float $amount): string
    {
        if (abs($amount - round($amount)) < 0.001) {
            return '$'.number_format($amount, 0);
        }

        return '$'.number_format($amount, 2);
    }

    private function claimNotification(int $billId, string $kind): bool
    {
        try {
            DB::table('unit_service_bill_notifications')->insert([
                'bill_id' => $billId,
                'kind' => $kind,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return true;
        } catch (QueryException) {
            return false;
        }
    }
}
