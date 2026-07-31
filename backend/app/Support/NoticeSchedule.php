<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Scheduled publish times from dashboards/mobile are local wall-clock values.
 * Normalize to UTC for storage; compare in UTC when publishing.
 */
class NoticeSchedule
{
    /** Whether the datetime string includes an explicit timezone (Z or ±offset). */
    public static function hasExplicitTimezone(string $value): bool
    {
        return (bool) preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/i', trim($value));
    }

    public static function communityTimezone(int $communityId): string
    {
        $tz = DB::table('communities')->where('id', $communityId)->value('timezone');

        return is_string($tz) && $tz !== '' ? $tz : self::fallbackTimezone();
    }

    /** Timezone used when clients send naive Y-m-d H:i:s / local ISO without offset. */
    public static function fallbackTimezone(): string
    {
        return (string) (config('app.schedule_timezone') ?: config('app.timezone', 'UTC'));
    }

    public static function resolveInputTimezone(int $communityId): string
    {
        return self::fallbackTimezone() !== 'UTC'
            ? self::fallbackTimezone()
            : self::communityTimezone($communityId);
    }

    /** Parse API input and persist as UTC. */
    public static function normalizeForStorage(?string $value, int $communityId): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        $value = trim($value);

        if (self::hasExplicitTimezone($value)) {
            return Carbon::parse($value)->utc()->format('Y-m-d H:i:s');
        }

        $tz = self::resolveInputTimezone($communityId);

        return Carbon::parse($value, $tz)->utc()->format('Y-m-d H:i:s');
    }

    /** True when a stored UTC scheduled_at should publish now. */
    public static function isDue(?string $storedUtc): bool
    {
        if ($storedUtc === null || trim($storedUtc) === '') {
            return false;
        }

        return Carbon::parse($storedUtc, 'UTC')->lte(Carbon::now('UTC'));
    }

    /**
     * Legacy rows may store naive local wall-clock times (pre-UTC normalization).
     * Treat the stored value in the schedule timezone for one publish pass.
     */
    public static function isLegacyDue(?string $stored, int $communityId): bool
    {
        if ($stored === null || trim($stored) === '') {
            return false;
        }

        $tz = self::resolveInputTimezone($communityId);

        return Carbon::parse($stored, $tz)->lte(Carbon::now($tz));
    }

    public static function isStoredDue(?string $stored, int $communityId): bool
    {
        if ($stored === null || trim($stored) === '') {
            return false;
        }

        // All API writes normalize scheduled_at to UTC; legacy fallback treated UTC
        // wall-clock as local time and published future schedules immediately.
        return self::isDue($stored);
    }

    public static function isFuture(?string $stored, int $communityId): bool
    {
        if ($stored === null || trim($stored) === '') {
            return false;
        }

        return ! self::isDue($stored);
    }
}
