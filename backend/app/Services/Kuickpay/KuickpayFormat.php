<?php

namespace App\Services\Kuickpay;

use Illuminate\Support\Carbon;

/**
 * KuickPay wire formats. Public docs disagree between endpoints (AN14 versus
 * plain paisa, YYMM versus MMYY), so every parser here accepts both shapes and
 * every encoder emits the shape the specific endpoint documents.
 */
final class KuickpayFormat
{
    /** "0000000250000+" for Rs 2,500.00. */
    public static function an14(int $paisa): string
    {
        $sign = $paisa < 0 ? '-' : '+';

        return str_pad((string) abs($paisa), 13, '0', STR_PAD_LEFT).$sign;
    }

    /** Accepts AN14 ("0000000250000+") or plain paisa ("250000"); returns paisa. */
    public static function parsePaisa(mixed $value): ?int
    {
        $raw = trim((string) ($value ?? ''));
        if ($raw === '') {
            return null;
        }

        if (preg_match('/^(\d{1,13})([+-])$/', $raw, $m)) {
            $paisa = (int) ltrim($m[1], '0');

            return $m[2] === '-' ? -$paisa : $paisa;
        }

        if (preg_match('/^\d+$/', $raw)) {
            return (int) $raw;
        }

        return null;
    }

    /** "1250.00" — Checkout amounts are rupees with two decimals. */
    public static function rupees(int $paisa): string
    {
        return number_format($paisa / 100, 2, '.', '');
    }

    public static function rupeesToPaisa(mixed $value): ?int
    {
        $raw = trim((string) ($value ?? ''));
        if ($raw === '' || ! is_numeric($raw)) {
            return null;
        }

        return (int) round(((float) $raw) * 100);
    }

    /**
     * Billing month to "YYYY-MM". KuickPay sends YYMM on institution calls and
     * MMYY on initiator calls; a value above 12 in either half settles which.
     */
    public static function parseBillingMonth(?string $value, string $preferred = 'MMYY'): ?string
    {
        $raw = preg_replace('/\D/', '', (string) $value);
        if ($raw === null || strlen($raw) !== 4) {
            return null;
        }

        $first = (int) substr($raw, 0, 2);
        $last = (int) substr($raw, 2, 2);

        if ($first > 12 && $last >= 1 && $last <= 12) {
            [$year, $month] = [$first, $last];
        } elseif ($last > 12 && $first >= 1 && $first <= 12) {
            [$month, $year] = [$first, $last];
        } elseif ($preferred === 'YYMM') {
            [$year, $month] = [$first, $last];
        } else {
            [$month, $year] = [$first, $last];
        }

        if ($month < 1 || $month > 12) {
            return null;
        }

        return sprintf('%04d-%02d', 2000 + $year, $month);
    }

    public static function yymm(string $billingMonth): string
    {
        $date = Carbon::createFromFormat('Y-m', substr($billingMonth, 0, 7));

        return $date->format('ym');
    }

    public static function mmyy(string $billingMonth): string
    {
        $date = Carbon::createFromFormat('Y-m', substr($billingMonth, 0, 7));

        return $date->format('my');
    }

    public static function parseDate(?string $value): ?Carbon
    {
        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        foreach (['Ymd', 'Y-m-d'] as $format) {
            try {
                $date = Carbon::createFromFormat($format, $raw);
                if ($date !== false) {
                    return $date->startOfDay();
                }
            } catch (\Throwable) {
                // Try the next format.
            }
        }

        return null;
    }

    /** Names KuickPay displays on bank screens: letters, digits and spaces only, 50 chars. */
    public static function consumerDetail(?string $name): string
    {
        $clean = strtoupper(trim((string) preg_replace('/[^A-Za-z0-9 ]+/', ' ', (string) $name)));
        $clean = (string) preg_replace('/\s+/', ' ', $clean);

        return mb_substr($clean !== '' ? $clean : 'HAVENA RESIDENT', 0, 50);
    }

    public static function digits(?string $value): string
    {
        return (string) preg_replace('/\D+/', '', (string) $value);
    }
}
