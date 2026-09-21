<?php

namespace App\Support;

final class AmenitySlots
{
    /**
     * Build booking slots from start/end wall times and duration minutes.
     *
     * @return list<array{label: string, value: string, start: string, end: string}>
     */
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

    public static function generate(?string $startTime, ?string $endTime, ?int $durationMinutes, ?string $hoursFallback = null): array
    {
        if ((! $startTime || ! $endTime) && $hoursFallback) {
            [$parsedStart, $parsedEnd] = self::parseHoursRange($hoursFallback);
            $startTime = $startTime ?: $parsedStart;
            $endTime = $endTime ?: $parsedEnd;
        }

        if (! $startTime || ! $endTime || ! $durationMinutes || $durationMinutes < 15) {
            return [];
        }

        $start = self::toMinutes($startTime);
        $end = self::toMinutes($endTime);
        if ($start === null || $end === null || $end <= $start) {
            return [];
        }

        $slots = [];
        for ($cursor = $start; $cursor + $durationMinutes <= $end; $cursor += $durationMinutes) {
            $from = self::formatLabel($cursor);
            $to = self::formatLabel($cursor + $durationMinutes);
            $slots[] = [
                'label' => $from,
                // ASCII hyphen avoids mojibake when DB/connection charset is misaligned.
                'value' => "{$from} - {$to}",
                'start' => self::formatTime($cursor),
                'end' => self::formatTime($cursor + $durationMinutes),
            ];
        }

        return $slots;
    }

    public static function formatHoursDisplay(?string $startTime, ?string $endTime, ?string $fallback = null): ?string
    {
        if ($startTime && $endTime) {
            $start = self::toMinutes($startTime);
            $end = self::toMinutes($endTime);
            if ($start !== null && $end !== null) {
                return self::formatLabel($start).' - '.self::formatLabel($end);
            }
        }

        return self::normalizeHoursText($fallback);
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
        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', trim($time), $m)) {
            return ((int) $m[1]) * 60 + (int) $m[2];
        }

        $ts = strtotime($time);
        if ($ts === false) {
            return null;
        }

        return ((int) date('G', $ts)) * 60 + (int) date('i', $ts);
    }

    private static function formatTime(int $minutes): string
    {
        $h = intdiv($minutes, 60);
        $m = $minutes % 60;

        return sprintf('%02d:%02d:00', $h, $m);
    }

    private static function formatLabel(int $minutes): string
    {
        $h24 = intdiv($minutes, 60);
        $m = $minutes % 60;
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
