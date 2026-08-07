<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;

/**
 * Hide resident-facing notices after their scheduled window ends.
 *
 * Schedule times are community-local wall clock values (see NoticeSchedule).
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
        $query->whereNotNull("{$table}.event_date")
            ->where(function ($q) use ($table, $today, $time) {
                $q->where("{$table}.event_date", '>', $today)
                    // Events remain listed for the whole calendar day.
                    ->orWhere(function ($q2) use ($table, $today) {
                        $q2->where("{$table}.category", 'event')
                            ->where("{$table}.event_date", $today);
                    })
                    ->orWhere(function ($q2) use ($table, $today, $time) {
                        $q2->where("{$table}.category", '!=', 'event')
                            ->where("{$table}.event_date", $today)
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

        return <<<SQL
CASE WHEN {$table}.is_pinned = 1 AND (
    ({$table}.event_date IS NULL AND {$table}.category = 'emergency')
    OR {$table}.event_date > '{$todayQ}'
    OR ({$table}.category = 'event' AND {$table}.event_date = '{$todayQ}')
    OR (
        {$table}.category != 'event'
        AND {$table}.event_date = '{$todayQ}'
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
        $category = strtolower((string) ($notice->category ?? ''));
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
        $eventDay = substr((string) $eventDate, 0, 10);

        if ($eventDay < $today) {
            return true;
        }

        if ($eventDay > $today) {
            return false;
        }

        // Events stay visible for the full calendar day on resident lists / home.
        if ($category === 'event') {
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
