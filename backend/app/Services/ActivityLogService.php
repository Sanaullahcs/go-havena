<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request;

class ActivityLogService
{
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
            DB::table('activity_logs')->insert([
                'log_type'    => $logType,
                'user_id'     => $userId ?? $authUser?->id,
                'action'      => $action,
                'description' => $description,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'ip_address'  => Request::ip(),
                'severity'    => $severity,
                'meta'        => $meta !== null ? json_encode($meta) : null,
                'created_at'  => now(),
                'updated_at'  => now(),
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

    public static function system(string $action, string $description, string $severity = 'info'): void
    {
        static::log('system', $action, $description, null, null, $severity, null, null, null);
    }
}
