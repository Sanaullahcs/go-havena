<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PropertyServiceCatalogService
{
    public const TYPE_AUTOMATIC = 'automatic';

    public const TYPE_OPTIONAL = 'optional';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    public const FREQUENCY_MONTHLY = 'monthly';

    public const FREQUENCY_YEARLY = 'yearly';

    public const FREQUENCY_ONE_TIME = 'one_time';

    public const AMOUNT_FIXED = 'fixed';

    public const AMOUNT_VARIABLE = 'variable';

    public const CATEGORIES = [
        'electricity',
        'water',
        'internet',
        'waste',
        'house_cleaning',
        'pest_control',
        'plumbing',
        'electrical_maintenance',
        'ac_maintenance',
        'security',
        'parking',
        'other',
    ];

    public const LEGACY_CATEGORIES = ['utilities', 'maintenance'];

    public const CATEGORY_ALIASES = [
        'utilities' => 'water',
        'maintenance' => 'plumbing',
    ];

    public const ICONS = ['droplet', 'zap', 'trash', 'shield', 'car', 'wifi', 'wrench', 'home'];

    /** @return list<string> */
    public static function allowedCategories(): array
    {
        return array_values(array_unique([...self::CATEGORIES, ...self::LEGACY_CATEGORIES]));
    }

    public static function normalizeCategory(?string $category): string
    {
        $value = trim((string) $category);
        if (isset(self::CATEGORY_ALIASES[$value])) {
            return self::CATEGORY_ALIASES[$value];
        }

        return in_array($value, self::CATEGORIES, true) ? $value : 'water';
    }

    public static function normalizeCustomCategory(?string $category, ?string $customCategory): ?string
    {
        if (self::normalizeCategory($category) !== 'other') {
            return null;
        }

        $value = trim((string) $customCategory);

        return $value !== '' ? mb_substr($value, 0, 80) : null;
    }

    public function listAdmin(int $communityId): array
    {
        $rows = DB::table('property_services')
            ->where('community_id', $communityId)
            ->orderBy('name')
            ->get();

        $residentialUnits = app(UnitAssignmentService::class)->occupiedResidentialUnitCount($communityId);

        $optionalCounts = $rows->isEmpty()
            ? collect()
            : DB::table('unit_service_subscriptions')
                ->select(
                    'service_id',
                    DB::raw("SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count"),
                    DB::raw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count"),
                )
                ->whereIn('service_id', $rows->pluck('id'))
                ->whereIn('status', ['active', 'pending'])
                ->groupBy('service_id')
                ->get()
                ->keyBy('service_id');

        return $rows->map(function ($row) use ($residentialUnits, $optionalCounts) {
            $counts = $optionalCounts->get($row->id);
            $active = $row->application_type === self::TYPE_AUTOMATIC
                ? $residentialUnits
                : (int) ($counts?->active_count ?? 0);
            $pending = $row->application_type === self::TYPE_AUTOMATIC
                ? 0
                : (int) ($counts?->pending_count ?? 0);

            return $this->format($row, true, null, $active, $pending);
        })->all();
    }

    public function listResidentCatalog(int $communityId, ?object $viewerUnit): array
    {
        $rows = DB::table('property_services')
            ->where('community_id', $communityId)
            ->where('status', self::STATUS_ACTIVE)
            ->orderBy('name')
            ->get();

        return $rows->map(fn ($row) => $this->format($row, false, $viewerUnit))->all();
    }

    public function findInCommunity(int $communityId, int $id): ?object
    {
        return DB::table('property_services')
            ->where('community_id', $communityId)
            ->where('id', $id)
            ->first();
    }

    public function create(int $communityId, int $createdBy, array $data): array
    {
        $payload = $this->normalizedPayload($data);
        $now = now();
        $id = DB::table('property_services')->insertGetId(array_merge($payload, [
            'community_id' => $communityId,
            'created_by' => $createdBy,
            'created_at' => $now,
            'updated_at' => $now,
        ]));

        ActivityLogService::user('property_service_created', "Created service: \"{$payload['name']}\"", 'PropertyService', $id);

        $service = DB::table('property_services')->find($id);
        $notifiedUserIds = $this->generateDueBillsIfNeeded($service, $createdBy);
        app(UnitServiceBillReminderService::class)->notifyServicePublished($service, $notifiedUserIds);

        return $this->format($service, true);
    }

    public function update(object $service, array $data): array
    {
        $payload = $this->normalizedPayload($data, $service);
        DB::table('property_services')->where('id', $service->id)->update(array_merge($payload, [
            'updated_at' => now(),
        ]));

        ActivityLogService::user('property_service_updated', "Updated service: \"{$payload['name']}\"", 'PropertyService', (int) $service->id);

        $updated = DB::table('property_services')->find($service->id);
        $this->generateDueBillsIfNeeded($updated, (int) ($updated->created_by ?? $service->created_by ?? 0));

        return $this->format($updated, true);
    }

    public function delete(object $service): void
    {
        $name = (string) $service->name;
        $id = (int) $service->id;

        // Deleting cascades to the bills; never let that erase money KuickPay collected or is collecting.
        $hasOnlinePayments = DB::table('payment_attempts')
            ->where('payable_type', \App\Models\PaymentAttempt::PAYABLE_SERVICE_BILL)
            ->whereIn('payable_id', DB::table('unit_service_bills')->where('service_id', $id)->select('id'))
            ->whereIn('status', array_merge(\App\Models\PaymentAttempt::ACTIVE_STATUSES, [
                \App\Models\PaymentAttempt::STATUS_SUCCEEDED,
                \App\Models\PaymentAttempt::STATUS_REFUND_PENDING,
            ]))
            ->exists();
        if ($hasOnlinePayments) {
            throw ValidationException::withMessages([
                'service' => 'This service has online payments recorded. Set it to inactive instead of deleting it.',
            ]);
        }

        DB::table('property_services')->where('id', $id)->delete();

        ActivityLogService::user('property_service_deleted', "Deleted service: \"{$name}\"", 'PropertyService', $id);
    }

    public function format(
        object $service,
        bool $admin = false,
        ?object $viewerUnit = null,
        ?int $activeSubscribers = null,
        ?int $pendingSubscribers = null,
    ): array
    {
        $payload = [
            'id' => (int) $service->id,
            'community_id' => (int) $service->community_id,
            'name' => $service->name,
            'category' => self::normalizeCategory($service->category ?? null),
            'custom_category' => $service->custom_category ?? null,
            'description' => $service->description,
            'icon_key' => $service->icon_key,
            'status' => $service->status,
            'application_type' => $service->application_type,
            'billing_frequency' => $service->billing_frequency,
            'amount_type' => $service->amount_type,
            'amount' => $service->amount !== null ? round((float) $service->amount, 2) : null,
            'due_day' => $service->due_day !== null ? (int) $service->due_day : null,
            'first_billing_month' => $service->first_billing_month
                ? substr((string) $service->first_billing_month, 0, 7)
                : null,
            'payment_instructions' => $service->payment_instructions,
            'require_payment_proof' => (bool) $service->require_payment_proof,
            'require_acknowledgement' => (bool) $service->require_acknowledgement,
            'auto_generate_bills' => (bool) $service->auto_generate_bills,
            'send_notice' => (bool) $service->send_notice,
            'send_notification' => (bool) $service->send_notification,
            'notice_title' => $service->notice_title,
            'notice_body' => $service->notice_body,
            'requires_admin_approval' => (bool) $service->requires_admin_approval,
            'max_subscribers' => $service->max_subscribers !== null ? (int) $service->max_subscribers : null,
            'unsubscribe_mode' => $service->unsubscribe_mode,
            'created_at' => $service->created_at,
            'updated_at' => $service->updated_at,
        ];

        if ($activeSubscribers !== null) {
            $payload['active_subscribers'] = $activeSubscribers;
            $payload['pending_subscribers'] = $pendingSubscribers ?? 0;
            $payload['subscriber_count'] = $activeSubscribers + ($pendingSubscribers ?? 0);
        } elseif ($admin || ($service->application_type === self::TYPE_OPTIONAL && $viewerUnit)) {
            $payload['active_subscribers'] = $service->application_type === self::TYPE_AUTOMATIC
                ? app(UnitAssignmentService::class)->occupiedResidentialUnitCount((int) $service->community_id)
                : DB::table('unit_service_subscriptions')
                    ->where('service_id', $service->id)
                    ->where('status', 'active')
                    ->count();
            $payload['pending_subscribers'] = $service->application_type === self::TYPE_OPTIONAL
                ? (int) DB::table('unit_service_subscriptions')
                    ->where('service_id', $service->id)
                    ->where('status', 'pending')
                    ->count()
                : 0;
            $payload['subscriber_count'] = (int) $payload['active_subscribers'] + (int) $payload['pending_subscribers'];
        }

        if ($viewerUnit) {
            $subscription = DB::table('unit_service_subscriptions')
                ->where('service_id', $service->id)
                ->where('unit_id', $viewerUnit->id)
                ->first();
            $payload['unit_subscription'] = $subscription ? [
                'id' => (int) $subscription->id,
                'status' => $subscription->status,
                'starts_at' => $subscription->starts_at,
                'ends_at' => $subscription->ends_at,
                'note' => $subscription->note,
                'rejection_reason' => $subscription->rejection_reason,
            ] : null;
            $payload['can_subscribe'] = $service->application_type === self::TYPE_OPTIONAL
                && $service->status === self::STATUS_ACTIVE
                && (int) ($viewerUnit->billing_contact_user_id ?? 0) > 0
                && (! $subscription || in_array($subscription->status, ['rejected', 'cancelled'], true));
            $payload['subscribe_blocked_reason'] = $this->subscribeBlockedReason($service, $viewerUnit, $subscription);
        }

        return $payload;
    }

    private function subscribeBlockedReason(object $service, object $viewerUnit, ?object $subscription): ?string
    {
        if ($service->application_type !== self::TYPE_OPTIONAL) {
            return null;
        }
        if (($service->status ?? '') !== self::STATUS_ACTIVE) {
            return 'This service is not accepting subscriptions.';
        }
        if ($subscription && $subscription->status === 'pending') {
            return 'Subscription request is waiting for admin approval.';
        }
        if ($subscription && $subscription->status === 'active') {
            return 'This unit is already subscribed.';
        }

        return null;
    }

    private function normalizedPayload(array $data, ?object $existing = null): array
    {
        $type = $data['application_type'] ?? $existing?->application_type;
        if (! in_array($type, [self::TYPE_AUTOMATIC, self::TYPE_OPTIONAL], true)) {
            throw ValidationException::withMessages([
                'application_type' => 'Choose Automatic (all units) or Optional (resident opt-in).',
            ]);
        }

        $frequency = $data['billing_frequency'] ?? $existing?->billing_frequency ?? self::FREQUENCY_MONTHLY;
        if ($type === self::TYPE_AUTOMATIC && $frequency === self::FREQUENCY_ONE_TIME) {
            $frequency = self::FREQUENCY_MONTHLY;
        }
        if (! in_array($frequency, [self::FREQUENCY_MONTHLY, self::FREQUENCY_YEARLY, self::FREQUENCY_ONE_TIME], true)) {
            throw ValidationException::withMessages([
                'billing_frequency' => 'Choose monthly, yearly, or one-time billing.',
            ]);
        }

        $amountType = $data['amount_type'] ?? $existing?->amount_type ?? self::AMOUNT_FIXED;
        if ($type === self::TYPE_OPTIONAL) {
            $amountType = self::AMOUNT_FIXED;
        }
        if (! in_array($amountType, [self::AMOUNT_FIXED, self::AMOUNT_VARIABLE], true)) {
            throw ValidationException::withMessages([
                'amount_type' => 'Choose fixed or variable amount.',
            ]);
        }

        $amount = $data['amount'] ?? $existing?->amount;
        if ($amount === null || $amount === '') {
            if ($amountType === self::AMOUNT_FIXED) {
                throw ValidationException::withMessages([
                    'amount' => 'Enter an amount of at least 0.01.',
                ]);
            }
        } else {
            $rawAmount = trim((string) $amount);
            if (! is_numeric($rawAmount) || (float) $rawAmount < 0.01) {
                throw ValidationException::withMessages([
                    'amount' => 'Enter an amount of at least 0.01.',
                ]);
            }
            if ((float) $rawAmount > 999999.99) {
                throw ValidationException::withMessages([
                    'amount' => 'Enter an amount of 999,999.99 or less.',
                ]);
            }
            if (preg_match('/\.\d{3,}/', $rawAmount)) {
                throw ValidationException::withMessages([
                    'amount' => 'Enter an amount with up to 2 decimal places.',
                ]);
            }
        }

        $dueDay = $data['due_day'] ?? $existing?->due_day;
        if (in_array($frequency, [self::FREQUENCY_MONTHLY, self::FREQUENCY_YEARLY], true)
            && ($dueDay === null || (int) $dueDay < 1 || (int) $dueDay > 31)) {
            throw ValidationException::withMessages([
                'due_day' => 'Due day must be between 1 and 31.',
            ]);
        }

        $firstMonth = $data['first_billing_month'] ?? $existing?->first_billing_month;
        if (($type === self::TYPE_AUTOMATIC || $frequency === self::FREQUENCY_YEARLY) && empty($firstMonth)) {
            throw ValidationException::withMessages([
                'first_billing_month' => $frequency === self::FREQUENCY_YEARLY
                    ? 'Choose the billing year.'
                    : 'Choose the first billing month.',
            ]);
        }

        $category = self::normalizeCategory($data['category'] ?? $existing?->category);
        $customCategory = array_key_exists('custom_category', $data)
            ? self::normalizeCustomCategory($category, $data['custom_category'] ?? null)
            : self::normalizeCustomCategory($category, $existing->custom_category ?? null);

        if ($category === 'other' && mb_strlen((string) $customCategory) < 2) {
            throw ValidationException::withMessages([
                'custom_category' => 'Custom category must be at least 2 characters.',
            ]);
        }

        return [
            'name' => trim((string) ($data['name'] ?? $existing?->name)),
            'category' => $category,
            'custom_category' => $customCategory,
            'description' => $this->nullableString($data['description'] ?? $existing?->description),
            'icon_key' => $this->nullableString($data['icon_key'] ?? $existing?->icon_key),
            'status' => in_array($data['status'] ?? $existing?->status, [self::STATUS_ACTIVE, self::STATUS_INACTIVE], true)
                ? ($data['status'] ?? $existing?->status)
                : self::STATUS_ACTIVE,
            'application_type' => $type,
            'billing_frequency' => $frequency,
            'amount_type' => $amountType,
            'amount' => $amount !== null ? round((float) $amount, 2) : null,
            'due_day' => $dueDay !== null ? (int) $dueDay : null,
            'first_billing_month' => $firstMonth
                ? $this->normalizeBillingMonth((string) $firstMonth)
                : null,
            'payment_instructions' => $this->nullableString($data['payment_instructions'] ?? $existing?->payment_instructions),
            'require_payment_proof' => (bool) ($data['require_payment_proof'] ?? $existing?->require_payment_proof ?? true),
            'require_acknowledgement' => (bool) ($data['require_acknowledgement'] ?? $existing?->require_acknowledgement ?? false),
            'auto_generate_bills' => $frequency !== self::FREQUENCY_ONE_TIME,
            'send_notice' => (bool) ($data['send_notice'] ?? $existing?->send_notice ?? true),
            'send_notification' => (bool) ($data['send_notification'] ?? $existing?->send_notification ?? true),
            'notice_title' => $this->nullableString($data['notice_title'] ?? $existing?->notice_title),
            'notice_body' => $this->nullableString($data['notice_body'] ?? $existing?->notice_body),
            'requires_admin_approval' => $type === self::TYPE_OPTIONAL,
            'max_subscribers' => $type === self::TYPE_OPTIONAL && ! empty($data['max_subscribers'] ?? $existing?->max_subscribers)
                ? (int) ($data['max_subscribers'] ?? $existing?->max_subscribers)
                : null,
            'unsubscribe_mode' => in_array($data['unsubscribe_mode'] ?? $existing?->unsubscribe_mode, ['end_of_period', 'immediate'], true)
                ? ($data['unsubscribe_mode'] ?? $existing?->unsubscribe_mode)
                : 'end_of_period',
        ];
    }

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

    /** @return list<int> */
    private function generateDueBillsIfNeeded(?object $service, int $createdBy): array
    {
        if (! $service || ! ($service->auto_generate_bills ?? false)) {
            return [];
        }

        $result = app(UnitServiceBillService::class)->generateCurrentPeriodIfDue($service, $createdBy);

        return $result['notified_user_ids'] ?? [];
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));

        return $trimmed === '' ? null : $trimmed;
    }
}
