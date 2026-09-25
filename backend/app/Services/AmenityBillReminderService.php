<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class AmenityBillReminderService
{
    public const KIND_CREATED = 'bill_created';

    public const KIND_DUE_SOON = 'due_soon';

    public const KIND_DUE_DATE = 'due_date';

    public const KIND_OVERDUE = 'overdue';

    public const KIND_NEXT_CYCLE = 'next_cycle';

    public const DUE_SOON_DAYS = 3;

    public const BOOKING_RESTRICTED_MESSAGE = 'You have an unpaid shared amenity bill for this amenity. Please submit your payment proof before booking.';

    public const BOOKING_RESTRICTED_ERROR = 'shared_amenity_bill_unpaid';

    public const OUTSTANDING_STATUSES = [
        AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
        AmenitySharedBillService::RESIDENT_STATUS_PENDING,
        AmenitySharedBillService::RESIDENT_STATUS_REJECTED,
        AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
    ];

    /** Flip unpaid/rejected bills past their due date to overdue. Never touches pending or paid. */
    public function markOverdue(?int $amenityId = null, ?int $userId = null): int
    {
        $query = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->whereIn('rb.status', [
                AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
                AmenitySharedBillService::RESIDENT_STATUS_REJECTED,
            ])
            ->where('mb.status', AmenitySharedBillService::STATUS_PUBLISHED)
            ->whereDate('mb.due_date', '<', now()->toDateString());

        if ($amenityId) {
            $query->where('rb.amenity_id', $amenityId);
        }
        if ($userId) {
            $query->where('rb.user_id', $userId);
        }

        $ids = $query->pluck('rb.id')->map(fn ($id) => (int) $id)->all();
        if ($ids === []) {
            return 0;
        }

        return DB::table('amenity_resident_bills')
            ->whereIn('id', $ids)
            ->update([
                'status' => AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
                'updated_at' => now(),
            ]);
    }

    /**
     * Scheduled pass: mark overdue, then send due-soon / due-today / overdue reminders once each.
     *
     * @return array{overdue_marked: int, sent: int}
     */
    public function processReminders(): array
    {
        $overdueMarked = $this->markOverdue();
        $sent = 0;

        $rows = $this->reminderCandidates();
        $today = now()->toDateString();

        foreach ($rows as $row) {
            $status = (string) $row->resident_status;
            $dueDate = Carbon::parse((string) $row->due_date)->toDateString();
            $dueSoonOn = Carbon::parse($dueDate)->subDays(self::DUE_SOON_DAYS)->toDateString();

            if (in_array($status, [AmenitySharedBillService::RESIDENT_STATUS_PAID, AmenitySharedBillService::RESIDENT_STATUS_PENDING], true)) {
                continue;
            }

            if ($today < $dueDate && $today >= $dueSoonOn && $this->notifyDueSoon($row)) {
                $sent++;
            }

            if ($today === $dueDate && $this->notifyDueToday($row)) {
                $sent++;
            }

            if ($status === AmenitySharedBillService::RESIDENT_STATUS_OVERDUE && $this->notifyOverdue($row)) {
                $sent++;
            }

            if ($this->hasLaterMonthlyBill((int) $row->amenity_id, (string) $row->billing_month)
                && in_array($status, self::OUTSTANDING_STATUSES, true)
                && $this->notifyNextCycle($row)
            ) {
                $sent++;
            }
        }

        return ['overdue_marked' => $overdueMarked, 'sent' => $sent];
    }

    public function notifyPublishedMonthlyBill(object $monthlyBill, string $amenityName): void
    {
        $this->markOverdue((int) $monthlyBill->amenity_id);

        $rows = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->where('rb.monthly_bill_id', (int) $monthlyBill->id)
            ->select($this->reminderSelect())
            ->get();

        foreach ($rows as $row) {
            $row->amenity_name = $amenityName;
            $this->notifyCreated($row);
        }

        $previous = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->where('rb.amenity_id', (int) $monthlyBill->amenity_id)
            ->where('mb.billing_month', '<', $monthlyBill->billing_month)
            ->whereIn('rb.status', self::OUTSTANDING_STATUSES)
            ->select($this->reminderSelect())
            ->addSelect('a.name as amenity_name')
            ->get();

        foreach ($previous as $row) {
            $this->notifyNextCycle($row);
        }
    }

    /** Amenity booking restriction: any published unpaid/rejected/overdue shared bill. */
    public function hasOverdueSharedAmenityBill(int $amenityId, int $userId): bool
    {
        return $this->restrictedAmenityIds($userId, [$amenityId]) !== [];
    }

    /**
     * @param  list<int>  $amenityIds
     * @return list<int>
     */
    public function restrictedAmenityIds(int $userId, array $amenityIds = []): array
    {
        if ($amenityIds === []) {
            return [];
        }

        $this->markOverdue(userId: $userId);

        $query = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->where('rb.user_id', $userId)
            ->whereIn('rb.amenity_id', $amenityIds)
            ->whereIn('rb.status', self::OUTSTANDING_STATUSES)
            ->where('mb.status', AmenitySharedBillService::STATUS_PUBLISHED);

        if (\Illuminate\Support\Facades\Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            $query->where(function ($inner) {
                $inner->whereNull('rb.booking_id')->orWhere('rb.booking_id', 0);
            });
        }

        return $query
            ->distinct()
            ->pluck('rb.amenity_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /** @return array<string, mixed>|null */
    public function outstandingPreviousBill(int $amenityId, int $userId, string $billingMonth): ?array
    {
        $row = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->where('rb.amenity_id', $amenityId)
            ->where('rb.user_id', $userId)
            ->where('mb.billing_month', '<', $billingMonth)
            ->where('mb.status', AmenitySharedBillService::STATUS_PUBLISHED)
            ->whereIn('rb.status', self::OUTSTANDING_STATUSES)
            ->orderByDesc('mb.billing_month')
            ->select([
                'rb.id as resident_bill_id',
                'rb.amount',
                'rb.status',
                'mb.billing_month',
                'mb.due_date',
            ])
            ->first();

        if (! $row) {
            return null;
        }

        $month = Carbon::parse((string) $row->billing_month)->startOfMonth();

        return [
            'resident_bill_id' => (int) $row->resident_bill_id,
            'billing_month' => $month->format('Y-m'),
            'billing_month_label' => $month->format('F Y'),
            'amount' => (float) $row->amount,
            'due_date' => Carbon::parse((string) $row->due_date)->toDateString(),
            'status' => (string) $row->status,
            'status_label' => app(AmenitySharedBillService::class)->statusLabel((string) $row->status),
        ];
    }

    private function notifyCreated(object $row): bool
    {
        $month = Carbon::parse((string) $row->billing_month)->format('F Y');

        return $this->sendOnce((int) $row->resident_bill_id, self::KIND_CREATED, $row, 'info',
            "Your {$row->amenity_name} bill for {$month} is available.",
            "Your {$row->amenity_name} bill for {$month} is available."
        );
    }

    private function notifyDueSoon(object $row): bool
    {
        $due = Carbon::parse((string) $row->due_date)->format('j M Y');
        $amount = $this->formatAmount((float) $row->resident_amount);

        return $this->sendOnce((int) $row->resident_bill_id, self::KIND_DUE_SOON, $row, 'info',
            "Your {$row->amenity_name} bill is due soon",
            "Your {$row->amenity_name} bill of {$amount} is due on {$due}."
        );
    }

    private function notifyDueToday(object $row): bool
    {
        return $this->sendOnce((int) $row->resident_bill_id, self::KIND_DUE_DATE, $row, 'warning',
            "Your {$row->amenity_name} bill is due today",
            "Your {$row->amenity_name} bill is due today."
        );
    }

    private function notifyOverdue(object $row): bool
    {
        return $this->sendOnce((int) $row->resident_bill_id, self::KIND_OVERDUE, $row, 'warning',
            "Your {$row->amenity_name} bill is overdue",
            "Your {$row->amenity_name} bill is overdue. Please submit your payment proof."
        );
    }

    private function notifyNextCycle(object $row): bool
    {
        $month = Carbon::parse((string) $row->billing_month)->format('F Y');

        return $this->sendOnce((int) $row->resident_bill_id, self::KIND_NEXT_CYCLE, $row, 'warning',
            "Outstanding {$row->amenity_name} bill",
            "You still have an unpaid {$row->amenity_name} bill from {$month}. Please clear the outstanding amount."
        );
    }

    private function sendOnce(int $residentBillId, string $kind, object $row, string $type, string $title, string $body): bool
    {
        if (! $this->claimNotification($residentBillId, $kind)) {
            return false;
        }

        NotificationService::send(
            (int) $row->user_id,
            $type,
            $title,
            $body,
            '/screens/property-management/amenity-bills',
            [
                'kind' => 'amenity_bill_'.$kind,
                'amenity_id' => (int) $row->amenity_id,
                'resident_bill_id' => $residentBillId,
                'monthly_bill_id' => (int) $row->monthly_bill_id,
                'billing_month' => Carbon::parse((string) $row->billing_month)->format('Y-m'),
            ],
        );

        return true;
    }

    private function claimNotification(int $residentBillId, string $kind): bool
    {
        try {
            DB::table('amenity_resident_bill_notifications')->insert([
                'resident_bill_id' => $residentBillId,
                'kind' => $kind,
                'sent_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return true;
        } catch (QueryException $e) {
            if ($this->isUniqueViolation($e)) {
                return false;
            }
            throw $e;
        }
    }

    private function reminderCandidates()
    {
        return DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->where('mb.status', AmenitySharedBillService::STATUS_PUBLISHED)
            ->whereIn('rb.status', [
                AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
                AmenitySharedBillService::RESIDENT_STATUS_REJECTED,
                AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
            ])
            ->select($this->reminderSelect())
            ->addSelect('a.name as amenity_name')
            ->get();
    }

    /** @return list<string> */
    private function reminderSelect(): array
    {
        return [
            'rb.id as resident_bill_id',
            'rb.user_id',
            'rb.amenity_id',
            'rb.monthly_bill_id',
            'rb.amount as resident_amount',
            'rb.status as resident_status',
            'mb.billing_month',
            'mb.due_date',
        ];
    }

    private function hasLaterMonthlyBill(int $amenityId, string $billingMonth): bool
    {
        return DB::table('amenity_monthly_bills')
            ->where('amenity_id', $amenityId)
            ->where('status', AmenitySharedBillService::STATUS_PUBLISHED)
            ->where('billing_month', '>', $billingMonth)
            ->exists();
    }

    private function formatAmount(float $amount): string
    {
        return rtrim(rtrim(number_format($amount, 2, '.', ''), '0'), '.');
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        $code = (string) $e->getCode();

        return $code === '23000'
            || str_contains($e->getMessage(), 'UNIQUE constraint failed')
            || str_contains($e->getMessage(), 'amenity_bill_notifications_unique');
    }
};
