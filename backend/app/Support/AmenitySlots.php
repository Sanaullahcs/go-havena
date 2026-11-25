<?php

namespace App\Support;

use Carbon\Carbon;

final class AmenitySlots
{
    public const MINUTES_PER_DAY = 1440;

    /**
     * Parse display hours like "8:00 AM - 10:00 PM" into 24h start/end times.
     *
     * @return array{0: ?string, 1: ?string}
     */
    public static function parseHoursRange(?string $hours): array
    {
        $hours = self::normalizeHoursText($hours);
        if (! $hours) {
            return [null, null];
        }

        if (! preg_match('/^\s*(.+?)\s*-\s*(.+?)\s*$/', $hours, $m)) {
            return [null, null];
        }

        $startMin = self::toMinutes(trim($m[1]));
        $endMin = self::toMinutes(trim($m[2]));
        if ($startMin === null || $endMin === null) {
            return [null, null];
        }

        return [self::formatTime($startMin), self::formatTime($endMin)];
    }

    /**
     * True when closing is earlier than or equal to opening on the clock,
     * so the close belongs to the next calendar day.
     */
    public static function isOvernight(?string $startTime, ?string $endTime): bool
    {
        $start = self::toMinutes($startTime ?? '');
        $end = self::toMinutes($endTime ?? '');

        return $start !== null && $end !== null && $end <= $start;
    }

    /**
     * Resolve opening/closing into a linear minute window.
     * Overnight (and equal clock times) extend the end by 24 hours.
     *
     * @return array{start: int, end: int, overnight: bool}|null
     */
    public static function resolvedWindow(?string $startTime, ?string $endTime): ?array
    {
        $start = self::toMinutes($startTime ?? '');
        $end = self::toMinutes($endTime ?? '');
        if ($start === null || $end === null) {
            return null;
        }

        $overnight = $end <= $start;
        if ($overnight) {
            $end += self::MINUTES_PER_DAY;
        }

        if ($end <= $start) {
            return null;
        }

        return [
            'start' => $start,
            'end' => $end,
            'overnight' => $overnight,
        ];
    }

    /**
     * Build booking slots from start/end wall times and duration minutes.
     *
     * @return list<array{
     *     label: string,
     *     value: string,
     *     start: string,
     *     end: string,
     *     start_day_offset: int,
     *     end_day_offset: int,
     *     starts_at: ?string,
     *     ends_at: ?string
     * }>
     */
    public static function generate(
        ?string $startTime,
        ?string $endTime,
        ?int $durationMinutes,
        ?string $hoursFallback = null,
        ?string $sessionDate = null,
    ): array {
        if ((! $startTime || ! $endTime) && $hoursFallback) {
            [$parsedStart, $parsedEnd] = self::parseHoursRange($hoursFallback);
            $startTime = $startTime ?: $parsedStart;
            $endTime = $endTime ?: $parsedEnd;
        }

        if (! $startTime || ! $endTime || ! $durationMinutes || $durationMinutes < 15) {
            return [];
        }

        $window = self::resolvedWindow($startTime, $endTime);
        if ($window === null) {
            return [];
        }

        $sessionStart = null;
        if (is_string($sessionDate) && $sessionDate !== '') {
            try {
                $sessionStart = Carbon::parse($sessionDate.' 00:00:00');
            } catch (\Throwable) {
                $sessionStart = null;
            }
        }

        $slots = [];
        for ($cursor = $window['start']; $cursor + $durationMinutes <= $window['end']; $cursor += $durationMinutes) {
            $slotEnd = $cursor + $durationMinutes;
            $from = self::formatLabel($cursor);
            $to = self::formatLabel($slotEnd);
            $slots[] = [
                'label' => $from,
                // ASCII hyphen avoids mojibake when DB/connection charset is misaligned.
                'value' => "{$from} - {$to}",
                'start' => self::formatTime($cursor),
                'end' => self::formatTime($slotEnd),
                'start_day_offset' => intdiv($cursor, self::MINUTES_PER_DAY),
                'end_day_offset' => intdiv($slotEnd, self::MINUTES_PER_DAY),
                'starts_at' => $sessionStart?->copy()->addMinutes($cursor)->format('Y-m-d H:i:s'),
                'ends_at' => $sessionStart?->copy()->addMinutes($slotEnd)->format('Y-m-d H:i:s'),
            ];
        }

        return $slots;
    }

