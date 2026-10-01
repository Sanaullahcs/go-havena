<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;

/**
 * Hide resident-facing notices after their scheduled window ends.
 *
 * Schedule times are community-local wall clock values (see NoticeSchedule).
 * Start: event_date + event_time. End: event_end_date (or event_date) + event_time_end.
 */
class NoticeExpiry
{
    public static function resolveTimezone(?int $communityId = null): string
    {
        $fallback = NoticeSchedule::fallbackTimezone();
        if ($fallback !== 'UTC') {
            return $fallback;
        }

        if ($communityId !== null) {
            return NoticeSchedule::communityTimezone($communityId);
        }

        return $fallback;
    }

    public static function nowInTimezone(?int $communityId = null): Carbon
    {
        return Carbon::now(self::resolveTimezone($communityId));
    }

    /** @return string|null YYYY-MM-DD */
    public static function effectiveEndDate(object $notice): ?string
    {
        $start = isset($notice->event_date) ? trim((string) $notice->event_date) : '';
        if ($start === '') {
            return null;
        }

        $end = isset($notice->event_end_date) ? trim((string) $notice->event_end_date) : '';
        if ($end !== '') {
            return substr($end, 0, 10);
        }

        return substr($start, 0, 10);
    }

    public static function applyVisibleScheduleFilter($query, string $table = 'notices', ?int $communityId = null): void
    {
        $now = self::nowInTimezone($communityId);
        $today = $now->toDateString();
        $time = $now->format('H:i');

        // Undated notices are ongoing announcements — always visible.
        // Dated notices expire after their schedule window (see applyActiveScheduleConstraints).
        $query->where(function ($q) use ($table, $today, $time) {
            $q->whereNull("{$table}.event_date")
                ->orWhere(function ($q2) use ($table, $today, $time) {
                    self::applyActiveScheduleConstraints($q2, $table, $today, $time);
                });
        });
    }

    /** @param  \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder  $query */
    public static function applyActiveScheduleConstraints($query, string $table, string $today, string $time): void
    {
        $endDateSql = "COALESCE({$table}.event_end_date, {$table}.event_date)";

        $query->whereNotNull("{$table}.event_date")
            ->where(function ($q) use ($table, $today, $time, $endDateSql) {
                $q->whereRaw("{$endDateSql} > ?", [$today])
                    ->orWhere(function ($q2) use ($table, $today, $time, $endDateSql) {
                        $q2->whereRaw("DATE({$endDateSql}) = ?", [$today])
                            ->where(function ($q3) use ($table, $time) {
                                $q3->whereNull("{$table}.event_time_end")
                                    ->orWhere("{$table}.event_time_end", '')
                                    ->orWhereRaw("TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i')) >= ?", [$time])
                                    ->orWhereRaw("TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i:%s')) >= ?", [$time]);
                            });
                    });
            });
    }

    public static function activePinOrderSql(string $table, string $today, string $time): string
    {
        $todayQ = addslashes($today);
        $timeQ = addslashes($time);
        $endDateSql = "COALESCE({$table}.event_end_date, {$table}.event_date)";

        return <<<SQL
CASE WHEN {$table}.is_pinned = 1 AND (
    ({$table}.event_date IS NULL AND {$table}.category = 'emergency')
    OR {$endDateSql} > '{$todayQ}'
    OR (
        DATE({$endDateSql}) = '{$todayQ}'
        AND (
            {$table}.event_time_end IS NULL
            OR {$table}.event_time_end = ''
            OR TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i')) >= '{$timeQ}'
            OR TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i:%s')) >= '{$timeQ}'
        )
    )
) THEN 0 ELSE 1 END
SQL;
    }

    public static function isExpired(object $notice, ?DateTimeInterface $now = null, ?int $communityId = null): bool
    {
        $communityId ??= isset($notice->community_id) ? (int) $notice->community_id : null;
        $eventDate = $notice->event_date ?? null;

        if ($eventDate === null || trim((string) $eventDate) === '') {
            return false;
        }

        $moment = $now instanceof Carbon
            ? $now->copy()
            : ($now !== null
                ? Carbon::instance($now)->setTimezone(self::resolveTimezone($communityId))
                : self::nowInTimezone($communityId));

        $today = $moment->toDateString();
        $endDay = self::effectiveEndDate($notice);
        if ($endDay === null) {
            return false;
        }

        if ($endDay < $today) {
            return true;
        }

        if ($endDay > $today) {
            return false;
        }

        $endTime = trim((string) ($notice->event_time_end ?? ''));
        if ($endTime === '') {
            return false;
        }

        [$hour, $minute] = self::parseClockTime($endTime);
        if ($hour === null) {
            return false;
        }

        $nowHour = (int) $moment->format('H');
        $nowMinute = (int) $moment->format('i');

        return $nowHour > $hour || ($nowHour === $hour && $nowMinute > $minute);
    }

    /**
     * An event is past once its end time (or calendar day when no end time is
     * stored) is behind community-local now. Start time alone must not hide Edit
     * for same-day upcoming or ongoing events.
     */
    public static function isEventSchedulePast(object $notice, ?int $communityId = null): bool
    {
        if (strtolower((string) ($notice->category ?? '')) !== 'event') {
            return false;
        }

        return self::isExpired($notice, null, $communityId);
    }

    /** @return array{0: ?int, 1: ?int} hour and minute, or nulls when invalid */
    private static function parseClockTime(string $time): array
    {
        $parts = explode(':', trim($time));
        if (count($parts) < 2) {
            return [null, null];
        }

        $hour = (int) $parts[0];
        $minute = (int) substr((string) $parts[1], 0, 2);

        if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
            return [null, null];
        }

        return [$hour, $minute];
    }
}
