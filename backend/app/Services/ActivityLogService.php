<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Str;

class ActivityLogService
{
    /** @var array<string, string> */
    public const FIELD_LABELS = [
        'name' => 'Name',
        'email' => 'Email',
        'phone' => 'Phone',
        'role' => 'Role',
        'status' => 'Status',
        'account_status' => 'Status',
        'community_admin_status' => 'Admin Status',
        'display_name' => 'Display Name',
        'bio' => 'Bio',
        'unit_number' => 'Unit Number',
        'residence_type' => 'Residence Type',
        'region_id' => 'Region',
        'region' => 'Region',
        'community_id' => 'Community',
        'community' => 'Community',
        'community_assignment' => 'Community Assignment',
        'address' => 'Address',
        'description' => 'Description',
        'category' => 'Category',
        'hours' => 'Hours',
        'amenities' => 'Amenities',
        'image_url' => 'Image',
        'title' => 'Title',
        'vendor' => 'Vendor',
        'type' => 'Type',
        'discount_label' => 'Discount Label',
        'original_price' => 'Original Price',
        'discounted_price' => 'Discounted Price',
        'promo_code' => 'Promo Code',
        'location' => 'Location',
        'starts_at' => 'Start Date',
        'ends_at' => 'End Date',
        'business_id' => 'Business',
        'menu_image_url' => 'Menu Photo',
        'menu_items' => 'Menu Items',
        'is_featured' => 'Featured',
        'price' => 'Price',
        'condition' => 'Condition',
        'images' => 'Images',
        'body' => 'Body',
        'body_es' => 'Body (Spanish)',
        'body_ar' => 'Body (Arabic)',
        'name_es' => 'Name (Spanish)',
        'name_ar' => 'Name (Arabic)',
        'description_es' => 'Description (Spanish)',
        'description_ar' => 'Description (Arabic)',
        'capacity' => 'Capacity',
        'floor' => 'Floor',
        'start_time' => 'Opening Time',
        'end_time' => 'Closing Time',
        'weekends_available' => 'Weekends Available',
        'slot_duration_minutes' => 'Slot Duration',
        'icon_key' => 'Icon',
        'review_status' => 'Review Status',
        'rejection_reason' => 'Rejection Reason',
        'shared_billing_enabled' => 'Shared Billing',
        'shared_billing_amount' => 'Shared Billing Amount',
        'shared_billing_due_day' => 'Billing Due Day',
        'booking_fee' => 'Booking Fee',
        'event_date' => 'Event Date',
        'event_time' => 'Event Time',
        'event_time_end' => 'Event End Time',
        'event_capacity' => 'Event Capacity',
        'is_global' => 'Global',
        'is_pinned' => 'Pinned',
        'scheduled_at' => 'Scheduled At',
        'requires_rsvp' => 'Requires RSVP',
        'audience_type' => 'Audience',
        'severity' => 'Severity',
        'requires_acknowledgment' => 'Requires Acknowledgment',
        'area' => 'Area',
        'state' => 'State',
        'state_id' => 'State',
        'users_label' => 'Users Label',
        'sort_order' => 'Sort Order',
        'permissions' => 'Permissions',
        'file' => 'File',
        'file_path' => 'File',
        'latitude' => 'Latitude',
        'longitude' => 'Longitude',
    ];

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public static function log(
        string $logType,
        string $action,
        string $description,
        ?string $entityType = null,
        ?int    $entityId   = null,
        string  $severity   = 'info',
        ?int    $userId     = null,
        ?string $userRole   = null,
        ?array  $meta       = null,
    ): void {
        try {
            $authUser = auth()->user();
            $actorUser = $authUser instanceof User ? $authUser : null;
            $actor = self::actorSnapshot($actorUser);
            $mergedMeta = self::redactSensitive(array_filter(
                array_merge($actor, $meta ?? []),
                fn ($value) => $value !== null,
            ));

            $actorUserId = isset($mergedMeta['actor_id']) ? (int) $mergedMeta['actor_id'] : ($actorUser?->id);
            $actorRole = $userRole ?: ($mergedMeta['actor_role'] ?? $actorUser?->role);
            $actorType = self::actorTypeFromRole($actorRole, $logType, $actorUserId);
            $communityId = self::resolveCommunityId($mergedMeta, $entityType, $entityId, $actorUser, $userId ?? $actorUserId);
            $subjectUserId = isset($mergedMeta['affected_user_id'])
                ? (int) $mergedMeta['affected_user_id']
                : (($entityType === 'User' && $entityId) ? (int) $entityId : null);
            $module = $mergedMeta['module'] ?? $entityType;
            $status = $mergedMeta['status'] ?? null;
            $requestId = $mergedMeta['request_id']
                ?? Request::header('X-Request-Id')
                ?? Request::header('X-Correlation-Id');

            DB::table('activity_logs')->insert([
                'log_type'         => $logType,
                'user_id'          => $userId ?? $actorUser?->id,
                'actor_user_id'    => $actorUserId,
                'actor_role'       => $actorRole ? Str::limit((string) $actorRole, 40, '') : null,
                'actor_type'       => $actorType,
                'subject_user_id'  => $subjectUserId,
                'community_id'     => $communityId,
                'module'           => $module ? Str::limit((string) $module, 80, '') : null,
                'status'           => $status ? Str::limit((string) $status, 40, '') : null,
                'request_id'       => $requestId ? Str::limit((string) $requestId, 64, '') : null,
                'action'           => $action,
                'description'      => Str::limit($description, 500, ''),
                'entity_type'      => $entityType,
                'entity_id'        => $entityId,
                'ip_address'       => Request::ip(),
                'user_agent'       => Str::limit((string) Request::userAgent(), 300, ''),
                'severity'         => $severity,
                'meta'             => $mergedMeta !== [] ? json_encode($mergedMeta) : null,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
        } catch (\Throwable $e) {
            // Logging must never break the main flow
        }
    }

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public static function user(
        string $action,
        string $description,
        ?string $entityType = null,
        ?int $entityId = null,
        string $severity = 'info',
        ?int $userId = null,
        ?array $meta = null,
    ): void {
        static::log('user', $action, $description, $entityType, $entityId, $severity, $userId, null, $meta);
    }

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public static function system(
        string $action,
        string $description,
        string $severity = 'info',
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $meta = null,
    ): void {
        static::log('system', $action, $description, $entityType, $entityId, $severity, null, null, $meta);
    }

    /**
     * Record an update with field-level previous/new values.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @param  array<string, string>  $labels
     * @param  array<string, mixed>  $extraMeta
     */
    public static function recordUpdate(
        string $action,
        string $entityType,
        int $entityId,
        array $before,
        array $after,
        array $labels = [],
        ?string $affectedName = null,
        ?int $affectedUserId = null,
        array $extraMeta = [],
        string $severity = 'info',
        ?string $description = null,
    ): bool {
        $changes = self::diff($before, $after, $labels);
        if ($changes === []) {
            return false;
        }

        $actor = self::actorSnapshot();
        $target = $affectedName ?: ($extraMeta['related_item'] ?? $entityType.' #'.$entityId);
        $headline = $description ?: self::headline($action, $actor['performed_by'] ?? 'User', $target, $changes);

        $meta = array_merge($extraMeta, [
            'changes' => $changes,
            'affected_user_id' => $affectedUserId,
            'affected_user_name' => $affectedName,
            'related_item' => $extraMeta['related_item'] ?? $target,
            'module' => $entityType,
        ]);

        $statusChange = collect($changes)->first(
            fn (array $change) => in_array($change['key'], ['status', 'review_status', 'community_admin_status'], true),
        );
        if ($statusChange) {
            $meta['status'] = $statusChange['next'];
        }

        self::user($action, $headline, $entityType, $entityId, $severity, null, $meta);

        return true;
    }

    /**
     * @param  array<int, array{field: string, key?: string, previous: mixed, next: mixed}>  $changes
     * @param  array<string, mixed>  $extraMeta
     */
    public static function recordChanges(
        string $action,
        string $entityType,
        int $entityId,
        array $changes,
        ?string $affectedName = null,
        ?int $affectedUserId = null,
        array $extraMeta = [],
        string $severity = 'info',
        ?string $description = null,
    ): bool {
        $normalized = [];
        foreach ($changes as $change) {
            $key = (string) ($change['key'] ?? Str::slug((string) ($change['field'] ?? 'field'), '_'));
            $previous = self::displayValue($change['previous'] ?? null);
            $next = self::displayValue($change['next'] ?? null);
            if ($previous === $next) {
                continue;
            }
            $normalized[] = [
                'field' => (string) ($change['field'] ?? self::labelFor($key)),
                'key' => $key,
                'previous' => $previous,
                'next' => $next,
            ];
        }

        if ($normalized === []) {
            return false;
        }

        $before = [];
        $after = [];
        $labels = [];
        foreach ($normalized as $change) {
            $before[$change['key']] = $change['previous'];
            $after[$change['key']] = $change['next'];
            $labels[$change['key']] = $change['field'];
        }

        return self::recordUpdate(
            $action,
            $entityType,
            $entityId,
            $before,
            $after,
            $labels,
            $affectedName,
            $affectedUserId,
            $extraMeta,
            $severity,
            $description,
        );
    }

    /**
     * @param  array<string, mixed>  $extraMeta
     */
    public static function recordStatusChange(
        string $action,
        string $entityType,
        int $entityId,
        mixed $previous,
        mixed $next,
        string $field = 'Status',
        ?string $affectedName = null,
        ?int $affectedUserId = null,
        array $extraMeta = [],
        string $severity = 'info',
        ?string $description = null,
    ): bool {
        return self::recordChanges(
            $action,
            $entityType,
            $entityId,
            [[
                'field' => $field,
                'key' => 'status',
                'previous' => $previous,
                'next' => $next,
            ]],
            $affectedName,
            $affectedUserId,
            $extraMeta,
            $severity,
            $description,
        );
    }

    /**
     * @param  object|array<string, mixed>  $record
     * @param  array<int, string>  $fields
     * @return array<string, mixed>
     */
    public static function snapshot(object|array $record, array $fields): array
    {
        $source = is_array($record) ? $record : (array) $record;
        $out = [];
        foreach ($fields as $field) {
            $out[$field] = $source[$field] ?? null;
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @param  array<string, string>  $labels
     * @return array<int, array{field: string, key: string, previous: string, next: string}>
     */
    public static function diff(array $before, array $after, array $labels = []): array
    {
        $changes = [];
        $keys = array_values(array_unique([...array_keys($before), ...array_keys($after)]));

        foreach ($keys as $key) {
            if (in_array($key, ['updated_at', 'created_at', 'password', 'remember_token'], true) || self::isSensitiveKey((string) $key)) {
                continue;
            }

            $previous = self::displayValue($before[$key] ?? null, $key);
            $next = self::displayValue($after[$key] ?? null, $key);
            if ($previous === $next) {
                continue;
            }

            $changes[] = [
                'field' => $labels[$key] ?? self::labelFor((string) $key),
                'key' => (string) $key,
                'previous' => $previous,
                'next' => $next,
            ];
        }

        return $changes;
    }

    /**
     * @return array<string, mixed>
     */
    public static function actorSnapshot(?User $actor = null): array
    {
        $actor = $actor ?? (auth()->user() instanceof User ? auth()->user() : null);
        if (! $actor) {
            return [
                'actor_id' => null,
                'actor_name' => 'System',
                'actor_role' => null,
                'actor_role_label' => 'System',
                'performed_by' => 'System',
            ];
        }

        $activeMode = UserActingContextService::effectiveMode($actor)
            ?? (string) ($actor->role ?? '');
        $roleLabel = self::roleLabel($activeMode);

        return [
            'actor_id' => (int) $actor->id,
            'actor_name' => (string) $actor->name,
            'actor_role' => $activeMode,
            'actor_role_label' => $roleLabel,
            'performed_by' => $roleLabel.', '.$actor->name,
            'account_role' => (string) ($actor->role ?? ''),
            'active_context' => $activeMode,
            'active_mode' => $activeMode,
            'active_context_community_id' => $actor->active_context_community_id
                ? (int) $actor->active_context_community_id
                : null,
        ];
    }

    public static function roleLabel(?string $role): string
    {
        return match ($role) {
            'system_admin', 'admin' => 'System Admin',
            'community_admin' => 'Community Admin',
            'moderator' => 'Moderator',
            'resident' => 'Resident',
            'guest' => 'Guest',
            default => $role ? Str::headline($role) : 'User',
        };
    }

    public static function labelFor(string $key): string
    {
        return self::FIELD_LABELS[$key] ?? Str::headline($key);
    }

    /**
     * @param  array<int, array{field: string, previous: string, next: string}>  $changes
     */
    public static function headline(string $action, string $performedBy, string $target, array $changes): string
    {
        $verb = match (true) {
            str_contains($action, 'status') || (count($changes) === 1 && ($changes[0]['field'] ?? '') === 'Status')
                => 'changed status for',
            str_contains($action, 'email') => 'changed email for',
            default => 'updated',
        };

        $lines = [$performedBy.' '.$verb.' '.$target];
        foreach ($changes as $change) {
            $lines[] = $change['field'].': '.$change['previous'].' → '.$change['next'];
        }

        return Str::limit(implode("\n", $lines), 500, '');
    }

    public static function displayValue(mixed $value, ?string $key = null): string
    {
        if ($value === null || $value === '') {
            return '(empty)';
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        if (is_array($value)) {
            $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            return $encoded === false ? '(updated)' : self::truncateDisplay($encoded);
        }

        if (is_object($value)) {
            return self::displayValue((array) $value, $key);
        }

        $string = trim((string) $value);
        if ($string === '') {
            return '(empty)';
        }

        // Bio is shown with Show more / Show less in the activity UI.
        // Truncating it here leaves nothing for that control to reveal.
        if ($key === 'bio') {
            return $string;
        }

        if (in_array($key, ['menu_items', 'amenities', 'images', 'permissions'], true)) {
            $decoded = json_decode($string, true);
            if (is_array($decoded)) {
                return self::truncateDisplay(json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: $string);
            }
        }

        if (in_array($key, ['status', 'review_status', 'community_admin_status', 'role', 'residence_type'], true)) {
            return Str::headline($string);
        }

        if (in_array($key, ['image_url', 'menu_image_url', 'file_path'], true)) {
            return $string === '' ? '(empty)' : 'Updated';
        }

        return self::truncateDisplay($string);
    }

    private static function truncateDisplay(string $value): string
    {
        return Str::limit($value, 180, '…');
    }

    public static function actorTypeFromRole(?string $role, string $logType = 'user', ?int $actorUserId = null): string
    {
        if ($logType === 'system' && ! $actorUserId) {
            return 'system';
        }

        return match ($role) {
            'system_admin', 'admin' => 'system_admin',
            'community_admin' => 'community_admin',
            'guest' => 'guest',
            'resident' => 'resident',
            default => $logType === 'system' ? 'system' : 'user',
        };
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    public static function resolveCommunityId(
        array $meta,
        ?string $entityType,
        ?int $entityId,
        ?User $actor,
        ?int $fallbackUserId = null,
    ): ?int {
        if (! empty($meta['community_id'])) {
            return (int) $meta['community_id'];
        }

        if ($entityType === 'Community' && $entityId) {
            return $entityId;
        }

        if ($actor) {
            $scoped = AdminRoleService::resolveCommunityId($actor);
            if ($scoped) {
                return $scoped;
            }
        }

        $userId = $fallbackUserId ?: $actor?->id;
        if (! $userId) {
            return null;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('status', 'approved')
            ->orderBy('id')
            ->first();

        return $membership ? (int) $membership->community_id : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function redactSensitive(array $payload): array
    {
        $clean = [];
        foreach ($payload as $key => $value) {
            if (self::isSensitiveKey((string) $key)) {
                $clean[$key] = '[redacted]';
                continue;
            }

            if (is_array($value)) {
                $clean[$key] = self::redactSensitive($value);
                continue;
            }

            $clean[$key] = $value;
        }

        return $clean;
    }

    public static function isSensitiveKey(string $key): bool
    {
        $normalized = strtolower($key);

        foreach ([
            'password',
            'otp',
            'otp_code',
            'access_token',
            'refresh_token',
            'remember_token',
            'plain_text_token',
            'authorization',
            'private_key',
            'api_key',
            'client_secret',
            'stripe_secret',
            'plaid_secret',
            'plaid_access_token',
            'public_token',
            'routing_number',
            'account_number',
            'secret',
            'token',
        ] as $needle) {
            if ($normalized === $needle || str_ends_with($normalized, '_'.$needle)) {
                return true;
            }
        }

        return false;
    }
}