    public static function normalizeSlotLabel(?string $value): string
    {
        return (string) self::normalizeHoursText($value ?? '');
    }

    public static function slotLabelsMatch(?string $left, ?string $right): bool
    {
        return self::normalizeSlotLabel($left) === self::normalizeSlotLabel($right)
            && self::normalizeSlotLabel($left) !== '';
    }

    public static function formatHoursDisplay(?string $startTime, ?string $endTime, ?string $fallback = null): ?string
    {
        $normalized = self::normalizeHoursText($fallback);
        if (
            $normalized === 'Open 24 Hours'
            || self::hoursTextCarriesDetail($normalized)
            || (is_string($normalized) && preg_match('/\p{Arabic}/u', $normalized))
            || (is_string($normalized) && preg_match('/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/', $normalized))
        ) {
            return $normalized;
        }

        if ($startTime && $endTime) {
            $start = self::toMinutes($startTime);
            $end = self::toMinutes($endTime);
            if ($start !== null && $end !== null) {
                return self::formatLabel($start).' - '.self::formatLabel($end);
            }
        }

        return self::normalizeHoursText($fallback);
    }

    /** A note such as "closed Friday" or "and 4:00 PM" is the hours, not a single range. */
    private static function hoursTextCarriesDetail(?string $value): bool
    {
        if (! is_string($value) || $value === '') {
            return false;
        }

        $stripped = preg_replace('/\b(?:AM|PM|am|pm)\b/u', '', $value) ?? $value;
        $stripped = preg_replace('/[\d:\s.\-–—,]+/u', '', $stripped) ?? $stripped;

        return $stripped !== '';
    }

    /** Repair common en-dash mojibake in stored amenity hour strings. */
    public static function normalizeHoursText(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }

        $fixed = str_replace(
            [
                "\u{2013}",
                "\u{2014}",
                // UTF-8 bytes of en-dash mis-decoded as CP1252 then re-encoded as UTF-8
                "\xC3\xA2\xE2\x82\xAC\xE2\x80\x9C",
                "\xC3\xA2\xE2\x82\xAC\xE2\x80\x93",
                "\xC3\xA2\xE2\x82\xAC\xE2\x80\x9D",
                'â€“',
                'â€"',
                'â€”',
                'Ã¢â‚¬â€œ',
            ],
            '-',
            $value
        );
        // Collapse spacing around the separator.
        $fixed = preg_replace('/\s*-\s*/', ' - ', $fixed) ?? $fixed;

        return $fixed;
    }

    public static function isWeekendDate(string $dateYmd): bool
    {
        $ts = strtotime($dateYmd.' 12:00:00');
        if ($ts === false) {
            return false;
        }
        $dow = (int) date('N', $ts); // 6=Sat, 7=Sun

        return $dow >= 6;
    }

    private static function toMinutes(string $time): ?int
    {
        if ($time === '') {
            return null;
        }

        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', trim($time), $m)) {
            return ((int) $m[1]) * 60 + (int) $m[2];
        }

        $ts = strtotime($time);
        if ($ts === false) {
            return null;
        }

        return ((int) date('G', $ts)) * 60 + (int) date('i', $ts);
    }

    private static function wrapMinutes(int $minutes): int
    {
        $wrapped = $minutes % self::MINUTES_PER_DAY;

        return $wrapped < 0 ? $wrapped + self::MINUTES_PER_DAY : $wrapped;
    }

    private static function formatTime(int $minutes): string
    {
        $wrapped = self::wrapMinutes($minutes);
        $h = intdiv($wrapped, 60);
        $m = $wrapped % 60;

        return sprintf('%02d:%02d:00', $h, $m);
    }

    private static function formatLabel(int $minutes): string
    {
        $wrapped = self::wrapMinutes($minutes);
        $h24 = intdiv($wrapped, 60);
        $m = $wrapped % 60;
        $suffix = $h24 >= 12 ? 'PM' : 'AM';
        $h12 = $h24 % 12;
        if ($h12 === 0) {
            $h12 = 12;
        }

        return $m === 0
            ? sprintf('%d:00 %s', $h12, $suffix)
            : sprintf('%d:%02d %s', $h12, $m, $suffix);
    }
}
