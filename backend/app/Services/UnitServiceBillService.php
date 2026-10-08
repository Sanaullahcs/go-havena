<?php

namespace App\Services;

use App\Support\MediaUrl;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class UnitServiceBillService
{
    public const STATUS_UNPAID = 'unpaid';

    public const STATUS_ACKNOWLEDGED = 'acknowledged';

    public const STATUS_PENDING = 'pending_verification';

    public const STATUS_PAID = 'paid';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_OVERDUE = 'overdue';

    public const SUB_PENDING = 'pending';

    public const SUB_ACTIVE = 'active';

    public const SUB_REJECTED = 'rejected';

    public const SUB_CANCELLED = 'cancelled';

    public const ACTION_SUBMITTED = 'submitted';

    public const ACTION_APPROVED = 'approved';

    public const ACTION_REJECTED = 'rejected';

    public const ACTION_ACKNOWLEDGED = 'acknowledged';

    public const FILE_RULE = 'required|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp';

    public const OPTIONAL_FILE_RULE = 'nullable|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp';

    public const REJECTION_REASONS = [
        'unclear_proof' => 'Payment proof is unclear',
        'amount_mismatch' => 'Amount does not match',
        'incorrect_bill' => 'Incorrect bill / payment',
        'invalid_receipt' => 'Invalid receipt',
        'other' => 'Other',
    ];

    public const NOT_BILLING_CONTACT_MESSAGE = 'Ask your unit billing contact to subscribe.';

    public const DUPLICATE_PERIOD_MESSAGE = 'A bill already exists for this unit, service, and billing period.';

    public const PROOF_SUBMITTED_MESSAGE = 'Payment proof submitted. Your Community Admin will review it.';

    public function normalizeBillingMonth(string $value): string
    {
        $value = trim($value);
        if (preg_match('/^\d{4}$/', $value)) {
            return Carbon::create((int) $value, 1, 1)->startOfYear()->toDateString();
        }
        if (preg_match('/^\d{4}-\d{2}$/', $value)) {
            return Carbon::createFromFormat('Y-m', $value)->startOfMonth()->toDateString();
        }

        return Carbon::parse($value)->startOfMonth()->toDateString();
    }

    public function generateBills(object $service, array $data, int $createdBy, Request $request, ?UploadedFile $file = null): array
    {
        if (($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
            throw ValidationException::withMessages([
                'service' => 'Inactive services cannot generate new bills.',
            ]);
        }

        $period = $this->normalizeBillingMonth((string) ($data['billing_period'] ?? now()->toDateString()));
        $units = $this->eligibleUnitsForGeneration($service);
        if ($units === []) {
            throw ValidationException::withMessages([
                'units' => $service->application_type === PropertyServiceCatalogService::TYPE_OPTIONAL
                    ? 'No units are subscribed to this service.'
                    : 'No eligible residential units found.',
            ]);
        }

        $amount = $this->resolveGenerateAmount($service, $data);
        $dueDate = $data['due_date'] ?? $this->defaultDueDate($service, $period);
        $title = trim((string) ($data['title'] ?? $this->defaultTitle($service, $period)));
        $description = isset($data['description']) && trim((string) $data['description']) !== ''
            ? trim((string) $data['description'])
            : null;
        $fileMeta = $file ? $this->storeBillFile($file, (int) $service->community_id, (int) $service->id) : null;

        $created = [];
        $skipped = [];
        $missingContacts = [];

        try {
            DB::transaction(function () use (
                $service, $units, $period, $amount, $dueDate, $title, $description, $fileMeta, $createdBy, &$created, &$skipped, &$missingContacts
            ) {
                $now = now();
                foreach ($units as $unit) {
                    [$unit, $contactId] = $this->prepareUnitForBilling($unit);
                    $exists = DB::table('unit_service_bills')
                        ->where('service_id', $service->id)
                        ->where('unit_id', $unit->id)
                        ->where('billing_period', $period)
                        ->exists();
                    if ($exists) {
                        $skipped[] = (int) $unit->id;
                        continue;
                    }
                    if (! $contactId) {
                        $missingContacts[] = [
                            'unit_id' => (int) $unit->id,
                            'unit_number' => (string) $unit->unit_number,
                        ];
                    }

                    $created[] = (int) DB::table('unit_service_bills')->insertGetId([
                        'community_id' => (int) $service->community_id,
                        'service_id' => (int) $service->id,
                        'unit_id' => (int) $unit->id,
                        'billing_contact_user_id' => $contactId,
                        'created_by' => $createdBy,
                        'billing_period' => $period,
                        'title' => $title,
                        'description' => $description,
                        'amount' => $amount,
                        'due_date' => $dueDate,
                        'status' => self::STATUS_UNPAID,
                        'payment_instructions' => $service->payment_instructions,
                        'require_acknowledgement' => (bool) $service->require_acknowledgement,
                        'require_payment_proof' => (bool) $service->require_payment_proof,
                        'file_path' => $fileMeta['file_path'] ?? null,
                        'file_name' => $fileMeta['file_name'] ?? null,
                        'file_size' => $fileMeta['file_size'] ?? null,
                        'mime_type' => $fileMeta['mime_type'] ?? null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            });
        } catch (QueryException $e) {
            if ($fileMeta) {
                $this->deleteStoredFile($fileMeta['file_path'] ?? null);
            }
            if ($this->isUniqueViolation($e)) {
                throw ValidationException::withMessages([
                    'billing_period' => self::DUPLICATE_PERIOD_MESSAGE,
                ]);
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($fileMeta) {
                $this->deleteStoredFile($fileMeta['file_path'] ?? null);
            }
            throw $e;
        }

        $unitsById = collect($units)->keyBy(fn ($unit) => (int) $unit->id);
        $notifiedUserIds = [];
        foreach ($created as $billId) {
            $bill = DB::table('unit_service_bills')->find($billId);
            if (! $bill) {
                continue;
            }
            $unit = $unitsById->get((int) $bill->unit_id);
            if ($bill->billing_contact_user_id) {
                $notifiedUserIds[] = (int) $bill->billing_contact_user_id;
                if ($service->send_notification ?? true) {
                    app(UnitServiceBillReminderService::class)->notifyCreated($bill, (string) $service->name, (string) ($unit->unit_number ?? ''));
                }
                $this->publishFinanceNotice($service, $bill, $createdBy, (string) ($unit->unit_number ?? ''));
            }
        }

        foreach ($missingContacts as $missing) {
            app(UnitAssignmentService::class)->notifyAdminsMissingBillingContact(
                (int) $service->community_id,
                is_array($missing) ? (string) $missing['unit_number'] : (string) $missing,
                (string) $service->name,
                is_array($missing) ? (int) $missing['unit_id'] : null,
            );
        }

        ActivityLogService::user(
            'property_service_bills_generated',
            "Generated {$service->name} bills for {$period}",
            'PropertyService',
            (int) $service->id,
        );

        return [
            'billing_period' => substr($period, 0, 7),
            'created_count' => count($created),
            'skipped_count' => count($skipped),
            'missing_billing_contact_count' => count($missingContacts),
            'missing_billing_contacts' => array_map(
                fn ($missing) => is_array($missing) ? (string) $missing['unit_number'] : (string) $missing,
                $missingContacts,
            ),
            'notified_user_ids' => array_values(array_unique($notifiedUserIds)),
            'bills' => collect($created)->map(fn ($id) => $this->formatAdminBill(
                $this->adminBillQuery((int) $service->community_id)->where('usb.id', $id)->first(),
                $request,
            ))->all(),
        ];
    }

    public function generateDueAutomaticBills(): array
    {
        $services = DB::table('property_services')
            ->where('status', PropertyServiceCatalogService::STATUS_ACTIVE)
            ->whereIn('billing_frequency', [
                PropertyServiceCatalogService::FREQUENCY_MONTHLY,
                PropertyServiceCatalogService::FREQUENCY_YEARLY,
            ])
            ->get();

        $created = 0;
        foreach ($services as $service) {
            $result = $this->generateCurrentPeriodIfDue($service, (int) ($service->created_by ?? 0));
            $created += (int) ($result['created_count'] ?? 0);
        }

        return ['created_count' => $created];
    }

    public function generateCurrentPeriodIfDue(object $service, int $createdBy): array
    {
        if (! $this->currentPeriodIsDue($service)) {
            return ['created_count' => 0, 'notified_user_ids' => []];
        }

        try {
            return $this->generateBills($service, [
                'billing_period' => $this->currentBillingPeriod($service),
            ], $createdBy, request());
        } catch (ValidationException) {
            return ['created_count' => 0, 'notified_user_ids' => []];
        }
    }

    private function isYearlyService(object $service): bool
    {
        return ($service->billing_frequency ?? '') === PropertyServiceCatalogService::FREQUENCY_YEARLY;
    }

    private function currentBillingPeriod(object $service): string
    {
        return $this->isYearlyService($service)
            ? now()->startOfYear()->toDateString()
            : now()->startOfMonth()->toDateString();
    }

    private function currentPeriodIsDue(object $service): bool
    {
        $frequency = $service->billing_frequency ?? PropertyServiceCatalogService::FREQUENCY_MONTHLY;
        if ($frequency === PropertyServiceCatalogService::FREQUENCY_ONE_TIME) {
            return false;
        }
        if (($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
            return false;
        }

        $first = $service->first_billing_month
            ? Carbon::parse($service->first_billing_month)
            : Carbon::parse($service->created_at ?? now());

        if ($frequency === PropertyServiceCatalogService::FREQUENCY_YEARLY) {
            return (int) now()->year >= (int) $first->year;
        }

        $period = now()->startOfMonth();
        if ($period->lt($first->copy()->startOfMonth())) {
            return false;
        }

        return true;
    }

    public function listAdminBills(int $communityId, Request $request): array
    {
        app(UnitServiceBillReminderService::class)->markOverdue(null, $communityId);
        $this->attachCurrentBillingContacts($communityId);

        $query = $this->adminBillQuery($communityId);
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('usb.status', $request->status);
        }
        if ($request->filled('service_id')) {
            $query->where('usb.service_id', (int) $request->service_id);
        }
        if ($request->filled('unit_id')) {
            $query->where('usb.unit_id', (int) $request->unit_id);
        }

        $query->where(function ($inner) {
            $inner->where('ps.application_type', '!=', PropertyServiceCatalogService::TYPE_AUTOMATIC)
                ->orWhereNotNull('usb.billing_contact_user_id');
        });

        $rows = $query
            ->orderByRaw("CASE usb.status
                WHEN '".self::STATUS_PENDING."' THEN 0
                WHEN '".self::STATUS_OVERDUE."' THEN 1
                WHEN '".self::STATUS_REJECTED."' THEN 2
                WHEN '".self::STATUS_UNPAID."' THEN 3
                WHEN '".self::STATUS_ACKNOWLEDGED."' THEN 4
                ELSE 5 END")
            ->orderByDesc('usb.due_date')
            ->orderByDesc('usb.id')
            ->get();

        return $rows->map(fn ($row) => $this->formatAdminBill($row, $request))->all();
    }

    public function listResidentBills(int $communityId, int $userId, Request $request): array
    {
        $this->syncDueAutomaticBillsForBillingContact($communityId, $userId);
        $this->backfillMissingSubscriptionBills($communityId, $userId);
        app(UnitServiceBillReminderService::class)->markOverdue($userId, $communityId);
        $this->attachCurrentBillingContacts($communityId);

        $rows = DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->where('usb.community_id', $communityId)
            ->where('usb.billing_contact_user_id', $userId)
            ->orderByDesc('usb.billing_period')
            ->orderByDesc('usb.id')
            ->select($this->residentBillSelect())
            ->get();

        return $rows->map(fn ($row) => $this->formatResidentBill($row, $request))->all();
    }

    public function findOwnedBill(int $billId, int $userId, int $communityId): ?object
    {
        return DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->where('usb.id', $billId)
            ->where('usb.community_id', $communityId)
            ->where('usb.billing_contact_user_id', $userId)
            ->select($this->residentBillSelect())
            ->first();
    }

    public function findAdminBill(int $billId, int $communityId): ?object
    {
        return $this->adminBillQuery($communityId)->where('usb.id', $billId)->first();
    }

    public function acknowledge(object $ownedBill, int $userId): array
    {
        if (! in_array((string) $ownedBill->status, [self::STATUS_UNPAID, self::STATUS_OVERDUE], true)) {
            throw ValidationException::withMessages([
                'bill' => 'This bill cannot be acknowledged in its current status.',
            ]);
        }

        $now = now();
        DB::table('unit_service_bills')->where('id', $ownedBill->id)->update([
            'status' => self::STATUS_ACKNOWLEDGED,
            'acknowledged_at' => $now,
            'acknowledged_by' => $userId,
            'updated_at' => $now,
        ]);

        $this->writeReview([
            'bill_id' => (int) $ownedBill->id,
            'community_id' => (int) $ownedBill->community_id,
            'service_id' => (int) $ownedBill->service_id,
            'unit_id' => (int) $ownedBill->unit_id,
            'actor_id' => $userId,
            'action' => self::ACTION_ACKNOWLEDGED,
            'status_from' => (string) $ownedBill->status,
            'status_to' => self::STATUS_ACKNOWLEDGED,
        ]);

        app(UnitServiceBillReminderService::class)->notifyAdminsAcknowledged($ownedBill, $userId);

        return $this->formatResidentBill(
            $this->findOwnedBill((int) $ownedBill->id, $userId, (int) $ownedBill->community_id),
            request(),
        );
    }

    public function submitPaymentProof(object $ownedBill, UploadedFile $file, array $data, Request $request): array
    {
        $this->assertAcknowledgedIfRequired($ownedBill);
        $this->assertCanSubmitProof((string) $ownedBill->status);
        app(\App\Services\Payments\OnlinePaymentPresenter::class)->assertNoPaymentInFlight(
            \App\Models\PaymentAttempt::PAYABLE_SERVICE_BILL,
            (int) $ownedBill->id,
        );

        $fileMeta = $this->storeProofFile($file, (int) $ownedBill->community_id, (int) $ownedBill->id);

        try {
            DB::transaction(function () use ($ownedBill, $data, $fileMeta) {
                $locked = DB::table('unit_service_bills')->where('id', $ownedBill->id)->lockForUpdate()->first();
                abort_if(! $locked, 404, 'Bill not found.');
                $this->assertAcknowledgedIfRequired($locked);
                $this->assertCanSubmitProof((string) $locked->status);

                $now = now();
                DB::table('unit_service_bills')->where('id', $ownedBill->id)->update([
                    'status' => self::STATUS_PENDING,
                    'proof_file_path' => $fileMeta['file_path'],
                    'proof_file_name' => $fileMeta['file_name'],
                    'proof_file_size' => $fileMeta['file_size'],
                    'proof_mime_type' => $fileMeta['mime_type'],
                    'payment_date' => $data['payment_date'],
                    'payment_reference' => $data['payment_reference'] ?? null,
                    'payment_note' => $data['payment_note'] ?? null,
                    'proof_submitted_at' => $now,
                    'proof_submitted_by' => (int) $ownedBill->billing_contact_user_id,
                    'approved_by' => null,
                    'approved_at' => null,
                    'rejected_by' => null,
                    'rejected_at' => null,
                    'rejection_reason' => null,
                    'updated_at' => $now,
                ]);

                $this->writeReview([
                    'bill_id' => (int) $locked->id,
                    'community_id' => (int) $locked->community_id,
                    'service_id' => (int) $locked->service_id,
                    'unit_id' => (int) $locked->unit_id,
                    'actor_id' => (int) $locked->billing_contact_user_id,
                    'action' => self::ACTION_SUBMITTED,
                    'status_from' => (string) $locked->status,
                    'status_to' => self::STATUS_PENDING,
                    'proof_file_path' => $fileMeta['file_path'],
                    'proof_file_name' => $fileMeta['file_name'],
                    'proof_file_size' => $fileMeta['file_size'],
                    'proof_mime_type' => $fileMeta['mime_type'],
                    'payment_date' => $data['payment_date'],
                    'payment_reference' => $data['payment_reference'] ?? null,
                    'payment_note' => $data['payment_note'] ?? null,
                ]);
            });
        } catch (\Throwable $e) {
            $this->deleteStoredFile($fileMeta['file_path'] ?? null);
            throw $e;
        }

        app(UnitServiceBillReminderService::class)->notifyProofSubmitted($ownedBill);

        return $this->formatResidentBill(
            $this->findOwnedBill((int) $ownedBill->id, (int) $ownedBill->billing_contact_user_id, (int) $ownedBill->community_id),
            $request,
        );
    }

    public function approvePayment(object $bill, int $adminId, Request $request): array
    {
        $this->reviewPayment($bill, $adminId, self::ACTION_APPROVED, self::STATUS_PAID);
        $updated = $this->findAdminBill((int) $bill->id, (int) $bill->community_id);
        abort_if(! $updated, 500, 'Payment could not be loaded after approval.');

        $this->hideFinanceNoticeFromHome($updated);
        app(UnitServiceBillReminderService::class)->notifyApproved($updated, (string) ($updated->service_name ?? 'service'));

        return $this->formatAdminBill($updated, $request);
    }

    public function rejectPayment(object $bill, int $adminId, string $reason, Request $request): array
    {
        $this->reviewPayment($bill, $adminId, self::ACTION_REJECTED, self::STATUS_REJECTED, $reason);
        $updated = $this->findAdminBill((int) $bill->id, (int) $bill->community_id);
        abort_if(! $updated, 500, 'Payment could not be loaded after rejection.');

        app(UnitServiceBillReminderService::class)->notifyRejected($updated);

        return $this->formatAdminBill($updated, $request);
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

    public function listReviews(int $billId, int $communityId, Request $request): array
    {
        abort_if(! $this->findAdminBill($billId, $communityId), 404, 'Bill not found.');

        return DB::table('unit_service_bill_reviews as r')
            ->leftJoin('users as actor', 'actor.id', '=', 'r.actor_id')
            ->leftJoin('profiles as actor_profile', 'actor_profile.user_id', '=', 'actor.id')
            ->where('r.bill_id', $billId)
            ->orderBy('r.created_at')
            ->orderBy('r.id')
            ->select([
                'r.id', 'r.action', 'r.actor_id', 'actor.name as actor_name',
                'actor_profile.display_name as actor_display_name',
                'r.status_from', 'r.status_to', 'r.proof_file_path', 'r.proof_file_name',
                'r.proof_file_size', 'r.proof_mime_type', 'r.payment_date',
                'r.payment_reference', 'r.payment_note', 'r.rejection_reason', 'r.created_at',
            ])
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'action' => $row->action,
                'actor_id' => $row->actor_id ? (int) $row->actor_id : null,
                'actor_name' => $this->preferredPersonName($row->actor_display_name ?? null, $row->actor_name ?? null),
                'status_from' => $row->status_from,
                'status_to' => $row->status_to,
                'proof' => $this->formatPaymentProof($row, $request),
                'rejection_reason' => $row->rejection_reason,
                'created_at' => $row->created_at,
            ])
            ->all();
    }

    public function requestSubscription(object $service, object $unit, int $userId, ?string $note = null): array
    {
        if ($service->application_type !== PropertyServiceCatalogService::TYPE_OPTIONAL) {
            throw ValidationException::withMessages([
                'service' => 'Only optional services can be subscribed.',
            ]);
        }
        if ((int) ($unit->billing_contact_user_id ?? 0) !== $userId) {
            throw ValidationException::withMessages([
                'service' => self::NOT_BILLING_CONTACT_MESSAGE,
            ]);
        }
        if (($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
            throw ValidationException::withMessages([
                'service' => 'This service is not accepting subscriptions.',
            ]);
        }

        $existing = DB::table('unit_service_subscriptions')
            ->where('service_id', $service->id)
            ->where('unit_id', $unit->id)
            ->first();

        if ($existing && in_array($existing->status, [self::SUB_PENDING, self::SUB_ACTIVE], true)) {
            throw ValidationException::withMessages([
                'service' => $existing->status === self::SUB_PENDING
                    ? 'A subscription request is already pending.'
                    : 'This unit is already subscribed.',
            ]);
        }

        $activeCount = DB::table('unit_service_subscriptions')
            ->where('service_id', $service->id)
            ->where('status', self::SUB_ACTIVE)
            ->count();
        if ($service->max_subscribers && $activeCount >= (int) $service->max_subscribers) {
            throw ValidationException::withMessages([
                'service' => 'This service has reached its subscriber limit.',
            ]);
        }

        $now = now();
        $payload = [
            'community_id' => (int) $service->community_id,
            'service_id' => (int) $service->id,
            'unit_id' => (int) $unit->id,
            'requested_by' => $userId,
            'status' => self::SUB_PENDING,
            'note' => $note,
            'starts_at' => null,
            'ends_at' => null,
            'cancelled_at' => null,
            'cancelled_by' => null,
            'reviewed_by' => null,
            'reviewed_at' => null,
            'rejection_reason' => null,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('unit_service_subscriptions')->where('id', $existing->id)->update($payload);
            $id = (int) $existing->id;
        } else {
            $id = (int) DB::table('unit_service_subscriptions')->insertGetId(array_merge($payload, [
                'created_at' => $now,
            ]));
        }

        $this->notifyAdminsSubscriptionPending($service, $unit, $userId);

        return $this->formatSubscription(DB::table('unit_service_subscriptions')->find($id));
    }

    public function cancelSubscription(object $service, object $unit, int $userId): array
    {
        if ((int) ($unit->billing_contact_user_id ?? 0) !== $userId) {
            throw ValidationException::withMessages([
                'service' => self::NOT_BILLING_CONTACT_MESSAGE,
            ]);
        }

        $subscription = DB::table('unit_service_subscriptions')
            ->where('service_id', $service->id)
            ->where('unit_id', $unit->id)
            ->first();
        abort_if(! $subscription || $subscription->status !== self::SUB_ACTIVE, 422, 'No active subscription found.');

        $now = now();
        if (($service->unsubscribe_mode ?? 'end_of_period') === 'immediate') {
            DB::table('unit_service_subscriptions')->where('id', $subscription->id)->update([
                'status' => self::SUB_CANCELLED,
                'cancelled_at' => $now,
                'cancelled_by' => $userId,
                'ends_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('unit_service_subscriptions')->where('id', $subscription->id)->update([
                'ends_at' => now()->endOfMonth(),
                'cancelled_at' => $now,
                'cancelled_by' => $userId,
                'updated_at' => $now,
            ]);
        }

        return $this->formatSubscription(DB::table('unit_service_subscriptions')->find($subscription->id));
    }

    public function reviewSubscription(object $subscription, int $adminId, string $action, ?string $reason = null): array
    {
        if (($subscription->status ?? '') !== self::SUB_PENDING) {
            throw ValidationException::withMessages([
                'subscription' => 'Only pending subscription requests can be reviewed.',
            ]);
        }

        $service = DB::table('property_services')->find($subscription->service_id);
        $serviceName = trim((string) ($service?->name ?? ''));
        if ($serviceName === '') {
            $serviceName = 'this service';
        }

        $now = now();
        if ($action === 'approve') {
            if ($service && ($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    'subscription' => 'This service is not accepting subscriptions.',
                ]);
            }
            $activeCount = DB::table('unit_service_subscriptions')
                ->where('service_id', $subscription->service_id)
                ->where('status', self::SUB_ACTIVE)
                ->count();
            if ($service && $service->max_subscribers && $activeCount >= (int) $service->max_subscribers) {
                throw ValidationException::withMessages([
                    'subscription' => 'This service has reached its subscriber limit.',
                ]);
            }
            DB::table('unit_service_subscriptions')->where('id', $subscription->id)->update([
                'status' => self::SUB_ACTIVE,
                'starts_at' => $now,
                'reviewed_by' => $adminId,
                'reviewed_at' => $now,
                'rejection_reason' => null,
                'updated_at' => $now,
            ]);
            if ($service) {
                $unit = DB::table('units')->find($subscription->unit_id);
                if ($unit) {
                    $this->generateSubscriptionBill($service, $unit, $adminId);
                }
            }
        } else {
            DB::table('unit_service_subscriptions')->where('id', $subscription->id)->update([
                'status' => self::SUB_REJECTED,
                'reviewed_by' => $adminId,
                'reviewed_at' => $now,
                'rejection_reason' => $reason,
                'updated_at' => $now,
            ]);
            $this->removeUnpaidSubscriptionBills((int) $subscription->service_id, (int) $subscription->unit_id);
        }

        $updated = DB::table('unit_service_subscriptions')->find($subscription->id);
        if ($updated->requested_by) {
            $declineBody = "Your subscription request for {$serviceName} has been declined.";
            if ($reason) {
                $declineBody .= ' Reason: '.$reason;
            }
            NotificationService::send(
                (int) $updated->requested_by,
                $action === 'approve' ? 'success' : 'warning',
                $action === 'approve' ? 'Subscription approved' : 'Subscription declined',
                $action === 'approve'
                    ? "Your subscription request for {$serviceName} has been approved."
                    : $declineBody,
                '/screens/property-management/available-services',
                ['kind' => 'service_subscription_'.$action, 'subscription_id' => (int) $updated->id],
            );
        }

        return $this->formatSubscription($updated);
    }

    public function listAdminSubscriptions(int $communityId, ?int $serviceId = null, bool $optionalOnly = false): array
    {
        $latestBills = DB::table('unit_service_bills')
            ->select('service_id', 'unit_id', DB::raw('MAX(id) as latest_id'))
            ->where('community_id', $communityId)
            ->when($serviceId, fn ($query) => $query->where('service_id', $serviceId))
            ->groupBy('service_id', 'unit_id');

        $query = DB::table('unit_service_subscriptions as uss')
            ->join('property_services as ps', 'ps.id', '=', 'uss.service_id')
            ->join('units', 'units.id', '=', 'uss.unit_id')
            ->leftJoin('users', 'users.id', '=', 'uss.requested_by')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoinSub($latestBills, 'latest_bills', function ($join) {
                $join->on('latest_bills.service_id', '=', 'uss.service_id')
                    ->on('latest_bills.unit_id', '=', 'uss.unit_id');
            })
            ->leftJoin('unit_service_bills as bill', 'bill.id', '=', 'latest_bills.latest_id')
            ->leftJoin('users as acknowledger', 'acknowledger.id', '=', 'bill.acknowledged_by')
            ->leftJoin('profiles as acknowledger_profile', 'acknowledger_profile.user_id', '=', 'acknowledger.id')
            ->where('uss.community_id', $communityId)
            ->select([
                'uss.*',
                'ps.name as service_name',
                'units.unit_number',
                'users.name as requester_name',
                'profiles.display_name',
                'bill.id as latest_bill_id',
                'bill.title as latest_bill_title',
                'bill.status as latest_bill_status',
                'bill.amount as latest_bill_amount',
                'bill.billing_period as latest_billing_period',
                'bill.due_date as latest_bill_due_date',
                'bill.acknowledged_at as latest_bill_acknowledged_at',
                'acknowledger.name as latest_acknowledged_by_name',
                'acknowledger_profile.display_name as latest_acknowledged_by_display_name',
            ])
            ->orderByRaw("CASE uss.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END")
            ->orderByDesc('uss.id');

        if ($serviceId) {
            $query->where('uss.service_id', $serviceId);
        }

        if ($optionalOnly) {
            $query->where('ps.application_type', 'optional');
        }

        return $query->get()->map(fn ($row) => $this->formatSubscription($row))->all();
    }

    public function expireEndedSubscriptions(): int
    {
        return DB::table('unit_service_subscriptions')
            ->where('status', self::SUB_ACTIVE)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<=', now())
            ->update([
                'status' => self::SUB_CANCELLED,
                'updated_at' => now(),
            ]);
    }

    public function findBillForNotice(int $noticeId): ?array
    {
        if ($noticeId < 1
            || ! Schema::hasTable('unit_service_bills')
            || ! Schema::hasColumn('unit_service_bills', 'notice_id')) {
            return null;
        }

        $row = DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->where('usb.notice_id', $noticeId)
            ->select([
                'usb.id',
                'usb.status',
                'usb.amount',
                'usb.due_date',
                'usb.billing_period',
                'ps.name as service_name',
                'ps.billing_frequency',
                'units.unit_number',
            ])
            ->first();

        if (! $row) {
            return null;
        }

        return [
            'id' => (int) $row->id,
            'service_name' => $row->service_name,
            'unit_number' => $row->unit_number,
            'amount' => $row->amount !== null ? (float) $row->amount : null,
            'due_date' => $row->due_date,
            'billing_period' => $row->billing_period,
            'billing_frequency' => $row->billing_frequency ?? null,
            'status' => (string) $row->status,
            'status_label' => $this->statusLabel((string) $row->status),
        ];
    }

    public function statusLabel(string $status): string
    {
        return match ($status) {
            self::STATUS_UNPAID => 'Unpaid',
            self::STATUS_ACKNOWLEDGED => 'Acknowledged',
            self::STATUS_PENDING => 'Pending verification',
            self::STATUS_PAID => 'Paid',
            self::STATUS_REJECTED => 'Rejected',
            self::STATUS_OVERDUE => 'Overdue',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }

    private function eligibleUnitsForGeneration(object $service): array
    {
        $this->expireEndedSubscriptions();
        $units = app(UnitAssignmentService::class)->eligibleResidentialUnits((int) $service->community_id);

        if ($service->application_type === PropertyServiceCatalogService::TYPE_OPTIONAL) {
            $subscribedIds = DB::table('unit_service_subscriptions')
                ->where('service_id', $service->id)
                ->where('status', self::SUB_ACTIVE)
                ->pluck('unit_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            return array_values(array_filter($units, fn ($unit) => in_array((int) $unit->id, $subscribedIds, true)));
        }

        $assignments = app(UnitAssignmentService::class);

        return array_values(array_filter(
            $units,
            fn ($unit) => $assignments->hasActiveResident((int) $unit->id),
        ));
    }

    private function generateSubscriptionBill(object $service, object $unit, int $createdBy): void
    {
        try {
            $this->generateBillForUnit($service, $unit, $createdBy);
        } catch (ValidationException) {
            // Subscription still succeeds if the first bill cannot be generated yet.
        }
    }

    public function generateBillForUnit(object $service, object $unit, int $createdBy, array $data = []): ?int
    {
        if (($service->status ?? '') !== PropertyServiceCatalogService::STATUS_ACTIVE) {
            return null;
        }

        if (($service->application_type ?? '') === PropertyServiceCatalogService::TYPE_AUTOMATIC
            && ! app(UnitAssignmentService::class)->hasActiveResident((int) $unit->id)) {
            return null;
        }

        $isOneTime = ($service->billing_frequency ?? '') === PropertyServiceCatalogService::FREQUENCY_ONE_TIME;
        $period = $this->normalizeBillingMonth((string) ($data['billing_period'] ?? (
            $isOneTime ? now()->toDateString() : $this->currentBillingPeriod($service)
        )));

        $alreadyBilled = DB::table('unit_service_bills')
            ->where('service_id', $service->id)
            ->where('unit_id', $unit->id)
            ->when($isOneTime, fn ($query) => $query, fn ($query) => $query->where('billing_period', $period))
            ->exists();
        if ($alreadyBilled) {
            return null;
        }

        $amount = $this->resolveGenerateAmount($service, $data);
        $dueDate = $data['due_date'] ?? $this->defaultDueDate($service, $period);
        $title = trim((string) ($data['title'] ?? (
            $isOneTime ? $service->name.' — one-time fee' : $this->defaultTitle($service, $period)
        )));
        [$unit, $contactId] = $this->prepareUnitForBilling($unit);
        $now = now();

        $billId = (int) DB::table('unit_service_bills')->insertGetId([
            'community_id' => (int) $service->community_id,
            'service_id' => (int) $service->id,
            'unit_id' => (int) $unit->id,
            'billing_contact_user_id' => $contactId,
            'created_by' => $createdBy,
            'billing_period' => $period,
            'title' => $title,
            'description' => null,
            'amount' => $amount,
            'due_date' => $dueDate,
            'status' => self::STATUS_UNPAID,
            'payment_instructions' => $service->payment_instructions,
            'require_acknowledgement' => (bool) $service->require_acknowledgement,
            'require_payment_proof' => (bool) $service->require_payment_proof,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $bill = DB::table('unit_service_bills')->find($billId);
        if ($bill && $contactId) {
            if ($service->send_notification ?? true) {
                app(UnitServiceBillReminderService::class)->notifyCreated(
                    $bill,
                    (string) $service->name,
                    (string) ($unit->unit_number ?? ''),
                );
            }
            $this->publishFinanceNotice($service, $bill, $createdBy, (string) ($unit->unit_number ?? ''));
        } elseif (! $contactId) {
            app(UnitAssignmentService::class)->notifyAdminsMissingBillingContact(
                (int) $service->community_id,
                (string) ($unit->unit_number ?? ''),
                (string) $service->name,
                (int) $unit->id,
            );
        }

        return $billId;
    }

    /** Create missing current-period bills when a unit gains a billing contact after services were published. */
    public function syncDueAutomaticBillsForUnit(int $unitId, int $communityId, int $actorId = 0): void
    {
        $units = app(UnitAssignmentService::class);
        $unit = $units->refreshBillingContactIfStale($unitId);
        if (! $unit
            || (int) ($unit->community_id ?? 0) !== $communityId
            || ($unit->kind ?? '') !== UnitAssignmentService::KIND_RESIDENTIAL
            || ($unit->status ?? '') !== UnitAssignmentService::STATUS_ACTIVE) {
            return;
        }

        if (! $units->hasActiveResident($unitId) || ! $units->effectiveBillingContactUserId($unit)) {
            return;
        }

        $services = DB::table('property_services')
            ->where('community_id', $communityId)
            ->where('status', PropertyServiceCatalogService::STATUS_ACTIVE)
            ->where('application_type', PropertyServiceCatalogService::TYPE_AUTOMATIC)
            ->where('auto_generate_bills', true)
            ->get();

        foreach ($services as $service) {
            if (! $this->currentPeriodIsDue($service)) {
                continue;
            }

            $period = $this->currentBillingPeriod($service);
            $exists = DB::table('unit_service_bills')
                ->where('service_id', $service->id)
                ->where('unit_id', $unitId)
                ->where('billing_period', $period)
                ->exists();
            if ($exists) {
                continue;
            }

            try {
                $this->generateBillForUnit($service, $unit, $actorId, ['billing_period' => $period]);
            } catch (ValidationException) {
                // Another request may have created the same period bill.
            }
        }
    }

    public function syncDueAutomaticBillsForBillingContact(int $communityId, int $userId): void
    {
        $unitIds = DB::table('units')
            ->where('community_id', $communityId)
            ->where('kind', UnitAssignmentService::KIND_RESIDENTIAL)
            ->where('status', UnitAssignmentService::STATUS_ACTIVE)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach ($unitIds as $unitId) {
            $unit = DB::table('units')->find($unitId);
            if (! $unit) {
                continue;
            }
            if (app(UnitAssignmentService::class)->effectiveBillingContactUserId($unit) !== $userId) {
                continue;
            }
            $this->syncDueAutomaticBillsForUnit($unitId, $communityId, $userId);
        }
    }

    /** @return array{0: object, 1: ?int} */
    private function prepareUnitForBilling(object $unit): array
    {
        $units = app(UnitAssignmentService::class);
        $fresh = $units->refreshBillingContactIfStale((int) $unit->id) ?? $unit;
        $contactId = $units->effectiveBillingContactUserId($fresh);

        return [$fresh, $contactId];
    }

    private function backfillMissingSubscriptionBills(int $communityId, int $userId): void
    {
        $unitIds = DB::table('units')
            ->where('community_id', $communityId)
            ->where('billing_contact_user_id', $userId)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        if ($unitIds === []) {
            return;
        }

        $subscriptions = DB::table('unit_service_subscriptions')
            ->where('community_id', $communityId)
            ->whereIn('unit_id', $unitIds)
            ->where('status', self::SUB_ACTIVE)
            ->get();

        foreach ($subscriptions as $subscription) {
            $hasBill = DB::table('unit_service_bills')
                ->where('service_id', $subscription->service_id)
                ->where('unit_id', $subscription->unit_id)
                ->exists();
            if ($hasBill) {
                continue;
            }

            $service = DB::table('property_services')->find($subscription->service_id);
            $unit = DB::table('units')->find($subscription->unit_id);
            if ($service && $unit) {
                $this->generateSubscriptionBill($service, $unit, $userId);
            }
        }
    }

    private function removeUnpaidSubscriptionBills(int $serviceId, int $unitId): void
    {
        $bills = DB::table('unit_service_bills')
            ->where('service_id', $serviceId)
            ->where('unit_id', $unitId)
            ->whereIn('status', [self::STATUS_UNPAID, self::STATUS_OVERDUE, self::STATUS_REJECTED])
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('payment_attempts')
                    ->whereColumn('payment_attempts.payable_id', 'unit_service_bills.id')
                    ->where('payment_attempts.payable_type', \App\Models\PaymentAttempt::PAYABLE_SERVICE_BILL)
                    ->whereIn('payment_attempts.status', \App\Models\PaymentAttempt::ACTIVE_STATUSES);
            })
            ->get(['id', 'notice_id']);
        if ($bills->isEmpty()) {
            return;
        }

        $noticeIds = $bills->pluck('notice_id')->filter()->map(fn ($id) => (int) $id)->all();
        DB::table('unit_service_bills')->whereIn('id', $bills->pluck('id'))->delete();
        if ($noticeIds !== []) {
            DB::table('notice_recipients')->whereIn('notice_id', $noticeIds)->delete();
            DB::table('notices')->whereIn('id', $noticeIds)->where('category', 'finance')->delete();
        }
    }

    private function notifyAdminsSubscriptionPending(object $service, object $unit, int $requestedBy): void
    {
        $adminIds = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $service->community_id)
            ->whereIn('cm.role', ['admin', 'moderator'])
            ->where('cm.status', 'approved')
            ->where('users.status', '!=', 'deleted')
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $unitNumber = (string) ($unit->unit_number ?? '');
        foreach ($adminIds as $adminId) {
            NotificationService::send(
                $adminId,
                'info',
                'Service subscription pending',
                "{$unitNumber} requested {$service->name}. Review the request in Services.",
                '/screens/admin-amenities',
                [
                    'kind' => 'service_subscription_pending',
                    'service_id' => (int) $service->id,
                    'unit_id' => (int) $unit->id,
                    'requested_by' => $requestedBy,
                ],
            );
        }
    }

    private function resolveGenerateAmount(object $service, array $data): float
    {
        if (isset($data['amount']) && (float) $data['amount'] > 0) {
            return round((float) $data['amount'], 2);
        }

        if ($service->amount !== null && (float) $service->amount > 0) {
            return round((float) $service->amount, 2);
        }

        throw ValidationException::withMessages([
            'amount' => 'Set a service amount before bills can be generated.',
        ]);
    }

    private function yearlyDueAnchor(object $service, string $period): Carbon
    {
        $first = $service->first_billing_month
            ? Carbon::parse($service->first_billing_month)
            : Carbon::parse($period);
        $year = max((int) now()->year, (int) Carbon::parse($period)->year, (int) $first->year);
        return Carbon::create($year, (int) $first->month, 1)->startOfMonth();
    }

    private function defaultDueDate(object $service, string $period): string
    {
        $day = max(1, min(31, (int) ($service->due_day ?: 10)));
        $anchor = $this->isYearlyService($service)
            ? $this->yearlyDueAnchor($service, $period)
            : Carbon::parse($period)->startOfMonth();
        $date = $anchor->copy()->day($day);
        if ($date->month !== $anchor->month) {
            $date = $anchor->copy()->endOfMonth();
        }

        return $date->toDateString();
    }

    private function defaultTitle(object $service, string $period): string
    {
        $label = $this->isYearlyService($service)
            ? Carbon::parse($period)->format('Y')
            : Carbon::parse($period)->format('F Y');

        return $service->name.' — '.$label;
    }

    private function interpolateNoticeTemplate(string $template, object $service, object $bill, string $unitNumber): string
    {
        $serviceName = trim((string) ($service->name ?? '')) ?: 'Service';
        $period = $bill->billing_period ?? $bill->billing_month ?? null;
        $month = ! empty($period) ? Carbon::parse((string) $period)->format('F Y') : '';
        $amountValue = (float) ($bill->amount ?? 0);
        $amount = abs($amountValue - round($amountValue)) < 0.001
            ? '$'.number_format($amountValue, 0)
            : '$'.number_format($amountValue, 2);

        return (string) preg_replace_callback(
            '/\{\{\s*(service|unit|month|amount)\s*\}\}/i',
            function (array $match) use ($serviceName, $unitNumber, $month, $amount) {
                return match (strtolower($match[1])) {
                    'service' => $serviceName,
                    'unit' => $unitNumber,
                    'month' => $month,
                    'amount' => $amount,
                    default => $match[0],
                };
            },
            $template,
        );
    }

    private function resolveFinanceNoticeTitle(object $service, object $bill, string $unitNumber): string
    {
        $template = trim((string) ($service->notice_title ?? ''));
        if ($template === '') {
            $template = '{{service}} — Unit {{unit}}';
        }

        $title = $this->interpolateNoticeTemplate($template, $service, $bill, $unitNumber);
        if (trim($title) === '' || preg_match('/\{\{\s*(service|unit|month|amount)\s*\}\}/i', $title)) {
            $name = trim((string) ($service->name ?? '')) ?: 'Service';
            $title = $unitNumber !== '' ? "{$name} — Unit {$unitNumber}" : $name;
        }

        return $title;
    }

    private function resolveFinanceNoticeBody(object $service, object $bill, string $unitNumber): string
    {
        $template = trim((string) ($service->notice_body ?? ''));
        if ($template === '') {
            return app(UnitServiceBillReminderService::class)->createdMessage(
                (string) ($service->name ?? 'service'),
                $bill,
            );
        }

        $body = $this->interpolateNoticeTemplate($template, $service, $bill, $unitNumber);
        if (preg_match('/\{\{\s*(service|unit|month|amount)\s*\}\}/i', $body)) {
            return app(UnitServiceBillReminderService::class)->createdMessage(
                (string) ($service->name ?? 'service'),
                $bill,
            );
        }

        return $body;
    }

    private function publishFinanceNotice(object $service, object $bill, int $authorId, string $unitNumber): void
    {
        if (! $bill->billing_contact_user_id || ! ($service->send_notice ?? true)) {
            return;
        }

        $title = $this->resolveFinanceNoticeTitle($service, $bill, $unitNumber);
        $body = $this->resolveFinanceNoticeBody($service, $bill, $unitNumber);

        try {
            $noticeId = DB::table('notices')->insertGetId([
                'community_id' => (int) $service->community_id,
                'author_id' => $authorId ?: (int) $bill->billing_contact_user_id,
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
            DB::table('notice_recipients')->insert([
                'notice_id' => $noticeId,
                'user_id' => (int) $bill->billing_contact_user_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('unit_service_bills')->where('id', $bill->id)->update([
                'notice_id' => $noticeId,
                'updated_at' => now(),
            ]);
        } catch (\Throwable) {
            // Notice schema can vary slightly between environments; billing must still succeed.
        }
    }

    private function hideFinanceNoticeFromHome(object $bill): void
    {
        $noticeId = (int) ($bill->notice_id ?? 0);
        if ($noticeId < 1) {
            return;
        }

        try {
            $updates = [
                'status' => 'published',
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('notices', 'event_date')) {
                // Past schedule hides the bill from Home, but Community Updates still lists it.
                $updates['event_date'] = now()->subDay()->toDateString();
            }
            DB::table('notices')->where('id', $noticeId)->update($updates);
        } catch (\Throwable) {
            // Hiding from Home is best-effort; approval must still succeed.
        }
    }

    private function reviewPayment(object $bill, int $adminId, string $action, string $statusTo, ?string $reason = null): void
    {
        if (($bill->status ?? '') !== self::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'bill' => 'Only payments pending verification can be reviewed.',
            ]);
        }

        DB::transaction(function () use ($bill, $adminId, $action, $statusTo, $reason) {
            $locked = DB::table('unit_service_bills')->where('id', $bill->id)->lockForUpdate()->first();
            abort_if(! $locked, 404, 'Bill not found.');
            if (($locked->status ?? '') !== self::STATUS_PENDING) {
                throw ValidationException::withMessages([
                    'bill' => 'Only payments pending verification can be reviewed.',
                ]);
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
                $updates['rejection_reason'] = $reason;
            }

            DB::table('unit_service_bills')->where('id', $bill->id)->update($updates);
            $this->writeReview([
                'bill_id' => (int) $locked->id,
                'community_id' => (int) $locked->community_id,
                'service_id' => (int) $locked->service_id,
                'unit_id' => (int) $locked->unit_id,
                'actor_id' => $adminId,
                'action' => $action,
                'status_from' => (string) $locked->status,
                'status_to' => $statusTo,
                'rejection_reason' => $reason,
            ]);
        });
    }

    private function mustAcknowledgeBeforePayment(object $bill): bool
    {
        return (bool) ($bill->require_acknowledgement ?? false)
            && empty($bill->acknowledged_at)
            && in_array((string) ($bill->status ?? ''), [self::STATUS_UNPAID, self::STATUS_OVERDUE, self::STATUS_REJECTED], true);
    }

    private function assertAcknowledgedIfRequired(object $bill): void
    {
        if ($this->mustAcknowledgeBeforePayment($bill)) {
            throw ValidationException::withMessages([
                'bill' => 'Acknowledge this bill before uploading payment proof.',
            ]);
        }
    }

    private function assertCanSubmitProof(string $status): void
    {
        if ($status === self::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'file' => 'Payment proof has already been submitted and is pending verification.',
            ]);
        }
        if ($status === self::STATUS_PAID) {
            throw ValidationException::withMessages([
                'file' => 'This bill is already marked as paid.',
            ]);
        }
        if (! in_array($status, [self::STATUS_UNPAID, self::STATUS_ACKNOWLEDGED, self::STATUS_REJECTED, self::STATUS_OVERDUE], true)) {
            throw ValidationException::withMessages([
                'file' => 'This bill is no longer active.',
            ]);
        }
    }

    private function writeReview(array $row): void
    {
        DB::table('unit_service_bill_reviews')->insert(array_merge($row, [
            'created_at' => now(),
            'updated_at' => now(),
        ]));
    }

    private function adminBillQuery(int $communityId)
    {
        return DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->leftJoin('users', 'users.id', '=', DB::raw('COALESCE(usb.billing_contact_user_id, units.billing_contact_user_id)'))
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('users as acknowledger', 'acknowledger.id', '=', 'usb.acknowledged_by')
            ->leftJoin('profiles as acknowledger_profile', 'acknowledger_profile.user_id', '=', 'acknowledger.id')
            ->where('usb.community_id', $communityId)
            ->select($this->adminBillSelect());
    }

    private function adminBillSelect(): array
    {
        return [
            'usb.*',
            'ps.name as service_name',
            'ps.application_type',
            'ps.billing_frequency',
            'units.unit_number',
            'units.billing_contact_user_id as unit_billing_contact_user_id',
            'users.name as billing_contact_name',
            'profiles.display_name as billing_contact_display_name',
            'acknowledger.name as acknowledged_by_user_name',
            'acknowledger_profile.display_name as acknowledged_by_display_name',
        ];
    }

    private function residentBillSelect(): array
    {
        return [
            'usb.*',
            'ps.name as service_name',
            'ps.application_type',
            'ps.billing_frequency',
            'units.unit_number',
        ];
    }

    private function formatAdminBill(?object $row, Request $request): array
    {
        abort_if(! $row, 404, 'Bill not found.');

        $contactId = (int) ($row->billing_contact_user_id ?: ($row->unit_billing_contact_user_id ?? 0));
        $contactName = $row->billing_contact_display_name ?? $row->billing_contact_name ?? null;

        return array_merge($this->formatBillCore($row, $request), [
            'billing_contact' => $contactId > 0 ? [
                'id' => $contactId,
                'name' => $contactName,
            ] : null,
            'missing_billing_contact' => $contactId < 1,
            'can_review' => (string) $row->status === self::STATUS_PENDING,
            'acknowledged_by' => ! empty($row->acknowledged_by) ? (int) $row->acknowledged_by : null,
            'acknowledged_by_name' => $this->preferredPersonName(
                $row->acknowledged_by_display_name ?? null,
                $row->acknowledged_by_user_name ?? null,
            ),
        ]);
    }

    private function attachCurrentBillingContacts(int $communityId): void
    {
        $units = app(UnitAssignmentService::class);
        foreach ($units->eligibleResidentialUnits($communityId) as $unit) {
            $contactId = $units->effectiveBillingContactUserId($unit);
            if (! $contactId) {
                continue;
            }

            $billIds = DB::table('unit_service_bills')
                ->where('community_id', $communityId)
                ->where('unit_id', (int) $unit->id)
                ->where(function ($query) use ($contactId) {
                    $query->whereNull('billing_contact_user_id')
                        ->orWhere('billing_contact_user_id', '!=', $contactId);
                })
                // A proof under review belongs to whoever submitted it, so it never moves.
                ->whereIn('status', [
                    self::STATUS_UNPAID,
                    self::STATUS_OVERDUE,
                    self::STATUS_ACKNOWLEDGED,
                    self::STATUS_REJECTED,
                ])
                ->whereNotExists(function ($query) {
                    $query->select(DB::raw(1))
                        ->from('payment_attempts')
                        ->whereColumn('payment_attempts.payable_id', 'unit_service_bills.id')
                        ->where('payment_attempts.payable_type', \App\Models\PaymentAttempt::PAYABLE_SERVICE_BILL)
                        ->whereIn('payment_attempts.status', \App\Models\PaymentAttempt::ACTIVE_STATUSES);
                })
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            foreach ($billIds as $billId) {
                $bill = DB::table('unit_service_bills')->find($billId);
                if (! $bill) {
                    continue;
                }

                $updates = [
                    'billing_contact_user_id' => $contactId,
                    'updated_at' => now(),
                ];
                if (! empty($bill->billing_contact_user_id)) {
                    // The previous contact's proof and payment notes stay in the review history, not on the new contact's bill.
                    $updates += [
                        'proof_file_path' => null,
                        'proof_file_name' => null,
                        'proof_file_size' => null,
                        'proof_mime_type' => null,
                        'payment_date' => null,
                        'payment_reference' => null,
                        'payment_note' => null,
                        'proof_submitted_at' => null,
                        'proof_submitted_by' => null,
                        'rejection_reason' => null,
                    ];
                    if ((string) $bill->status === self::STATUS_REJECTED) {
                        $updates['status'] = Carbon::parse((string) $bill->due_date)->endOfDay()->isPast()
                            ? self::STATUS_OVERDUE
                            : self::STATUS_UNPAID;
                    }
                }
                DB::table('unit_service_bills')->where('id', $billId)->update($updates);

                $bill = DB::table('unit_service_bills')->find($billId);
                if (! $bill || ! empty($bill->notice_id)) {
                    continue;
                }

                $service = DB::table('property_services')->find($bill->service_id);
                if ($service) {
                    $this->publishFinanceNotice(
                        $service,
                        $bill,
                        (int) ($bill->created_by ?? $contactId),
                        (string) ($unit->unit_number ?? ''),
                    );
                }
            }
        }
    }

    private function formatResidentBill(?object $row, Request $request): array
    {
        abort_if(! $row, 404, 'Bill not found.');
        $core = $this->formatBillCore($row, $request);
        $core['can_acknowledge'] = (bool) $row->require_acknowledgement
            && empty($row->acknowledged_at)
            && in_array((string) $row->status, [self::STATUS_UNPAID, self::STATUS_OVERDUE], true);
        $core['can_submit_proof'] = in_array((string) $row->status, [
            self::STATUS_UNPAID, self::STATUS_ACKNOWLEDGED, self::STATUS_REJECTED, self::STATUS_OVERDUE,
        ], true) && ! $this->mustAcknowledgeBeforePayment($row);
        $core['online_payment'] = app(\App\Services\Payments\OnlinePaymentPresenter::class)->forPayable(
            \App\Models\PaymentAttempt::PAYABLE_SERVICE_BILL,
            (int) $row->id,
            (int) $row->community_id,
        );

        return $core;
    }

    private function preferredPersonName(mixed $displayName, mixed $userName): ?string
    {
        $display = trim((string) $displayName);
        if ($display !== '') {
            return $display;
        }
        $name = trim((string) $userName);

        return $name !== '' ? $name : null;
    }

    /** Settles a bill from a confirmed KuickPay payment, with the same follow-ups as an admin approval. */
    public function applyOnlinePayment(int $billId, \App\Models\PaymentAttempt $attempt): bool
    {
        $applied = DB::transaction(function () use ($billId, $attempt) {
            $locked = DB::table('unit_service_bills')->where('id', $billId)->lockForUpdate()->first();
            if (! $locked || (string) $locked->status === self::STATUS_PAID) {
                return false;
            }

            $now = now();
            DB::table('unit_service_bills')->where('id', $billId)->update([
                'status' => self::STATUS_PAID,
                'payment_method' => 'kuickpay',
                'payment_attempt_id' => $attempt->id,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $attempt->reference,
                'payment_note' => 'Paid online with KuickPay'.($attempt->methodLabel() ? ' ('.$attempt->methodLabel().')' : '').'.',
                'proof_submitted_at' => $now,
                'proof_submitted_by' => (int) $attempt->user_id,
                'approved_by' => null,
                'approved_at' => $now,
                'rejected_by' => null,
                'rejected_at' => null,
                'rejection_reason' => null,
                'updated_at' => $now,
            ]);

            $this->writeReview([
                'bill_id' => (int) $locked->id,
                'community_id' => (int) $locked->community_id,
                'service_id' => (int) $locked->service_id,
                'unit_id' => (int) $locked->unit_id,
                'actor_id' => (int) $attempt->user_id,
                'action' => 'paid_online',
                'status_from' => (string) $locked->status,
                'status_to' => self::STATUS_PAID,
                'payment_date' => $now->toDateString(),
                'payment_reference' => $attempt->reference,
                'payment_note' => 'Paid online with KuickPay',
            ]);

            return true;
        });

        if ($applied) {
            $updated = $this->findAdminBill($billId, (int) $attempt->community_id);
            if ($updated) {
                $this->hideFinanceNoticeFromHome($updated);
            }
        }

        return $applied;
    }

    private function formatBillCore(object $row, Request $request): array
    {
        return [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'service_id' => (int) $row->service_id,
            'service_name' => $row->service_name ?? null,
            'application_type' => $row->application_type ?? null,
            'billing_frequency' => $row->billing_frequency ?? null,
            'unit_id' => (int) $row->unit_id,
            'unit_number' => $row->unit_number ?? null,
            'billing_contact_user_id' => $row->billing_contact_user_id ? (int) $row->billing_contact_user_id : null,
            'billing_period' => substr((string) $row->billing_period, 0, 7),
            'billing_period_label' => Carbon::parse($row->billing_period)->format('F Y'),
            'title' => $row->title,
            'description' => $row->description,
            'amount' => round((float) $row->amount, 2),
            'due_date' => $row->due_date,
            'status' => $row->status,
            'status_label' => $this->statusLabel((string) $row->status),
            'payment_instructions' => $row->payment_instructions,
            'require_acknowledgement' => (bool) $row->require_acknowledgement,
            'require_payment_proof' => (bool) $row->require_payment_proof,
            'invoice' => $row->file_path ? [
                'file_name' => $row->file_name,
                'file_url' => MediaUrl::toPublic($row->file_path, $request),
            ] : null,
            'acknowledged_at' => $row->acknowledged_at,
            'payment_proof' => $this->formatPaymentProof($row, $request),
            'payment_method' => $row->payment_method ?? null,
            'rejection_reason' => $row->rejection_reason,
            'created_at' => $row->created_at,
        ];
    }

    private function formatPaymentProof(object $row, Request $request): ?array
    {
        if (empty($row->proof_file_path) && empty($row->payment_date)) {
            return null;
        }

        return [
            'file_name' => $row->proof_file_name ?? null,
            'file_url' => ! empty($row->proof_file_path) ? MediaUrl::toPublic($row->proof_file_path, $request) : null,
            'payment_date' => $row->payment_date ?? null,
            'payment_reference' => $row->payment_reference ?? null,
            'payment_note' => $row->payment_note ?? null,
        ];
    }

    private function formatSubscription(object $row): array
    {
        $latestBillId = $row->latest_bill_id ?? null;

        return [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'service_id' => (int) $row->service_id,
            'service_name' => $row->service_name ?? null,
            'unit_id' => (int) $row->unit_id,
            'unit_number' => $row->unit_number ?? null,
            'status' => $row->status,
            'status_label' => match ((string) $row->status) {
                self::SUB_PENDING => 'Pending',
                self::SUB_ACTIVE => 'Active',
                self::SUB_REJECTED => 'Declined',
                self::SUB_CANCELLED => 'Cancelled',
                default => ucfirst(str_replace('_', ' ', (string) $row->status)),
            },
            'note' => $row->note,
            'requested_by' => $row->requested_by ? (int) $row->requested_by : null,
            'requester_name' => $row->display_name ?? $row->requester_name ?? null,
            'starts_at' => $row->starts_at,
            'ends_at' => $row->ends_at,
            'rejection_reason' => $row->rejection_reason,
            'created_at' => $row->created_at,
            'latest_bill' => $latestBillId ? [
                'id' => (int) $latestBillId,
                'title' => $row->latest_bill_title ?? null,
                'status' => $row->latest_bill_status,
                'status_label' => $this->statusLabel((string) $row->latest_bill_status),
                'amount' => $row->latest_bill_amount !== null ? round((float) $row->latest_bill_amount, 2) : null,
                'billing_period' => $row->latest_billing_period
                    ? substr((string) $row->latest_billing_period, 0, 7)
                    : null,
                'billing_period_label' => $row->latest_billing_period
                    ? Carbon::parse($row->latest_billing_period)->format('M Y')
                    : null,
                'due_date' => $row->latest_bill_due_date ?? null,
                'acknowledged_at' => $row->latest_bill_acknowledged_at ?? null,
                'acknowledged_by_name' => $this->preferredPersonName(
                    $row->latest_acknowledged_by_display_name ?? null,
                    $row->latest_acknowledged_by_name ?? null,
                ),
            ] : null,
        ];
    }

    private function storeBillFile(UploadedFile $file, int $communityId, int $serviceId): array
    {
        $path = $file->store("service-bills/{$communityId}/{$serviceId}", 'public');

        return [
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
        ];
    }

    private function storeProofFile(UploadedFile $file, int $communityId, int $billId): array
    {
        $path = $file->store("service-bill-proofs/{$communityId}/{$billId}", 'public');

        return [
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
        ];
    }

    private function deleteStoredFile(?string $path): void
    {
        if ($path) {
            Storage::disk('public')->delete($path);
        }
    }

    private function isUniqueViolation(QueryException $e): bool
    {
        return str_contains($e->getMessage(), 'unit_service_bills_period_unique')
            || (string) $e->getCode() === '23000';
    }
}
