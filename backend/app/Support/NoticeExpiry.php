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
    /**
     * Published, approved events whose schedule has not ended.
     * Dated events with no end time stay active through the end date.
     *
     * @param  \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder  $query
     */
    public static function applyUpcomingEventConstraints($query, string $table = 'notices', ?int $communityId = null): void
    {
        $now = self::nowInTimezone($communityId);

        $query->where("{$table}.category", 'event')
            ->where("{$table}.status", 'published')
            ->where(function ($status) use ($table) {
                $status->whereNull("{$table}.review_status")
                    ->orWhere("{$table}.review_status", 'approved');
            });

        self::applyActiveScheduleConstraints($query, $table, $now->toDateString(), $now->format('H:i'));
    }

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

    /**
     * Pins stay first. Then each module uses its own date:
     * events by schedule (upcoming soonest, then recent past),
     * notices and alerts by latest update, and a mixed feed by
     * alerts, then events, then notices.
     *
     * @param  \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder  $query
     */
    public static function applyListOrdering($query, string $table, ?int $communityId, string $group, string $sort): void
    {
        $now = self::nowInTimezone($communityId);
        $today = $now->toDateString();
        $time = $now->format('H:i');
        $sort = in_array($sort, ['relevant', 'newest', 'oldest', 'schedule'], true) ? $sort : 'relevant';
        $group = in_array($group, ['events', 'alerts', 'notices', 'mixed'], true) ? $group : 'mixed';

        $query->orderByRaw(self::activePinOrderSql($table, $today, $time));

        if ($sort === 'newest') {
            $query->orderByDesc("{$table}.updated_at")->orderByDesc("{$table}.id");

            return;
        }

        if ($sort === 'oldest') {
            $query->orderBy("{$table}.updated_at")->orderBy("{$table}.id");

            return;
        }

        if ($sort === 'schedule' || ($sort === 'relevant' && $group === 'events')) {
            self::orderByEventSchedule($query, $table, $today, $time);

            return;
        }

        if ($sort === 'relevant' && ($group === 'alerts' || $group === 'notices')) {
            $query->orderByDesc("{$table}.updated_at")->orderByDesc("{$table}.id");

            return;
        }

        $query->orderByRaw("CASE {$table}.category WHEN 'emergency' THEN 0 WHEN 'event' THEN 1 ELSE 2 END");
        $ended = self::endedScheduleCase($table, $today, $time);
        $query->orderByRaw("CASE WHEN {$table}.category = 'event' THEN {$ended} ELSE 0 END");
        $query->orderByRaw("CASE WHEN {$table}.category = 'event' AND ({$ended}) = 0 THEN {$table}.event_date END ASC");
        $query->orderByRaw("CASE WHEN {$table}.category = 'event' AND ({$ended}) = 1 THEN {$table}.event_date END DESC");
        $query->orderByRaw("CASE WHEN {$table}.category = 'event' THEN COALESCE({$table}.event_time, '00:00:00') END ASC");
        $query->orderByDesc("{$table}.updated_at")->orderByDesc("{$table}.id");
    }

    /**
     * @param  \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder  $query
     */
    public static function applyRelevantDateFilter($query, string $table, ?string $from, ?string $to): void
    {
        $from = self::validDay($from);
        $to = self::validDay($to);
        if ($from === null && $to === null) {
            return;
        }

        $expr = "COALESCE({$table}.event_date, DATE({$table}.published_at), DATE({$table}.created_at))";
        if ($from !== null) {
            $query->whereRaw("{$expr} >= ?", [$from]);
        }
        if ($to !== null) {
            $query->whereRaw("{$expr} <= ?", [$to]);
        }
    }

    /**
     * @param  \Illuminate\Database\Query\Builder|\Illuminate\Database\Eloquent\Builder  $query
     */
    private static function orderByEventSchedule($query, string $table, string $today, string $time): void
    {
        $ended = self::endedScheduleCase($table, $today, $time);
        $query->orderByRaw("{$ended} ASC");
        $query->orderByRaw("CASE WHEN ({$ended}) = 0 THEN {$table}.event_date END ASC");
        $query->orderByRaw("CASE WHEN ({$ended}) = 1 THEN {$table}.event_date END DESC");
        $query->orderByRaw("COALESCE({$table}.event_time, '00:00:00') ASC");
        $query->orderByDesc("{$table}.updated_at")->orderByDesc("{$table}.id");
    }

    private static function endedScheduleCase(string $table, string $today, string $time): string
    {
        $todayQ = addslashes($today);
        $timeQ = addslashes($time);
        $endDateSql = "COALESCE({$table}.event_end_date, {$table}.event_date)";

        return <<<SQL
CASE WHEN {$table}.event_date IS NOT NULL AND (
    {$endDateSql} < '{$todayQ}'
    OR (
        DATE({$endDateSql}) = '{$todayQ}'
        AND {$table}.event_time_end IS NOT NULL
        AND {$table}.event_time_end <> ''
        AND (
            (
                STR_TO_DATE({$table}.event_time_end, '%H:%i:%s') IS NOT NULL
                AND TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i:%s')) < '{$timeQ}'
            )
            OR (
                STR_TO_DATE({$table}.event_time_end, '%H:%i') IS NOT NULL
                AND TIME(STR_TO_DATE({$table}.event_time_end, '%H:%i')) < '{$timeQ}'
            )
        )
    )
) THEN 1 ELSE 0 END
SQL;
    }

    private static function validDay(?string $value): ?string
    {
        $value = trim((string) $value);
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        $parsed = \DateTimeImmutable::createFromFormat('Y-m-d', $value);

        return $parsed && $parsed->format('Y-m-d') === $value ? $value : null;
    }
}
