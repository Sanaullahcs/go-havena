<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Support\BillDueDate;
use App\Support\MediaUrl;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AmenitySharedBillService
{
    public const STATUS_PUBLISHED = 'published';

    public const RESIDENT_STATUS_UNPAID = 'unpaid';

    public const RESIDENT_STATUS_PENDING = 'pending_verification';

    public const RESIDENT_STATUS_PAID = 'paid';

    public const RESIDENT_STATUS_REJECTED = 'rejected';

    public const RESIDENT_STATUS_OVERDUE = 'overdue';

    public const ACTION_SUBMITTED = 'submitted';

    public const ACTION_APPROVED = 'approved';

    public const ACTION_CLARIFICATION = 'clarification_requested';

    public const ACTION_REJECTED = 'rejected';

    public const ACTION_ACH_SUBMITTED = 'ach_submitted';

    public const ACTION_ACH_POSTED = 'ach_posted';

    public const ACTION_ACH_FAILED = 'ach_failed';

    public const ACTION_ACH_REFUNDED = 'ach_refunded';

    public const APPROVED_MESSAGE = 'Payment approved successfully.';

    public const ACKNOWLEDGED_MESSAGE = 'Payment received. Your %s bill for %s has been acknowledged.';

    public const REJECTED_MESSAGE = 'Payment rejected.';

    public const REVIEW_NOT_PENDING_MESSAGE = 'Only payments pending verification can be reviewed.';

    public const REJECTION_REASONS = [
        'unclear_proof' => 'Payment proof is unclear',
        'amount_mismatch' => 'Amount does not match',
        'incorrect_bill' => 'Incorrect bill/payment',
        'invalid_receipt' => 'Invalid receipt',
        'other' => 'Other',
    ];

    public const DUPLICATE_MONTH_MESSAGE = 'A monthly bill already exists for this amenity and this billing month.';

    public const PROOF_SUBMITTED_MESSAGE = 'Payment proof submitted. Your Community Admin will review it.';

    public const PROOF_ALREADY_PENDING_MESSAGE = 'Payment proof has already been submitted and is pending verification.';

    public const PROOF_ALREADY_PAID_MESSAGE = 'This bill is already marked as paid.';

    public const PROOF_INACTIVE_MESSAGE = 'This bill is no longer active.';

    public const SHARED_BILLING_REQUIRED_MESSAGE = 'Shared billing is not enabled for this amenity.';

    public const FILE_RULE = 'required|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp';

    /** Approved resident members of the amenity's community, excluding deleted users. */
    public function eligibleResidentIds(int $communityId): array
    {
        return DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.role', 'member')
            ->where('cm.status', 'approved')
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->distinct()
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function normalizeBillingMonth(string $value): string
    {
        $value = trim($value);
        if (preg_match('/^\d{4}-\d{2}$/', $value)) {
            return Carbon::createFromFormat('Y-m', $value)->startOfMonth()->toDateString();
        }

        return Carbon::parse($value)->startOfMonth()->toDateString();
    }

    private function displayBillingMonth(object $row): Carbon
    {
        $bookingId = (int) ($row->booking_id ?? 0);
        $source = ($bookingId > 0 || Carbon::parse((string) $row->billing_month)->year < 2000)
            && ! empty($row->due_date)
            ? $row->due_date
            : $row->billing_month;

        return Carbon::parse((string) $source)->startOfMonth();
    }

    public function hasMonthlyBill(int $amenityId, string $billingMonth): bool
    {
        $query = DB::table('amenity_monthly_bills')
            ->where('amenity_id', $amenityId)
            ->where('billing_month', $this->normalizeBillingMonth($billingMonth));

        if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            $query->where(function ($inner) {
                $inner->whereNull('booking_id')->orWhere('booking_id', 0);
            });
        }

        return $query->exists();
    }

    public function currentBillingPeriod(object $amenity): string
    {
        return ($amenity->shared_billing_frequency ?? 'monthly') === 'yearly'
            ? now()->startOfYear()->toDateString()
            : now()->startOfMonth()->toDateString();
    }

    public function defaultDueDate(object $amenity, string $period): string
    {
        $dueDay = min(max((int) ($amenity->shared_billing_due_day ?? 10), 1), 28);
        $start = Carbon::parse($period)->startOfMonth();
        $due = $start->copy()->day($dueDay);

        if ($due->lt(now()->startOfDay())) {
            $thisMonth = now()->copy()->startOfMonth()->day(min($dueDay, now()->daysInMonth));
            if ($thisMonth->lt(now()->startOfDay())) {
                return now()->toDateString();
            }

            return $thisMonth->toDateString();
        }

        return $due->toDateString();
    }

    /** Auto-create the current shared period bill for every approved resident. */
    public function generateCurrentPeriodBill(object $amenity, int $createdBy, ?Request $request = null): ?array
    {
        if (! ($amenity->shared_billing_enabled ?? false)) {
            return null;
        }

        if (round((float) ($amenity->shared_billing_amount ?? 0), 2) <= 0) {
            return null;
        }

        $period = $this->currentBillingPeriod($amenity);
        if ($this->hasMonthlyBill((int) $amenity->id, $period)) {
            return null;
        }

        $frequency = ($amenity->shared_billing_frequency ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly';
        $label = $frequency === 'yearly'
            ? Carbon::parse($period)->format('Y')
            : Carbon::parse($period)->format('F Y');

        return $this->publishPeriod($amenity, [
            'title' => $amenity->name.' — '.$label,
            'description' => 'Shared '.$frequency.' amenity bill.',
            'amount_per_resident' => (float) ($amenity->shared_billing_amount ?? 0),
            'due_date' => $this->defaultDueDate($amenity, $period),
            'billing_month' => $period,
        ], $createdBy, $request);
    }

    public function generateDueSharedBills(): int
    {
        if (! Schema::hasTable('amenities')) {
            return 0;
        }

        $amenities = DB::table('amenities')
            ->where('shared_billing_enabled', true)
            ->where('review_status', 'approved')
            ->get();

        $created = 0;
        foreach ($amenities as $amenity) {
            $bill = $this->generateCurrentPeriodBill($amenity, (int) ($amenity->created_by ?? 0));
            if ($bill) {
                $created++;
            }
        }

        return $created;
    }

    /** After a paid booking is approved, put the booking bill in the resident amenity-bills list. */
    public function createBookingBill(object $booking, object $amenity, int $authorId, ?Request $request = null): ?array
    {
        $fee = round((float) ($booking->booking_fee ?? $amenity->booking_fee ?? 0), 2);
        if ($fee <= 0 || ($amenity->shared_billing_enabled ?? false)) {
            return null;
        }

        if (Schema::hasColumn('amenity_resident_bills', 'booking_id')
            && DB::table('amenity_resident_bills')->where('booking_id', (int) $booking->id)->exists()) {
            return null;
        }

        $date = Carbon::parse((string) $booking->date);

        return $this->publishPeriod($amenity, [
            'title' => $amenity->name.' booking — '.$date->toFormattedDateString(),
            'description' => 'Booking fee for '.$date->toFormattedDateString()
                .(! empty($booking->time_slot) ? ' ('.$booking->time_slot.')' : '')
                .((int) ($booking->guests ?? 1) > 1 ? ' · '.(int) $booking->guests.' guests' : ''),
            'amount_per_resident' => $fee,
            'due_date' => BillDueDate::notBeforeIssue($date->toDateString()),
            'billing_month' => Carbon::create(1900, 1, 1)->addDays(max(1, (int) $booking->id))->toDateString(),
            'booking_id' => (int) $booking->id,
            'resident_ids' => [(int) $booking->user_id],
        ], $authorId, $request);
    }

    /** Drop unpaid booking-fee bills when the resident cancels the reservation. Paid history is kept. */
    public function withdrawOpenBillsForCancelledBooking(int $bookingId): void
    {
        if ($bookingId < 1 || ! Schema::hasTable('amenity_resident_bills') || ! Schema::hasTable('amenity_monthly_bills')) {
            return;
        }

        $hasResidentBooking = Schema::hasColumn('amenity_resident_bills', 'booking_id');
        $hasMonthlyBooking = Schema::hasColumn('amenity_monthly_bills', 'booking_id');
        if (! $hasResidentBooking && ! $hasMonthlyBooking) {
            return;
        }

        $openStatuses = [
            self::RESIDENT_STATUS_UNPAID,
            self::RESIDENT_STATUS_OVERDUE,
            self::RESIDENT_STATUS_PENDING,
            self::RESIDENT_STATUS_REJECTED,
        ];

        $query = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->whereIn('rb.status', $openStatuses);

        if ($hasResidentBooking) {
            $query->where('rb.booking_id', $bookingId);
        } else {
            $query->where('mb.booking_id', $bookingId);
        }

        $select = ['rb.id', 'rb.monthly_bill_id'];
        if (Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
            $select[] = 'rb.finance_notice_id';
        }
        if (Schema::hasColumn('amenity_monthly_bills', 'finance_notice_id')) {
            $select[] = 'mb.finance_notice_id as monthly_finance_notice_id';
        }

        $rows = $query->get($select);
        if ($rows->isEmpty()) {
            return;
        }

        $monthlyIds = [];
        foreach ($rows as $row) {
            foreach (['finance_notice_id', 'monthly_finance_notice_id'] as $key) {
                $noticeId = (int) ($row->{$key} ?? 0);
                if ($noticeId > 0) {
                    $this->removeFinanceNotice($noticeId);
                }
            }
            $monthlyIds[(int) $row->monthly_bill_id] = true;
        }

        DB::table('amenity_resident_bills')
            ->whereIn('id', $rows->pluck('id')->map(fn ($id) => (int) $id)->all())
            ->delete();

        foreach (array_keys($monthlyIds) as $monthlyBillId) {
            $monthlyBillId = (int) $monthlyBillId;
            if ($monthlyBillId < 1) {
                continue;
            }
            $stillLinked = DB::table('amenity_resident_bills')->where('monthly_bill_id', $monthlyBillId)->exists();
            if ($stillLinked) {
                continue;
            }
            $monthlyBookingId = $hasMonthlyBooking
                ? (int) DB::table('amenity_monthly_bills')->where('id', $monthlyBillId)->value('booking_id')
                : 0;
            if ($monthlyBookingId > 0) {
                DB::table('amenity_monthly_bills')->where('id', $monthlyBillId)->delete();
            }
        }
    }

    /**
     * @param  array{title: string, description?: ?string, amount_per_resident: float|int|string, due_date: string, billing_month: string, booking_id?: int, resident_ids?: list<int>, file_path?: ?string, file_name?: ?string, file_size?: ?int, mime_type?: ?string}  $data
     * @return array<string, mixed>|null
     */
    public function publishPeriod(object $amenity, array $data, int $createdBy, ?Request $request = null): ?array
    {
        BillDueDate::assertOnOrAfterIssue((string) $data['due_date']);
        $data['due_date'] = BillDueDate::toDateString((string) $data['due_date']);

        $bookingId = (int) ($data['booking_id'] ?? 0);
        $isShared = $bookingId < 1;
        $billingMonth = $isShared
            ? $this->normalizeBillingMonth((string) $data['billing_month'])
            : Carbon::parse((string) $data['billing_month'])->toDateString();

        if ($isShared && $this->hasMonthlyBill((int) $amenity->id, $billingMonth)) {
            throw ValidationException::withMessages([
                'billing_month' => self::DUPLICATE_MONTH_MESSAGE,
            ]);
        }

        try {
            $billId = DB::transaction(function () use ($amenity, $data, $billingMonth, $bookingId, $createdBy) {
                $now = now();
                $amount = round((float) $data['amount_per_resident'], 2);
                $payload = [
                    'amenity_id' => (int) $amenity->id,
                    'community_id' => (int) $amenity->community_id,
                    'billing_month' => $billingMonth,
                    'title' => $data['title'],
                    'description' => $data['description'] ?? null,
                    'amount_per_resident' => $amount,
                    'due_date' => $data['due_date'],
                    'file_path' => $data['file_path'] ?? null,
                    'file_name' => $data['file_name'] ?? null,
                    'file_size' => $data['file_size'] ?? null,
                    'mime_type' => $data['mime_type'] ?? null,
                    'status' => self::STATUS_PUBLISHED,
                    'created_by' => $createdBy ?: null,
                    'published_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
                if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
                    $payload['booking_id'] = $bookingId > 0 ? $bookingId : 0;
                }

                $billId = DB::table('amenity_monthly_bills')->insertGetId($payload);
                $residentIds = $data['resident_ids'] ?? $this->eligibleResidentIds((int) $amenity->community_id);
                $rows = [];
                foreach ($residentIds as $userId) {
                    $row = [
                        'monthly_bill_id' => $billId,
                        'amenity_id' => (int) $amenity->id,
                        'community_id' => (int) $amenity->community_id,
                        'user_id' => $userId,
                        'amount' => $amount,
                        'status' => self::RESIDENT_STATUS_UNPAID,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
                        $row['booking_id'] = $bookingId > 0 ? $bookingId : null;
                    }
                    $rows[] = $row;
                }

                if ($rows !== []) {
                    DB::table('amenity_resident_bills')->insert($rows);
                }

                return $billId;
            });
        } catch (QueryException $e) {
            if ($this->isUniqueViolation($e)) {
                throw ValidationException::withMessages([
                    'billing_month' => self::DUPLICATE_MONTH_MESSAGE,
                ]);
            }
            throw $e;
        }

        $bill = $this->findMonthlyBill((int) $billId);
        if (! $bill) {
            return null;
        }

        $residentIds = $data['resident_ids'] ?? $this->eligibleResidentIds((int) $amenity->community_id);
        app(AmenityBillReminderService::class)->notifyPublishedMonthlyBill($bill, (string) $amenity->name);
        $this->publishFinanceNotices($amenity, $bill, $residentIds, $createdBy);

        return $request ? $this->formatAdminBill($bill, $request) : ['id' => (int) $bill->id];
    }

    /**
     * @param  array{title: string, description?: ?string, amount_per_resident: float|int|string, due_date: string, billing_month: string}  $data
     * @return array<string, mixed>
     */
    public function publish(object $amenity, array $data, UploadedFile $file, int $createdBy, Request $request): array
    {
        if (! ($amenity->shared_billing_enabled ?? false)) {
            throw ValidationException::withMessages([
                'amenity' => self::SHARED_BILLING_REQUIRED_MESSAGE,
            ]);
        }

        $billingMonth = $this->normalizeBillingMonth((string) $data['billing_month']);

        if ($this->hasMonthlyBill((int) $amenity->id, $billingMonth)) {
            throw ValidationException::withMessages([
                'billing_month' => self::DUPLICATE_MONTH_MESSAGE,
            ]);
        }

        $fileMeta = $this->storeBillFile($file, (int) $amenity->community_id, (int) $amenity->id);

        try {
            $formatted = $this->publishPeriod($amenity, [
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'amount_per_resident' => $data['amount_per_resident'],
                'due_date' => $data['due_date'],
                'billing_month' => $billingMonth,
                'file_path' => $fileMeta['file_path'],
                'file_name' => $fileMeta['file_name'],
                'file_size' => $fileMeta['file_size'],
                'mime_type' => $fileMeta['mime_type'],
            ], $createdBy, $request);
        } catch (\Throwable $e) {
            $this->deleteStoredFile($fileMeta['file_path'] ?? null);
            throw $e;
        }

        abort_if(! $formatted, 500, 'Monthly bill could not be loaded after publish.');

        return $formatted;
    }

    public function countCommunityAdminReviewablePendingPayments(int $communityId, int $viewerId): int
    {
        return (int) $this->communityAdminReviewablePendingPaymentQuery($communityId, $viewerId)->count();
    }

    /** @return list<object> */
    public function communityAdminReviewablePendingPaymentRows(int $communityId, int $viewerId, int $limit = 10): array
    {
        return $this->communityAdminReviewablePendingPaymentQuery($communityId, $viewerId)
            ->orderByDesc('rb.proof_submitted_at')
            ->orderByDesc('rb.id')
            ->limit($limit)
            ->get()
            ->all();
    }

    public function listCommunityResidentBills(int $communityId, Request $request): array
    {
        app(AmenityBillReminderService::class)->markOverdue();

        $query = $this->applyCommunityAdminBookingPaymentVisibility($this->communityResidentBillQuery($communityId));
        $status = trim((string) $request->query('status', 'all'));
        if ($status !== '' && $status !== 'all') {
            abort_unless(in_array($status, [
                self::RESIDENT_STATUS_UNPAID,
                self::RESIDENT_STATUS_PENDING,
                self::RESIDENT_STATUS_PAID,
                self::RESIDENT_STATUS_REJECTED,
                self::RESIDENT_STATUS_OVERDUE,
            ], true), 422, 'Invalid payment status filter.');
            $query->where('rb.status', $status);
        }

        return $query
            ->orderByRaw("CASE rb.status
                WHEN '".self::RESIDENT_STATUS_PENDING."' THEN 0
                WHEN '".self::RESIDENT_STATUS_OVERDUE."' THEN 1
                WHEN '".self::RESIDENT_STATUS_REJECTED."' THEN 2
                WHEN '".self::RESIDENT_STATUS_UNPAID."' THEN 3
                ELSE 4 END")
            ->orderByDesc('mb.billing_month')
            ->orderBy('users.name')
            ->get()
            ->map(fn ($row) => $this->formatAdminResidentBill(
                $row,
                $request,
                $this->viewerMayReviewBookingPayment($row, $request),
            ))
            ->all();
    }

    public function listOwnerResidentBills(int $communityId, int $ownerId, Request $request): array
    {
        app(AmenityBillReminderService::class)->markOverdue();

        $query = $this->applyExcludeInactiveBookingBills(
            $this->communityResidentBillQuery($communityId)->where('a.created_by', $ownerId),
        );
        $status = trim((string) $request->query('status', 'all'));
        if ($status !== '' && $status !== 'all') {
            abort_unless(in_array($status, [
                self::RESIDENT_STATUS_UNPAID,
                self::RESIDENT_STATUS_PENDING,
                self::RESIDENT_STATUS_PAID,
                self::RESIDENT_STATUS_REJECTED,
                self::RESIDENT_STATUS_OVERDUE,
            ], true), 422, 'Invalid payment status filter.');
            $query->where('rb.status', $status);
        }

        return $query
            ->orderByRaw("CASE rb.status
                WHEN '".self::RESIDENT_STATUS_PENDING."' THEN 0
                WHEN '".self::RESIDENT_STATUS_OVERDUE."' THEN 1
                WHEN '".self::RESIDENT_STATUS_REJECTED."' THEN 2
                WHEN '".self::RESIDENT_STATUS_UNPAID."' THEN 3
                ELSE 4 END")
            ->orderByDesc('mb.billing_month')
            ->orderBy('users.name')
            ->get()
            ->map(fn ($row) => $this->formatAdminResidentBill($row, $request, true))
            ->all();
    }

    public function listAdminBills(int $amenityId, Request $request): array
    {
        app(AmenityBillReminderService::class)->markOverdue($amenityId);

        $rows = DB::table('amenity_monthly_bills')
            ->where('amenity_id', $amenityId)
            ->orderByDesc('billing_month')
            ->orderByDesc('id')
            ->get();

        $this->attachResidentCounts($rows);

        return $rows->map(fn ($row) => $this->formatAdminBill($row, $request))->all();
    }

    public function listResidentBills(int $amenityId, int $userId, Request $request): array
    {
        $reminders = app(AmenityBillReminderService::class);
        $reminders->markOverdue($amenityId, $userId);
        $restricted = $reminders->hasOverdueSharedAmenityBill($amenityId, $userId);

        $rows = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'mb.amenity_id')
            ->where('rb.amenity_id', $amenityId)
            ->where('rb.user_id', $userId)
            ->where('mb.status', self::STATUS_PUBLISHED)
            ->orderByDesc('mb.billing_month')
            ->orderByDesc('mb.id')
            ->select([
                'mb.id',
                'mb.amenity_id',
                'mb.community_id',
                'mb.billing_month',
                'mb.title',
                'mb.description',
                'mb.amount_per_resident',
                'mb.due_date',
                'mb.file_path',
                'mb.file_name',
                'mb.file_size',
                'mb.mime_type',
                'mb.status as monthly_status',
                'mb.published_at',
                'mb.created_at',
                'a.name as amenity_name',
                'rb.id as resident_bill_id',
                'rb.amount as resident_amount',
                'rb.status as resident_status',
                'rb.proof_file_path',
                'rb.proof_file_name',
                'rb.proof_file_size',
                'rb.proof_mime_type',
                'rb.payment_date',
                'rb.payment_reference',
                'rb.payment_note',
                'rb.proof_submitted_at',
                'rb.proof_submitted_by',
                'rb.approved_by',
                'rb.approved_at',
                'rb.rejected_by',
                'rb.rejected_at',
                'rb.rejection_reason',
            ])
            ->get();

        return $rows->map(function ($row) use ($request, $reminders, $restricted, $amenityId, $userId) {
            $formatted = $this->formatResidentBill($row, $request);
            $previous = $reminders->outstandingPreviousBill(
                $amenityId,
                $userId,
                Carbon::parse((string) $row->billing_month)->startOfMonth()->toDateString(),
            );
            $formatted['has_overdue_shared_amenity_bill'] = $restricted;
            $formatted['has_outstanding_previous_bill'] = $previous !== null;
            $formatted['outstanding_previous_bill'] = $previous;

            return $formatted;
        })->all();
    }

    /** Finance notices on Home: publish for open bills, hide when paid. */
    public function backfillFinanceNoticesForResident(int $communityId, int $userId): void
    {
        if ($communityId < 1 || $userId < 1) {
            return;
        }

        $this->reconcilePaidAmenityBillNotices($communityId, $userId);

        if (! Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
            return;
        }

        $openStatuses = [
            self::RESIDENT_STATUS_UNPAID,
            self::RESIDENT_STATUS_OVERDUE,
            self::RESIDENT_STATUS_REJECTED,
            self::RESIDENT_STATUS_PENDING,
        ];

        $rows = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->where('rb.community_id', $communityId)
            ->where('rb.user_id', $userId)
            ->where('mb.status', self::STATUS_PUBLISHED)
            ->whereIn('rb.status', $openStatuses)
            ->where(function ($query) {
                $query->whereNull('rb.finance_notice_id')
                    ->orWhere('rb.finance_notice_id', 0);
            })
            ->select('mb.id as monthly_bill_id', 'rb.user_id')
            ->get()
            ->groupBy('monthly_bill_id');

        foreach ($rows as $monthlyBillId => $group) {
            $monthlyBill = DB::table('amenity_monthly_bills')->find((int) $monthlyBillId);
            if (! $monthlyBill) {
                continue;
            }
            $amenity = DB::table('amenities')->find((int) $monthlyBill->amenity_id);
            if (! $amenity) {
                continue;
            }
            $residentIds = $group->pluck('user_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
            if ($residentIds === []) {
                continue;
            }
            $this->publishFinanceNotices(
                $amenity,
                $monthlyBill,
                $residentIds,
                (int) ($monthlyBill->created_by ?? $userId),
            );
        }
    }

    private function reconcilePaidAmenityBillNotices(int $communityId, int $userId): void
    {
        if (! Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
            return;
        }

        $paid = DB::table('amenity_resident_bills')
            ->where('community_id', $communityId)
            ->where('user_id', $userId)
            ->where('status', self::RESIDENT_STATUS_PAID)
            ->whereNotNull('finance_notice_id')
            ->where('finance_notice_id', '>', 0)
            ->get();

        foreach ($paid as $bill) {
            $noticeId = (int) $bill->finance_notice_id;
            $stillRecipient = DB::table('notice_recipients')
                ->where('notice_id', $noticeId)
                ->where('user_id', $userId)
                ->exists();
            if ($stillRecipient) {
                $this->hideFinanceNoticeForResident($noticeId, $userId);
            }
        }
    }

    /** All published shared amenity bills for the signed-in resident across amenities. */
    public function listMyResidentBills(int $communityId, int $userId, Request $request): array
    {
        $this->backfillFinanceNoticesForResident($communityId, $userId);

        $reminders = app(AmenityBillReminderService::class);
        $reminders->markOverdue(userId: $userId);

        $rows = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'mb.amenity_id')
            ->where('rb.community_id', $communityId)
            ->where('rb.user_id', $userId)
            ->where('mb.status', self::STATUS_PUBLISHED)
            ->orderByDesc('mb.billing_month')
            ->orderByDesc('mb.id')
            ->select([
                'mb.id',
                'mb.amenity_id',
                'mb.community_id',
                'mb.billing_month',
                'mb.title',
                'mb.description',
                'mb.amount_per_resident',
                'mb.due_date',
                'mb.file_path',
                'mb.file_name',
                'mb.file_size',
                'mb.mime_type',
                'mb.status as monthly_status',
                'mb.published_at',
                'mb.created_at',
                'a.name as amenity_name',
                'a.icon_key as amenity_icon_key',
                'rb.id as resident_bill_id',
                'rb.amount as resident_amount',
                'rb.status as resident_status',
                'rb.proof_file_path',
                'rb.proof_file_name',
                'rb.proof_file_size',
                'rb.proof_mime_type',
                'rb.payment_date',
                'rb.payment_reference',
                'rb.payment_note',
                'rb.proof_submitted_at',
                'rb.proof_submitted_by',
                'rb.approved_by',
                'rb.approved_at',
                'rb.rejected_by',
                'rb.rejected_at',
                'rb.rejection_reason',
            ]);

        if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            $rows->addSelect('rb.booking_id');
        }
        if (Schema::hasColumn('amenity_resident_bills', 'payment_method')) {
            $rows->addSelect('rb.payment_method');
        }

        $this->applyExcludeInactiveBookingBills($rows);

        $rows = $rows->get();

        $restrictedIds = $reminders->restrictedAmenityIds(
            $userId,
            $rows->pluck('amenity_id')->map(fn ($id) => (int) $id)->unique()->values()->all(),
        );

        return $rows->map(function ($row) use ($request, $reminders, $restrictedIds, $userId) {
            $amenityId = (int) $row->amenity_id;
            $formatted = $this->formatResidentBill($row, $request);
            $formatted['amenity_icon_key'] = $row->amenity_icon_key ?? null;
            $previous = $reminders->outstandingPreviousBill(
                $amenityId,
                $userId,
                Carbon::parse((string) $row->billing_month)->startOfMonth()->toDateString(),
            );
            $formatted['has_overdue_shared_amenity_bill'] = in_array($amenityId, $restrictedIds, true);
            $formatted['has_outstanding_previous_bill'] = $previous !== null;
            $formatted['outstanding_previous_bill'] = $previous;

            return $formatted;
        })->all();
    }

    /** Notify approved residents when a shared-billing amenity is published. */
    public function notifySharedAmenityCreated(object $amenity, int $authorId): void
    {
        if (! ($amenity->shared_billing_enabled ?? false)) {
            return;
        }

        $residentIds = $this->eligibleResidentIds((int) $amenity->community_id);
        if ($residentIds === []) {
            return;
        }

        $amount = number_format((float) ($amenity->shared_billing_amount ?? 0), 2);
        $dueDay = (int) ($amenity->shared_billing_due_day ?? 0);
        $frequency = ($amenity->shared_billing_frequency ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly';
        $title = 'New shared amenity: '.$amenity->name;
        $body = trim(
            ($amenity->description ? (string) $amenity->description."\n\n" : '')
            .'Shared '.$frequency.' billing is enabled for this amenity.'."\n"
            .'Amount per resident: $'.$amount."\n"
            .'Due day each '.($frequency === 'yearly' ? 'year' : 'month').': '.$dueDay."\n\n"
            .'You must keep this '.$frequency.' bill paid to book the amenity.'
        );

        $noticeId = null;
        try {
            $noticeId = DB::table('notices')->insertGetId([
                'community_id' => (int) $amenity->community_id,
                'author_id' => $authorId ?: (int) ($residentIds[0] ?? 0),
                'title' => mb_substr($title, 0, 200),
                'category' => 'finance',
                'body' => $body,
                'status' => 'published',
                'review_status' => 'approved',
                'is_global' => false,
                'audience_type' => 'selected',
                'published_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $now = now();
            DB::table('notice_recipients')->insert(array_map(fn ($userId) => [
                'notice_id' => $noticeId,
                'user_id' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ], $residentIds));
        } catch (\Throwable) {
            // Notice schema can vary; notifications below still go out.
        }

        $actionUrl = $noticeId
            ? '/screens/notice-detail?id='.$noticeId
            : '/screens/property-management/amenity-bills';

        foreach ($residentIds as $userId) {
            NotificationService::send(
                (int) $userId,
                'info',
                $title,
                'Shared '.$frequency.' bill $'.$amount.' (due day '.$dueDay.'). Keep this paid to book '.$amenity->name.'.',
                $actionUrl,
                [
                    'kind' => 'shared_amenity_created',
                    'amenity_id' => (int) $amenity->id,
                    'notice_id' => $noticeId,
                    'shared_billing_amount' => (float) ($amenity->shared_billing_amount ?? 0),
                    'shared_billing_due_day' => $dueDay,
                ],
            );
        }
    }

    public function findMonthlyBill(int $id): ?object
    {
        $row = DB::table('amenity_monthly_bills')->where('id', $id)->first();
        if (! $row) {
            return null;
        }

        $this->attachResidentCounts(collect([$row]));

        return $row;
    }

    public function findBillForNotice(int $noticeId, int $userId): ?array
    {
        if ($noticeId < 1 || $userId < 1 || ! Schema::hasTable('amenity_resident_bills')) {
            return null;
        }

        $query = $this->noticeBillBaseQuery($userId);
        $hasResidentNotice = Schema::hasColumn('amenity_resident_bills', 'finance_notice_id');
        $hasMonthlyNotice = Schema::hasColumn('amenity_monthly_bills', 'finance_notice_id');

        if ($hasResidentNotice || $hasMonthlyNotice) {
            $query->where(function ($inner) use ($noticeId, $hasResidentNotice, $hasMonthlyNotice) {
                if ($hasMonthlyNotice) {
                    $inner->where('mb.finance_notice_id', $noticeId);
                }
                if ($hasResidentNotice) {
                    if ($hasMonthlyNotice) {
                        $inner->orWhere('rb.finance_notice_id', $noticeId);
                    } else {
                        $inner->where('rb.finance_notice_id', $noticeId);
                    }
                }
            });

            $row = $query->first();
            if ($row) {
                return $this->formatNoticeBill($row);
            }
        }

        return null;
    }

    private function noticeBillBaseQuery(int $userId)
    {
        return DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->where('rb.user_id', $userId)
            ->select([
                'rb.id as resident_bill_id',
                'rb.amenity_id',
                'rb.amount',
                'rb.status',
                'mb.billing_month',
                'mb.due_date',
                'a.name as amenity_name',
            ]);
    }

    /** @return array<string, mixed> */
    private function formatNoticeBill(object $row): array
    {
        $month = $this->displayBillingMonth($row);

        return [
            'id' => (int) $row->resident_bill_id,
            'resident_bill_id' => (int) $row->resident_bill_id,
            'amenity_id' => (int) $row->amenity_id,
            'amenity_name' => $row->amenity_name,
            'billing_month' => $month->format('Y-m'),
            'billing_month_label' => $month->format('F Y'),
            'amount' => $row->amount !== null ? (float) $row->amount : null,
            'due_date' => ! empty($row->due_date) ? Carbon::parse((string) $row->due_date)->toDateString() : null,
            'status' => (string) $row->status,
            'status_label' => $this->statusLabel((string) $row->status),
        ];
    }

    /** @param  \Illuminate\Support\Collection<int, object>  $rows */
    private function attachResidentCounts($rows): void
    {
        $ids = $rows->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($ids === []) {
            return;
        }

        $counts = DB::table('amenity_resident_bills')
            ->whereIn('monthly_bill_id', $ids)
            ->selectRaw(
                'monthly_bill_id, COUNT(*) as resident_count,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as unpaid_count,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as overdue_count,
                COALESCE(SUM(amount), 0) as total_amount_expected,
                COALESCE(SUM(CASE WHEN status = ? THEN amount ELSE 0 END), 0) as total_amount_paid',
                [
                    self::RESIDENT_STATUS_UNPAID,
                    self::RESIDENT_STATUS_PENDING,
                    self::RESIDENT_STATUS_PAID,
                    self::RESIDENT_STATUS_REJECTED,
                    self::RESIDENT_STATUS_OVERDUE,
                    self::RESIDENT_STATUS_PAID,
                ]
            )
            ->groupBy('monthly_bill_id')
            ->get()
            ->keyBy('monthly_bill_id');

        foreach ($rows as $row) {
            $stats = $counts->get($row->id);
            $row->resident_count = (int) ($stats->resident_count ?? 0);
            $row->unpaid_count = (int) ($stats->unpaid_count ?? 0);
            $row->pending_count = (int) ($stats->pending_count ?? 0);
            $row->paid_count = (int) ($stats->paid_count ?? 0);
            $row->rejected_count = (int) ($stats->rejected_count ?? 0);
            $row->overdue_count = (int) ($stats->overdue_count ?? 0);
            $row->total_amount_expected = round((float) ($stats->total_amount_expected ?? 0), 2);
            $row->total_amount_paid = round((float) ($stats->total_amount_paid ?? 0), 2);
            $row->outstanding_amount = round($row->total_amount_expected - $row->total_amount_paid, 2);
        }
    }

    /** @return array<string, mixed> */
    public function formatAdminBill(object $row, Request $request): array
    {
        return array_merge($this->formatBillCore($row, $request), [
            'resident_count' => (int) ($row->resident_count ?? 0),
            'unpaid_count' => (int) ($row->unpaid_count ?? 0),
            'pending_count' => (int) ($row->pending_count ?? 0),
            'paid_count' => (int) ($row->paid_count ?? 0),
            'rejected_count' => (int) ($row->rejected_count ?? 0),
            'overdue_count' => (int) ($row->overdue_count ?? 0),
            'total_residents_billed' => (int) ($row->resident_count ?? 0),
            'total_amount_expected' => (float) ($row->total_amount_expected ?? 0),
            'total_amount_paid' => (float) ($row->total_amount_paid ?? 0),
            'outstanding_amount' => (float) ($row->outstanding_amount ?? 0),
            'status' => $row->status ?? self::STATUS_PUBLISHED,
            'created_by' => $row->created_by !== null ? (int) $row->created_by : null,
            'published_at' => $row->published_at ?? null,
        ]);
    }

    /** @return array<string, mixed> */
    public function formatResidentBill(object $row, Request $request): array
    {
        $status = (string) ($row->resident_status ?? self::RESIDENT_STATUS_UNPAID);

        return array_merge($this->formatBillCore($row, $request), [
            'resident_bill_id' => (int) $row->resident_bill_id,
            'amenity_name' => $row->amenity_name ?? null,
            'amount' => (float) ($row->resident_amount ?? $row->amount_per_resident),
            'status' => $status,
            'status_label' => $this->statusLabel($status),
            'can_submit_proof' => in_array($status, [
                self::RESIDENT_STATUS_UNPAID,
                self::RESIDENT_STATUS_REJECTED,
                self::RESIDENT_STATUS_OVERDUE,
            ], true),
            'booking_id' => isset($row->booking_id) && $row->booking_id !== null ? (int) $row->booking_id : null,
            'payment_method' => $row->payment_method ?? null,
            'ach_status' => $row->ach_status ?? null,
            'plaid_transfer_id' => $row->plaid_transfer_id ?? null,
            'payment_proof' => $this->formatPaymentProof($row, $request),
            'rejection_reason' => in_array($status, [self::RESIDENT_STATUS_REJECTED, self::RESIDENT_STATUS_OVERDUE], true)
                ? ($row->rejection_reason ?? null)
                : null,
            'paid_at' => $status === self::RESIDENT_STATUS_PAID ? ($row->approved_at ?? null) : null,
            'approved_at' => $row->approved_at ?? null,
            'rejected_at' => $row->rejected_at ?? null,
            'payment_acknowledgement' => $this->formatPaymentAcknowledgement($row, $status),
            'online_payment' => app(\App\Services\Payments\OnlinePaymentPresenter::class)->forPayable(
                \App\Models\PaymentAttempt::PAYABLE_AMENITY_BILL,
                (int) $row->resident_bill_id,
                (int) ($row->community_id ?? 0),
            ),
        ]);
    }

    /**
     * Settles a resident bill from a confirmed KuickPay payment. Runs the same
     * follow-ups as an admin approval (notice hidden, booking confirmed).
     */
    public function applyOnlinePayment(int $residentBillId, \App\Models\PaymentAttempt $attempt): bool
    {
        $applied = DB::transaction(function () use ($residentBillId, $attempt) {
            $bill = DB::table('amenity_resident_bills')->where('id', $residentBillId)->lockForUpdate()->first();
            if (! $bill || ($bill->status ?? '') === self::RESIDENT_STATUS_PAID) {
                return false;
            }

            $now = now();
            DB::table('amenity_resident_bills')->where('id', $residentBillId)->update([
                'status' => self::RESIDENT_STATUS_PAID,
                'payment_method' => 'kuickpay',
                'payment_attempt_id' => $attempt->id,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $attempt->reference,
                'payment_note' => 'Paid online with KuickPay'.($attempt->methodLabel() ? ' ('.$attempt->methodLabel().')' : '').'.',
                'proof_submitted_at' => $now,
                'proof_submitted_by' => (int) $attempt->user_id,
                'approved_at' => $now,
                'approved_by' => null,
                'rejected_at' => null,
                'rejected_by' => null,
                'rejection_reason' => null,
                'updated_at' => $now,
            ]);

            $this->writeReview([
                'resident_bill_id' => $residentBillId,
                'monthly_bill_id' => (int) $bill->monthly_bill_id,
                'amenity_id' => (int) $bill->amenity_id,
                'community_id' => (int) $bill->community_id,
                'user_id' => (int) $bill->user_id,
                'action' => 'paid_online',
                'actor_id' => (int) $attempt->user_id,
                'status_from' => (string) ($bill->status ?? self::RESIDENT_STATUS_UNPAID),
                'status_to' => self::RESIDENT_STATUS_PAID,
                'proof_file_path' => null,
                'proof_file_name' => null,
                'proof_file_size' => null,
                'proof_mime_type' => null,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $attempt->reference,
                'payment_note' => 'Paid online with KuickPay',
                'rejection_reason' => null,
            ]);

            return (int) $bill->amenity_id;
        });

        if (! $applied) {
            return false;
        }

        $updated = $this->findAdminResidentBill((int) $applied, $residentBillId);
        if ($updated) {
            $this->hideFinanceNoticeFromHome($updated);
            $this->confirmAwaitingPaymentBooking($updated);
        }

        return true;
    }

    public function findOwnedResidentBill(int $amenityId, int $residentBillId, int $userId): ?object
    {
        return DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->where('rb.id', $residentBillId)
            ->where('rb.amenity_id', $amenityId)
            ->where('rb.user_id', $userId)
            ->select([
                'mb.id',
                'mb.amenity_id',
                'mb.community_id',
                'mb.billing_month',
                'mb.title',
                'mb.description',
                'mb.amount_per_resident',
                'mb.due_date',
                'mb.file_path',
                'mb.file_name',
                'mb.file_size',
                'mb.mime_type',
                'mb.status as monthly_status',
                'mb.published_at',
                'mb.created_at',
                'a.name as amenity_name',
                'rb.id as resident_bill_id',
                'rb.user_id',
                'rb.amount as resident_amount',
                'rb.status as resident_status',
                'rb.payment_method',
                'rb.plaid_transfer_id',
                'rb.ach_status',
                'rb.proof_file_path',
                'rb.proof_file_name',
                'rb.proof_file_size',
                'rb.proof_mime_type',
                'rb.payment_date',
                'rb.payment_reference',
                'rb.payment_note',
                'rb.proof_submitted_at',
                'rb.proof_submitted_by',
                'rb.approved_by',
                'rb.approved_at',
                'rb.rejected_by',
                'rb.rejected_at',
                'rb.rejection_reason',
            ])
            ->first();
    }

    public function listAdminResidentBills(int $amenityId, int $monthlyBillId, Request $request): array
    {
        app(AmenityBillReminderService::class)->markOverdue($amenityId);

        $exists = DB::table('amenity_monthly_bills')
            ->where('id', $monthlyBillId)
            ->where('amenity_id', $amenityId)
            ->exists();
        abort_if(! $exists, 404, 'Monthly bill not found.');

        $query = $this->adminResidentBillQuery($amenityId)
            ->where('rb.monthly_bill_id', $monthlyBillId);

        $status = trim((string) $request->query('status', 'all'));
        if ($status !== '' && $status !== 'all') {
            abort_unless(in_array($status, [
                self::RESIDENT_STATUS_UNPAID,
                self::RESIDENT_STATUS_PENDING,
                self::RESIDENT_STATUS_PAID,
                self::RESIDENT_STATUS_REJECTED,
                self::RESIDENT_STATUS_OVERDUE,
            ], true), 422, 'Invalid payment status filter.');
            $query->where('rb.status', $status);
        }

        $rows = $query
            ->orderByRaw("CASE rb.status
                WHEN '".self::RESIDENT_STATUS_PENDING."' THEN 0
                WHEN '".self::RESIDENT_STATUS_OVERDUE."' THEN 1
                WHEN '".self::RESIDENT_STATUS_REJECTED."' THEN 2
                WHEN '".self::RESIDENT_STATUS_UNPAID."' THEN 3
                ELSE 4 END")
            ->orderBy('users.name')
            ->get();

        return $rows->map(fn ($row) => $this->formatAdminResidentBill($row, $request))->all();
    }

    public function findAdminResidentBill(int $amenityId, int $residentBillId): ?object
    {
        return $this->adminResidentBillQuery($amenityId)
            ->where('rb.id', $residentBillId)
            ->first();
    }

    public function findOwnerResidentBill(int $amenityId, int $residentBillId, int $ownerId): ?object
    {
        $ownsAmenity = DB::table('amenities')
            ->where('id', $amenityId)
            ->where('created_by', $ownerId)
            ->exists();

        if (! $ownsAmenity) {
            return null;
        }

        return $this->findAdminResidentBill($amenityId, $residentBillId);
    }

    /** @return array<string, mixed> */
    public function approveResidentPayment(object $bill, int $adminId, Request $request): array
    {
        $this->reviewResidentPayment($bill, $adminId, self::ACTION_APPROVED, self::RESIDENT_STATUS_PAID);

        $updated = $this->findAdminResidentBill((int) $bill->amenity_id, (int) $bill->resident_bill_id);
        abort_if(! $updated, 500, 'Payment could not be loaded after approval.');

        $formatted = $this->formatAdminResidentBill($updated, $request);
        $this->hideFinanceNoticeFromHome($updated);
        $this->confirmAwaitingPaymentBooking($updated);
        $ack = $formatted['payment_acknowledgement'] ?? null;
        if ($ack) {
            NotificationService::send(
                (int) $updated->user_id,
                'success',
                'Payment received',
                (string) $ack['message'],
                '/screens/property-management/amenity-bills',
                [
                    'kind' => 'amenity_bill_acknowledged',
                    'amenity_id' => (int) $updated->amenity_id,
                    'resident_bill_id' => (int) $updated->resident_bill_id,
                    'monthly_bill_id' => (int) $updated->monthly_bill_id,
                ],
            );
        }
        app(PaymentMailService::class)->amenityBill((int) $updated->resident_bill_id, 'approved');

        return $formatted;
    }

    public function acknowledgementMessage(string $amenityName, string $billingMonth): string
    {
        $month = Carbon::parse($billingMonth)->startOfMonth()->format('F Y');

        return sprintf(self::ACKNOWLEDGED_MESSAGE, $amenityName, $month);
    }

    public function listAdminReviews(int $amenityId, int $residentBillId, Request $request): array
    {
        $bill = $this->findAdminResidentBill($amenityId, $residentBillId);
        abort_if(! $bill, 404, 'Bill not found.');

        $rows = DB::table('amenity_resident_bill_reviews as r')
            ->leftJoin('users as actor', 'actor.id', '=', 'r.actor_id')
            ->where('r.resident_bill_id', $residentBillId)
            ->where('r.amenity_id', $amenityId)
            ->orderBy('r.created_at')
            ->orderBy('r.id')
            ->select([
                'r.id',
                'r.action',
                'r.actor_id',
                'actor.name as actor_name',
                'r.status_from',
                'r.status_to',
                'r.proof_file_path',
                'r.proof_file_name',
                'r.proof_file_size',
                'r.proof_mime_type',
                'r.payment_date',
                'r.payment_reference',
                'r.payment_note',
                'r.rejection_reason',
                'r.created_at',
            ])
            ->get();

        return $rows->map(function ($row) use ($request) {
            return [
                'id' => (int) $row->id,
                'action' => $row->action,
                'action_label' => match ((string) $row->action) {
                    self::ACTION_SUBMITTED => 'Proof submitted',
                    self::ACTION_APPROVED => 'Approved',
                    self::ACTION_REJECTED => 'Rejected',
                    self::ACTION_ACH_SUBMITTED => 'Bank payment started',
                    self::ACTION_ACH_POSTED => 'Paid by bank',
                    self::ACTION_ACH_FAILED => 'Bank payment failed',
                    self::ACTION_ACH_REFUNDED => 'Bank payment refunded',
                    default => ucfirst((string) $row->action),
                },
                'actor_id' => $row->actor_id !== null ? (int) $row->actor_id : null,
                'actor_name' => $row->actor_name ?? null,
                'status_from' => $row->status_from,
                'status_from_label' => $row->status_from ? $this->statusLabel((string) $row->status_from) : null,
                'status_to' => $row->status_to,
                'status_to_label' => $row->status_to ? $this->statusLabel((string) $row->status_to) : null,
                'proof' => $this->formatPaymentProof($row, $request),
                'rejection_reason' => $row->rejection_reason,
                'created_at' => $row->created_at,
            ];
        })->all();
    }

    /** @return array<string, mixed> */
    public function rejectResidentPayment(object $bill, int $adminId, string $reason, Request $request): array
    {
        $this->reviewResidentPayment($bill, $adminId, self::ACTION_REJECTED, self::RESIDENT_STATUS_REJECTED, $reason);
        app(AmenityBillReminderService::class)->markOverdue((int) $bill->amenity_id, (int) $bill->user_id);

        $updated = $this->findAdminResidentBill((int) $bill->amenity_id, (int) $bill->resident_bill_id);
        abort_if(! $updated, 500, 'Payment could not be loaded after rejection.');
        app(PaymentMailService::class)->amenityBill((int) $bill->resident_bill_id, 'rejected');

        return $this->formatAdminResidentBill($updated, $request);
    }

    public function requestClarification(object $bill, int $adminId, string $message, Request $request): array
    {
        $this->reviewResidentPayment($bill, $adminId, self::ACTION_CLARIFICATION, self::RESIDENT_STATUS_REJECTED, $message);
        $updated = $this->findAdminResidentBill((int) $bill->amenity_id, (int) $bill->resident_bill_id);
        abort_if(! $updated, 500, 'Payment could not be loaded after the request.');
        NotificationService::send(
            (int) $updated->user_id,
            'warning',
            'More information needed',
            'Your community asked for a clearer payment receipt: '.$message,
            '/screens/property-management/amenity-bills',
            ['kind' => 'amenity_bill_clarification', 'bill_id' => (int) $updated->resident_bill_id],
        );

        return $this->formatAdminResidentBill($updated, $request);
    }

    public function resolveRejectionReason(string $code, ?string $customReason): string
    {
        if (! array_key_exists($code, self::REJECTION_REASONS)) {
            throw ValidationException::withMessages([
                'rejection_code' => 'Select a valid rejection reason.',
            ]);
        }

        if ($code === 'other') {
            $custom = trim((string) $customReason);
            if ($custom === '') {
                throw ValidationException::withMessages([
                    'rejection_reason' => 'Enter a rejection reason.',
                ]);
            }

            return mb_substr($custom, 0, 500);
        }

        return self::REJECTION_REASONS[$code];
    }

    /**
     * @param  array{payment_date: string, payment_reference?: ?string, payment_note?: ?string}  $data
     * @return array<string, mixed>
     */
    public function submitPaymentProof(object $ownedBill, UploadedFile $file, array $data, Request $request): array
    {
        if (($ownedBill->monthly_status ?? null) !== self::STATUS_PUBLISHED) {
            throw ValidationException::withMessages([
                'file' => self::PROOF_INACTIVE_MESSAGE,
            ]);
        }

        $this->assertCanSubmitProof((string) ($ownedBill->resident_status ?? ''));
        app(\App\Services\Payments\OnlinePaymentPresenter::class)->assertNoPaymentInFlight(
            \App\Models\PaymentAttempt::PAYABLE_AMENITY_BILL,
            (int) $ownedBill->resident_bill_id,
        );

        $fileMeta = $this->storeProofFile(
            $file,
            (int) $ownedBill->community_id,
            (int) $ownedBill->amenity_id,
            (int) $ownedBill->resident_bill_id,
        );

        try {
            DB::transaction(function () use ($ownedBill, $data, $fileMeta) {
                $locked = DB::table('amenity_resident_bills')
                    ->where('id', (int) $ownedBill->resident_bill_id)
                    ->where('user_id', (int) $ownedBill->user_id)
                    ->lockForUpdate()
                    ->first();

                abort_if(! $locked, 404, 'Bill not found.');

                $this->assertCanSubmitProof((string) ($locked->status ?? ''));

                $now = now();
                $statusFrom = (string) $locked->status;

                DB::table('amenity_resident_bills')
                    ->where('id', (int) $ownedBill->resident_bill_id)
                    ->update([
                        'status' => self::RESIDENT_STATUS_PENDING,
                        'proof_file_path' => $fileMeta['file_path'],
                        'proof_file_name' => $fileMeta['file_name'],
                        'proof_file_size' => $fileMeta['file_size'],
                        'proof_mime_type' => $fileMeta['mime_type'],
                        'payment_date' => $data['payment_date'],
                        'payment_reference' => $data['payment_reference'] ?? null,
                        'payment_bank' => $data['payment_bank'] ?? null,
                        'payment_note' => $data['payment_note'] ?? null,
                        'proof_submitted_at' => $now,
                        'proof_submitted_by' => (int) $ownedBill->user_id,
                        'approved_by' => null,
                        'approved_at' => null,
                        'rejected_by' => null,
                        'rejected_at' => null,
                        'rejection_reason' => null,
                        'updated_at' => $now,
                    ]);

                $this->writeReview([
                    'resident_bill_id' => (int) $locked->id,
                    'monthly_bill_id' => (int) $locked->monthly_bill_id,
                    'amenity_id' => (int) $locked->amenity_id,
                    'community_id' => (int) $locked->community_id,
                    'user_id' => (int) $locked->user_id,
                    'action' => self::ACTION_SUBMITTED,
                    'actor_id' => (int) $ownedBill->user_id,
                    'status_from' => $statusFrom,
                    'status_to' => self::RESIDENT_STATUS_PENDING,
                    'proof_file_path' => $fileMeta['file_path'],
                    'proof_file_name' => $fileMeta['file_name'],
                    'proof_file_size' => $fileMeta['file_size'],
                    'proof_mime_type' => $fileMeta['mime_type'],
                    'payment_date' => $data['payment_date'],
                    'payment_reference' => $data['payment_reference'] ?? null,
                    'payment_note' => $data['payment_note'] ?? null,
                    'rejection_reason' => null,
                ]);
            });
        } catch (\Throwable $e) {
            $this->deleteStoredFile($fileMeta['file_path'] ?? null);
            throw $e;
        }

        $updated = $this->findOwnedResidentBill(
            (int) $ownedBill->amenity_id,
            (int) $ownedBill->resident_bill_id,
            (int) $ownedBill->user_id,
        );
        abort_if(! $updated, 500, 'Payment proof could not be loaded after submit.');

        $formatted = $this->formatResidentBill($updated, $request);
        $reminders = app(AmenityBillReminderService::class);
        $formatted['has_overdue_shared_amenity_bill'] = $reminders->hasOverdueSharedAmenityBill(
            (int) $updated->amenity_id,
            (int) $updated->user_id,
        );
        $formatted['has_outstanding_previous_bill'] = false;
        $formatted['outstanding_previous_bill'] = $reminders->outstandingPreviousBill(
            (int) $updated->amenity_id,
            (int) $updated->user_id,
            Carbon::parse((string) $updated->billing_month)->startOfMonth()->toDateString(),
        );
        $formatted['has_outstanding_previous_bill'] = $formatted['outstanding_previous_bill'] !== null;

        $this->notifyAmenityOwnerOfPaymentProof($ownedBill, $formatted);
        app(PaymentMailService::class)->amenityBill((int) $ownedBill->resident_bill_id, 'proof_submitted');

        return $formatted;
    }

    private function notifyAmenityOwnerOfPaymentProof(object $ownedBill, array $formatted): void
    {
        $amenity = DB::table('amenities')->find((int) $ownedBill->amenity_id);
        $ownerId = (int) ($amenity->created_by ?? 0);
        $payerId = (int) $ownedBill->user_id;
        if ($ownerId <= 0 || $ownerId === $payerId) {
            return;
        }

        $payerName = (string) (DB::table('users')->where('id', $payerId)->value('name') ?: 'A resident');
        $amenityName = (string) ($amenity->name ?? $formatted['amenity_name'] ?? 'an amenity');

        NotificationService::send(
            $ownerId,
            'info',
            'Amenity payment proof submitted',
            "{$payerName} submitted payment proof for {$amenityName}. Review it from Amenity bills.",
            '/screens/property-management/amenity-bills',
            [
                'kind' => 'amenity_payment_proof',
                'amenity_id' => (int) $ownedBill->amenity_id,
                'resident_bill_id' => (int) $ownedBill->resident_bill_id,
            ],
        );
    }

    /** @return array<string, mixed> */
    private function formatBillCore(object $row, Request $request): array
    {
        $month = $this->displayBillingMonth($row);

        return [
            'id' => (int) $row->id,
            'amenity_id' => (int) $row->amenity_id,
            'community_id' => (int) $row->community_id,
            'billing_month' => $month->format('Y-m'),
            'billing_month_label' => $month->format('F Y'),
            'title' => $row->title,
            'description' => $row->description,
            'amount_per_resident' => (float) $row->amount_per_resident,
            'due_date' => Carbon::parse((string) $row->due_date)->toDateString(),
            'file_url' => MediaUrl::toPublic($row->file_path ?? null, $request),
            'file_name' => $row->file_name,
            'file_size' => $row->file_size !== null ? (int) $row->file_size : null,
            'file_size_label' => $row->file_size !== null ? $this->formatBytes((int) $row->file_size) : null,
            'mime_type' => $row->mime_type,
            'created_at' => $row->created_at ?? null,
        ];
    }

    /** @return array{file_path: string, file_name: string, file_size: int, mime_type: ?string} */
    public function storeBillFile(UploadedFile $file, int $communityId, int $amenityId): array
    {
        return $this->storePublicFile($file, "amenity-bills/{$communityId}/{$amenityId}");
    }

    public function storeProofFile(UploadedFile $file, int $communityId, int $amenityId, int $residentBillId): array
    {
        return $this->storePublicFile($file, "amenity-bill-proofs/{$communityId}/{$amenityId}/{$residentBillId}");
    }

    /** @return array{file_path: string, file_name: string, file_size: int, mime_type: ?string} */
    private function storePublicFile(UploadedFile $file, string $directory): array
    {
        $path = $file->store($directory, 'public');
        $relative = '/storage/'.ltrim(str_replace('\\', '/', $path), '/');

        return [
            'file_path' => MediaUrl::normalize($relative) ?? $relative,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => (int) $file->getSize(),
            'mime_type' => $file->getClientMimeType(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function formatPaymentAcknowledgement(object $row, string $status): ?array
    {
        if ($status !== self::RESIDENT_STATUS_PAID) {
            return null;
        }

        $amenityName = trim((string) ($row->amenity_name ?? '')) ?: 'amenity';
        $month = $this->displayBillingMonth($row);
        $amount = (float) ($row->resident_amount ?? $row->amount_per_resident ?? 0);

        return [
            'amenity_name' => $amenityName,
            'billing_month' => $month->format('Y-m'),
            'billing_month_label' => $month->format('F Y'),
            'amount' => $amount,
            'payment_date' => ! empty($row->payment_date)
                ? Carbon::parse((string) $row->payment_date)->toDateString()
                : null,
            'approved_at' => $row->approved_at ?? null,
            'payment_reference' => $row->payment_reference ?? null,
            'status' => self::RESIDENT_STATUS_PAID,
            'status_label' => $this->statusLabel(self::RESIDENT_STATUS_PAID),
            'acknowledged_by_label' => ($row->payment_method ?? null) === 'kuickpay' ? 'KuickPay' : 'Community Admin',
            'message' => $this->acknowledgementMessage($amenityName, $month->toDateString()),
        ];
    }

    /** @return array<string, mixed>|null */
    private function formatPaymentProof(object $row, Request $request): ?array
    {
        if (empty($row->proof_file_path) && empty($row->payment_date) && empty($row->proof_submitted_at)) {
            return null;
        }

        return [
            'file_url' => MediaUrl::toPublic($row->proof_file_path ?? null, $request),
            'file_name' => $row->proof_file_name ?? null,
            'file_size' => $row->proof_file_size !== null ? (int) $row->proof_file_size : null,
            'file_size_label' => $row->proof_file_size !== null ? $this->formatBytes((int) $row->proof_file_size) : null,
            'mime_type' => $row->proof_mime_type ?? null,
            'payment_date' => ! empty($row->payment_date)
                ? Carbon::parse((string) $row->payment_date)->toDateString()
                : null,
            'payment_reference' => $row->payment_reference ?? null,
            'payment_bank' => $row->payment_bank ?? null,
            'payment_note' => $row->payment_note ?? null,
            'submitted_at' => $row->proof_submitted_at ?? $row->created_at ?? null,
        ];
    }

    public function deleteStoredFile(?string $filePath): void
    {
        if (! $filePath) {
            return;
        }

        $normalized = MediaUrl::normalize($filePath);
        if (! $normalized || ! str_starts_with($normalized, '/storage/')) {
            return;
        }

        $diskPath = ltrim(substr($normalized, strlen('/storage/')), '/');
        if ($diskPath) {
            Storage::disk('public')->delete($diskPath);
        }
    }

    public function statusLabel(string $status): string
    {
        return match ($status) {
            self::RESIDENT_STATUS_UNPAID => 'Unpaid',
            self::RESIDENT_STATUS_PENDING => 'Pending Verification',
            self::RESIDENT_STATUS_PAID => 'Paid',
            self::RESIDENT_STATUS_REJECTED => 'Rejected',
            self::RESIDENT_STATUS_OVERDUE => 'Overdue',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }

    public function assertCanPayWithBank(string $status): void
    {
        if ($status === self::RESIDENT_STATUS_PAID) {
            throw PlaidException::paymentAlreadySettled();
        }

        $this->assertCanSubmitProof($status);
    }

    /**
     * Mirror a Plaid transfer onto the resident bill it pays for.
     *
     * - A refund never reopens the bill automatically (the charge may have been waived).
     * - A failure/return only reopens the bill when this transfer is the payment on record.
     * - A collection on a bill already paid another way is reported, not applied.
     *
     * @return string|null `duplicate_collection` when money arrived for an already-covered bill
     */
    public function applyAchTransfer(\App\Models\PlaidTransfer $transfer, ?string $achStatus = null): ?string
    {
        $billId = (int) $transfer->payable_id;
        $bill = DB::table('amenity_resident_bills')->where('id', $billId)->first();
        if (! $bill) {
            return null;
        }

        $from = (string) ($bill->status ?? self::RESIDENT_STATUS_UNPAID);
        $now = now();
        $achStatus ??= (string) $transfer->status;
        $ownsBill = (int) ($bill->plaid_transfer_id ?? 0) === (int) $transfer->id;
        $paidElsewhere = $from === self::RESIDENT_STATUS_PAID && ! $ownsBill;

        if ($transfer->refundActive() || $transfer->refund_status !== null) {
            if ($ownsBill) {
                DB::table('amenity_resident_bills')->where('id', $billId)->update(['ach_status' => $achStatus, 'updated_at' => $now]);
            }

            return null;
        }

        if ($transfer->isSuccessful()) {
            if ($paidElsewhere) {
                return \App\Models\PlaidTransfer::EXCEPTION_DUPLICATE_COLLECTION;
            }
            if ($ownsBill && $from === self::RESIDENT_STATUS_PAID) {
                DB::table('amenity_resident_bills')->where('id', $billId)->update(['ach_status' => $achStatus, 'updated_at' => $now]);

                return null;
            }
        } elseif ($transfer->isFailed() || $transfer->status === \App\Models\PlaidTransfer::STATUS_REFUNDED) {
            if (! $ownsBill && ! empty($bill->plaid_transfer_id)) {
                return null;
            }
            if (! $ownsBill && $from === self::RESIDENT_STATUS_PAID) {
                return null;
            }
        } elseif ($paidElsewhere || ($ownsBill && $from === self::RESIDENT_STATUS_PENDING)) {
            if ($ownsBill) {
                DB::table('amenity_resident_bills')->where('id', $billId)->update(['ach_status' => $achStatus, 'updated_at' => $now]);
            }

            return null;
        }

        if ($transfer->isSuccessful()) {
            $to = self::RESIDENT_STATUS_PAID;
            $action = self::ACTION_ACH_POSTED;
            $updates = [
                'status' => $to,
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $achStatus,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $transfer->public_id,
                'payment_note' => 'Paid by bank transfer to the community account.',
                'proof_submitted_at' => $now,
                'approved_at' => $now,
                'approved_by' => null,
                'rejected_at' => null,
                'rejected_by' => null,
                'rejection_reason' => null,
                'updated_at' => $now,
            ];
        } elseif ($transfer->status === \App\Models\PlaidTransfer::STATUS_REFUNDED) {
            $to = self::RESIDENT_STATUS_UNPAID;
            $action = self::ACTION_ACH_REFUNDED;
            $updates = [
                'status' => $to,
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $achStatus,
                'updated_at' => $now,
            ];
        } elseif ($transfer->isFailed()) {
            $to = self::RESIDENT_STATUS_UNPAID;
            $action = self::ACTION_ACH_FAILED;
            $updates = [
                'status' => $to,
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $achStatus,
                'updated_at' => $now,
            ];
        } else {
            $to = self::RESIDENT_STATUS_PENDING;
            $action = self::ACTION_ACH_SUBMITTED;
            $updates = [
                'status' => $to,
                'payment_method' => 'bank_ach',
                'plaid_transfer_id' => $transfer->id,
                'ach_status' => $achStatus,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $transfer->public_id,
                'proof_submitted_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('amenity_resident_bills')->where('id', $billId)->update($updates);

        $this->writeReview([
            'resident_bill_id' => $billId,
            'monthly_bill_id' => (int) $bill->monthly_bill_id,
            'amenity_id' => (int) $bill->amenity_id,
            'community_id' => (int) $bill->community_id,
            'user_id' => (int) $bill->user_id,
            'action' => $action,
            'actor_id' => (int) $bill->user_id,
            'status_from' => $from,
            'status_to' => $to,
            'proof_file_path' => null,
            'proof_file_name' => null,
            'proof_file_size' => null,
            'proof_mime_type' => null,
            'payment_date' => $updates['payment_date'] ?? $bill->payment_date ?? null,
            'payment_reference' => $transfer->public_id,
            'payment_note' => $transfer->isSuccessful() ? 'Paid by bank transfer' : ($transfer->failure_message ?: null),
            'rejection_reason' => $transfer->isFailed() ? ($transfer->failure_message ?: 'Bank payment failed') : null,
        ]);

        return null;
    }

    private function assertCanSubmitProof(string $status): void
    {
        if ($status === self::RESIDENT_STATUS_PENDING) {
            throw ValidationException::withMessages([
                'file' => self::PROOF_ALREADY_PENDING_MESSAGE,
            ]);
        }
        if ($status === self::RESIDENT_STATUS_PAID) {
            throw ValidationException::withMessages([
                'file' => self::PROOF_ALREADY_PAID_MESSAGE,
            ]);
        }
        if (! in_array($status, [
            self::RESIDENT_STATUS_UNPAID,
            self::RESIDENT_STATUS_REJECTED,
            self::RESIDENT_STATUS_OVERDUE,
        ], true)) {
            throw ValidationException::withMessages([
                'file' => 'Payment proof cannot be submitted for this bill.',
            ]);
        }
    }

    private function reviewResidentPayment(
        object $bill,
        int $adminId,
        string $action,
        string $statusTo,
        ?string $rejectionReason = null,
    ): void {
        DB::transaction(function () use ($bill, $adminId, $action, $statusTo, $rejectionReason) {
            $locked = DB::table('amenity_resident_bills')
                ->where('id', (int) $bill->resident_bill_id)
                ->where('amenity_id', (int) $bill->amenity_id)
                ->lockForUpdate()
                ->first();

            abort_if(! $locked, 404, 'Bill not found.');

            if (($locked->status ?? '') !== self::RESIDENT_STATUS_PENDING) {
                throw ValidationException::withMessages([
                    'status' => self::REVIEW_NOT_PENDING_MESSAGE,
                ]);
            }
            if ($action === self::ACTION_APPROVED) {
                \App\Services\Payments\OnlineSettlementGuard::assertManualApprovalAllowed(
                    \App\Models\PaymentAttempt::PAYABLE_AMENITY_BILL,
                    (int) $locked->id,
                );
            }

            $now = now();
            $updates = [
                'status' => $statusTo,
                'updated_at' => $now,
            ];

            if ($action === self::ACTION_APPROVED) {
                $updates['approved_by'] = $adminId;
                $updates['approved_at'] = $now;
                $updates['rejected_by'] = null;
                $updates['rejected_at'] = null;
                $updates['rejection_reason'] = null;
            } else {
                $updates['rejected_by'] = $adminId;
                $updates['rejected_at'] = $now;
                $updates['rejection_reason'] = $rejectionReason;
                $updates['approved_by'] = null;
                $updates['approved_at'] = null;
            }

            DB::table('amenity_resident_bills')
                ->where('id', (int) $locked->id)
                ->update($updates);

            $this->writeReview([
                'resident_bill_id' => (int) $locked->id,
                'monthly_bill_id' => (int) $locked->monthly_bill_id,
                'amenity_id' => (int) $locked->amenity_id,
                'community_id' => (int) $locked->community_id,
                'user_id' => (int) $locked->user_id,
                'action' => $action,
                'actor_id' => $adminId,
                'status_from' => self::RESIDENT_STATUS_PENDING,
                'status_to' => $statusTo,
                'proof_file_path' => $locked->proof_file_path ?? null,
                'proof_file_name' => $locked->proof_file_name ?? null,
                'proof_file_size' => $locked->proof_file_size ?? null,
                'proof_mime_type' => $locked->proof_mime_type ?? null,
                'payment_date' => $locked->payment_date ?? null,
                'payment_reference' => $locked->payment_reference ?? null,
                'payment_note' => $locked->payment_note ?? null,
                'rejection_reason' => $rejectionReason,
            ]);
        });
    }

    /** @param  array<string, mixed>  $row */
    private function writeReview(array $row): void
    {
        $now = now();
        DB::table('amenity_resident_bill_reviews')->insert([
            'resident_bill_id' => $row['resident_bill_id'],
            'monthly_bill_id' => $row['monthly_bill_id'],
            'amenity_id' => $row['amenity_id'],
            'community_id' => $row['community_id'],
            'user_id' => $row['user_id'],
            'action' => $row['action'],
            'actor_id' => $row['actor_id'],
            'status_from' => $row['status_from'],
            'status_to' => $row['status_to'],
            'proof_file_path' => $row['proof_file_path'],
            'proof_file_name' => $row['proof_file_name'],
            'proof_file_size' => $row['proof_file_size'],
            'proof_mime_type' => $row['proof_mime_type'],
            'payment_date' => $row['payment_date'],
            'payment_reference' => $row['payment_reference'],
            'payment_note' => $row['payment_note'],
            'rejection_reason' => $row['rejection_reason'],
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function publishFinanceNotices(object $amenity, object $monthlyBill, array $residentIds, int $authorId): void
    {
        if ($residentIds === []) {
            return;
        }

        $frequency = ($amenity->shared_billing_frequency ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly';
        $period = Carbon::parse((string) $monthlyBill->billing_month);
        $bookingId = (int) ($monthlyBill->booking_id ?? 0);
        $month = $bookingId > 0 || $period->year < 2000
            ? Carbon::parse((string) $monthlyBill->due_date)->toFormattedDateString()
            : ($frequency === 'yearly' ? $period->format('Y') : $period->format('F Y'));
        $amount = number_format((float) $monthlyBill->amount_per_resident, 2);
        $title = $amenity->name.' — '.$month;
        $body = trim(($monthlyBill->title ? $monthlyBill->title."\n\n" : '').'Amount due: $'.$amount."\nDue date: ".$monthlyBill->due_date."\n\nSubmit payment proof to "
            .($bookingId > 0 ? 'confirm this booking.' : 'keep this amenity bookable.'));

        try {
            foreach ($residentIds as $userId) {
                $noticeId = $this->insertFinanceNotice(
                    (int) $amenity->community_id,
                    $authorId ?: (int) $userId,
                    $title,
                    $body,
                    [(int) $userId],
                );
                if (! $noticeId) {
                    continue;
                }

                if (Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
                    DB::table('amenity_resident_bills')
                        ->where('monthly_bill_id', (int) $monthlyBill->id)
                        ->where('user_id', (int) $userId)
                        ->update([
                            'finance_notice_id' => $noticeId,
                            'updated_at' => now(),
                        ]);
                }
            }
        } catch (\Throwable) {
            // Notice schema can vary slightly between environments; billing must still succeed.
        }
    }

    /** @param  list<int>  $residentIds */
    private function insertFinanceNotice(int $communityId, int $authorId, string $title, string $body, array $residentIds): ?int
    {
        $noticeId = DB::table('notices')->insertGetId([
            'community_id' => $communityId,
            'author_id' => $authorId,
            'title' => mb_substr($title, 0, 200),
            'category' => 'finance',
            'body' => $body,
            'status' => 'published',
            'review_status' => 'approved',
            'is_global' => false,
            'audience_type' => 'selected',
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $now = now();
        DB::table('notice_recipients')->insert(array_map(fn ($userId) => [
            'notice_id' => $noticeId,
            'user_id' => $userId,
            'created_at' => $now,
            'updated_at' => $now,
        ], $residentIds));

        return $noticeId;
    }

    /** @param  list<int>  $bookingIds
     *  @return array<int, array<string, mixed>>
     */
    public function residentBillsByBookingIds(array $bookingIds, Request $request): array
    {
        $bookingIds = array_values(array_unique(array_filter(array_map('intval', $bookingIds))));
        if ($bookingIds === [] || ! Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            return [];
        }

        $rows = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'mb.amenity_id')
            ->whereIn('rb.booking_id', $bookingIds)
            ->where('mb.status', self::STATUS_PUBLISHED)
            ->orderByDesc('rb.id')
            ->select([
                'mb.id',
                'mb.amenity_id',
                'mb.community_id',
                'mb.billing_month',
                'mb.title',
                'mb.description',
                'mb.amount_per_resident',
                'mb.due_date',
                'mb.file_path',
                'mb.file_name',
                'mb.file_size',
                'mb.mime_type',
                'mb.status as monthly_status',
                'mb.published_at',
                'mb.created_at',
                'a.name as amenity_name',
                'a.icon_key as amenity_icon_key',
                'rb.id as resident_bill_id',
                'rb.booking_id',
                'rb.amount as resident_amount',
                'rb.status as resident_status',
                'rb.proof_file_path',
                'rb.proof_file_name',
                'rb.proof_file_size',
                'rb.proof_mime_type',
                'rb.payment_date',
                'rb.payment_reference',
                'rb.payment_note',
                'rb.proof_submitted_at',
                'rb.proof_submitted_by',
                'rb.approved_by',
                'rb.approved_at',
                'rb.rejected_by',
                'rb.rejected_at',
                'rb.rejection_reason',
            ])
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $bookingId = (int) $row->booking_id;
            if ($bookingId < 1 || isset($map[$bookingId])) {
                continue;
            }
            $map[$bookingId] = $this->formatResidentBill($row, $request);
        }

        return $map;
    }

    private function confirmAwaitingPaymentBooking(object $bill): void
    {
        $bookingId = (int) ($bill->booking_id ?? 0);
        if ($bookingId < 1) {
            return;
        }

        $booking = DB::table('bookings')->where('id', $bookingId)->first();
        if (! $booking || ($booking->status ?? '') !== 'awaiting_payment') {
            return;
        }

        DB::table('bookings')->where('id', $bookingId)->update([
            'status' => 'confirmed',
            'updated_at' => now(),
        ]);

        $amenityName = trim((string) ($bill->amenity_name ?? '')) ?: 'amenity';
        NotificationService::send(
            (int) $booking->user_id,
            'success',
            'Reservation confirmed',
            "Your booking for {$amenityName} on {$booking->date}".(! empty($booking->time_slot) ? " ({$booking->time_slot})" : '').' is confirmed.',
            '/screens/property-management/my-booking',
        );
    }

    private function hideFinanceNoticeFromHome(object $bill): void
    {
        foreach ($this->financeNoticeIdsForBill($bill) as $noticeId) {
            $this->hideFinanceNoticeForResident($noticeId, (int) ($bill->user_id ?? 0));
        }
    }

    private function removeFinanceNotice(int $noticeId): void
    {
        if ($noticeId < 1) {
            return;
        }

        DB::table('notice_recipients')->where('notice_id', $noticeId)->delete();
        DB::table('notices')->where('id', $noticeId)->delete();
    }

    /** @return list<int> */
    private function financeNoticeIdsForBill(object $bill): array
    {
        $ids = [];
        $direct = (int) ($bill->finance_notice_id ?? 0);
        if ($direct > 0) {
            $ids[] = $direct;
        }

        if (Schema::hasColumn('amenity_monthly_bills', 'finance_notice_id')) {
            $monthly = (int) DB::table('amenity_monthly_bills')
                ->where('id', (int) ($bill->monthly_bill_id ?? 0))
                ->value('finance_notice_id');
            if ($monthly > 0) {
                $ids[] = $monthly;
            }
        }

        if ($ids === []) {
            $amenityName = trim((string) ($bill->amenity_name ?? ''));
            $userId = (int) ($bill->user_id ?? 0);
            $communityId = (int) ($bill->community_id ?? 0);
            if ($amenityName !== '' && $userId > 0 && $communityId > 0) {
                $ids = DB::table('notices')
                    ->join('notice_recipients as nr', 'nr.notice_id', '=', 'notices.id')
                    ->where('nr.user_id', $userId)
                    ->where('notices.category', 'finance')
                    ->where('notices.community_id', $communityId)
                    ->where('notices.title', 'like', $amenityName.'%')
                    ->pluck('notices.id')
                    ->map(fn ($id) => (int) $id)
                    ->all();
            }
        }

        return array_values(array_unique(array_filter($ids)));
    }

    private function hideFinanceNoticeForResident(int $noticeId, int $userId): void
    {
        if ($noticeId < 1 || $userId < 1) {
            return;
        }

        try {
            DB::table('notice_recipients')
                ->where('notice_id', $noticeId)
                ->where('user_id', $userId)
                ->delete();

            $remaining = (int) DB::table('notice_recipients')->where('notice_id', $noticeId)->count();
            $updates = [
                'status' => 'published',
                'updated_at' => now(),
            ];
            if ($remaining === 0 && Schema::hasColumn('notices', 'event_date')) {
                $updates['event_date'] = now()->subDay()->toDateString();
            }

            DB::table('notices')->where('id', $noticeId)->update($updates);
        } catch (\Throwable) {
            // Hiding from Home is best-effort; approval must still succeed.
        }
    }

    private function adminResidentBillQuery(int $amenityId)
    {
        return $this->residentBillQuery()->where('rb.amenity_id', $amenityId);
    }

    private function communityResidentBillQuery(int $communityId)
    {
        return $this->residentBillQuery()->where('rb.community_id', $communityId);
    }

    private function communityAdminReviewablePendingPaymentQuery(int $communityId, int $viewerId)
    {
        $query = $this->applyCommunityAdminBookingPaymentVisibility(
            $this->applyExcludeInactiveBookingBills(
                $this->communityResidentBillQuery($communityId)->where('rb.status', self::RESIDENT_STATUS_PENDING),
            ),
        );

        return $query->where(function ($outer) use ($viewerId) {
            $outer->where(function ($sharedOnly) {
                if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
                    $sharedOnly->where(function ($inner) {
                        $inner->whereNull('rb.booking_id')->orWhere('rb.booking_id', 0);
                    });
                }
                if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
                    $sharedOnly->where(function ($inner) {
                        $inner->whereNull('mb.booking_id')->orWhere('mb.booking_id', 0);
                    });
                }
            });
            if ($viewerId > 0) {
                $outer->orWhere('a.created_by', $viewerId);
            }
        });
    }

    /** Booking reservation fees are reviewed only by the amenity creator (owner bills), not community admins. */
    public function isBookingPaymentBill(object $row): bool
    {
        if ((int) ($row->booking_id ?? 0) > 0) {
            return true;
        }

        if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            return (int) ($row->monthly_booking_id ?? 0) > 0;
        }

        return false;
    }

    /**
     * Community admin bill inbox: shared monthly bills for all amenities, plus booking-fee
     * payments only for amenities created by community staff (not resident-owned amenities).
     */
    private function applyCommunityAdminBookingPaymentVisibility($query)
    {
        if (! Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            return $query;
        }

        return $query->where(function ($outer) {
            $outer->where(function ($sharedOnly) {
                if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
                    $sharedOnly->where(function ($inner) {
                        $inner->whereNull('rb.booking_id')->orWhere('rb.booking_id', 0);
                    });
                }
                if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
                    $sharedOnly->where(function ($inner) {
                        $inner->whereNull('mb.booking_id')->orWhere('mb.booking_id', 0);
                    });
                }
            });
            $outer->orWhereExists(function ($sub) {
                $sub->select(DB::raw(1))
                    ->from('users as amenity_creator')
                    ->whereColumn('amenity_creator.id', 'a.created_by')
                    ->where(function ($roles) {
                        $roles->whereIn('amenity_creator.role', ['community_admin', 'admin']);
                        if (Schema::hasColumn('users', 'is_admin')) {
                            $roles->orWhere('amenity_creator.is_admin', true);
                        }
                    });
            });
        });
    }

    public function viewerMayReviewBookingPayment(object $row, Request $request): bool
    {
        if (! $this->isBookingPaymentBill($row)) {
            return false;
        }

        $viewerId = (int) ($request->user()?->id ?? 0);
        $creatorId = (int) ($row->amenity_created_by ?? 0);
        if ($creatorId < 1) {
            $creatorId = (int) DB::table('amenities')->where('id', (int) ($row->amenity_id ?? 0))->value('created_by');
        }

        return $viewerId > 0 && $creatorId > 0 && $viewerId === $creatorId;
    }

    public function assertAdminCanReviewBookingPayment(int $amenityId, int $viewerId): void
    {
        $creatorId = (int) DB::table('amenities')->where('id', $amenityId)->value('created_by');
        abort_if(
            $creatorId !== $viewerId,
            403,
            'Only the amenity creator can review this payment.',
        );
    }

    /** Booking-fee bills exist only after the amenity creator approves the request. */
    private function applyExcludeInactiveBookingBills($query)
    {
        if (! Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            return $query;
        }

        $query->whereNotExists(function ($sub) {
            $sub->select(DB::raw(1))
                ->from('bookings as booking_row')
                ->whereColumn('booking_row.id', 'rb.booking_id')
                ->whereIn('booking_row.status', ['pending', 'cancelled', 'rejected']);
        });

        return $query;
    }

    private function residentBillQuery()
    {
        $query = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->join('users', 'users.id', '=', 'rb.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->select([
                'mb.id as monthly_bill_id',
                'mb.amenity_id',
                'mb.community_id',
                'mb.billing_month',
                'mb.title',
                'mb.due_date',
                'mb.amount_per_resident',
                'a.name as amenity_name',
                'a.created_by as amenity_created_by',
                'users.name as resident_name',
                'profiles.unit_number',
                'rb.id as resident_bill_id',
                'rb.user_id',
                'rb.amount as resident_amount',
                'rb.status as resident_status',
                'rb.proof_file_path',
                'rb.proof_file_name',
                'rb.proof_file_size',
                'rb.proof_mime_type',
                'rb.payment_date',
                'rb.payment_reference',
                'rb.payment_note',
                'rb.proof_submitted_at',
                'rb.proof_submitted_by',
                'rb.approved_by',
                'rb.approved_at',
                'rb.rejected_by',
                'rb.rejected_at',
                'rb.rejection_reason',
            ]);

        if (Schema::hasColumn('amenity_resident_bills', 'payment_method')) {
            $query->addSelect('rb.payment_method');
        }
        if (Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
            $query->addSelect('rb.finance_notice_id');
        }
        if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
            $query->addSelect('rb.booking_id');
        }
        if (Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            $query->addSelect('mb.booking_id as monthly_booking_id');
        }

        return $query;
    }

    /** @return array<string, mixed> */
    public function formatAdminResidentBill(object $row, Request $request, bool $creatorReviewContext = false): array
    {
        $status = (string) ($row->resident_status ?? self::RESIDENT_STATUS_UNPAID);
        $month = $this->displayBillingMonth($row);
        $bookingPayment = $this->isBookingPaymentBill($row);

        return [
            'id' => (int) $row->resident_bill_id,
            'resident_bill_id' => (int) $row->resident_bill_id,
            'monthly_bill_id' => (int) $row->monthly_bill_id,
            'amenity_id' => (int) $row->amenity_id,
            'community_id' => (int) $row->community_id,
            'user_id' => (int) $row->user_id,
            'resident_name' => $row->resident_name ?? null,
            'unit_number' => $row->unit_number ?? null,
            'amenity_name' => $row->amenity_name ?? null,
            'billing_month' => $month->format('Y-m'),
            'billing_month_label' => $month->format('F Y'),
            'amount' => (float) ($row->resident_amount ?? $row->amount_per_resident),
            'due_date' => ! empty($row->due_date) ? Carbon::parse((string) $row->due_date)->toDateString() : null,
            'status' => $status,
            'status_label' => $this->statusLabel($status),
            'can_review' => $status === self::RESIDENT_STATUS_PENDING && (! $bookingPayment || $creatorReviewContext),
            'payment_proof' => $this->formatPaymentProof($row, $request),
            'payment_acknowledgement' => $this->formatPaymentAcknowledgement($row, $status),
            'rejection_reason' => $row->rejection_reason ?? null,
            'proof_submitted_by' => $row->proof_submitted_by !== null ? (int) $row->proof_submitted_by : null,
            'proof_submitted_at' => $row->proof_submitted_at ?? null,
            'paid_at' => $status === self::RESIDENT_STATUS_PAID ? ($row->approved_at ?? null) : null,
            'approved_by' => $row->approved_by !== null ? (int) $row->approved_by : null,
            'approved_at' => $row->approved_at ?? null,
            'rejected_by' => $row->rejected_by !== null ? (int) $row->rejected_by : null,
            'rejected_at' => $row->rejected_at ?? null,
            'booking_id' => isset($row->booking_id) && $row->booking_id !== null ? (int) $row->booking_id : null,
        ];
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 1).' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024, 1).' KB';
        }

        return $bytes.' B';
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        $code = (string) $e->getCode();
        $message = $e->getMessage();

        return $code === '23000'
            || str_contains($message, 'UNIQUE constraint failed')
            || str_contains($message, 'amenity_monthly_bills_unique');
    }
}
