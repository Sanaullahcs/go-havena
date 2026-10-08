<?php

namespace App\Support;

/**
 * Currency catalog for community money display.
 *
 * Havena stores money as plain decimals — a community's currency decides how
 * those numbers are rendered, nothing more. No conversion happens anywhere.
 */
final class Currency
{
    public const DEFAULT = 'USD';

    /**
     * ISO-3166 alpha-2 country => ISO-4217 currency. Covers every country the
     * platform currently onboards; anything else falls back to USD.
     *
     * @var array<string, string>
     */
    private const BY_COUNTRY = [
        'US' => 'USD',
        'PK' => 'PKR',
        'IN' => 'INR',
        'BD' => 'BDT',
        'LK' => 'LKR',
        'AE' => 'AED',
        'SA' => 'SAR',
        'QA' => 'QAR',
        'KW' => 'KWD',
        'BH' => 'BHD',
        'OM' => 'OMR',
        'GB' => 'GBP',
        'IE' => 'EUR',
        'DE' => 'EUR',
        'FR' => 'EUR',
        'ES' => 'EUR',
        'IT' => 'EUR',
        'NL' => 'EUR',
        'PT' => 'EUR',
        'CA' => 'CAD',
        'AU' => 'AUD',
        'NZ' => 'NZD',
        'SG' => 'SGD',
        'MY' => 'MYR',
        'ID' => 'IDR',
        'PH' => 'PHP',
        'TR' => 'TRY',
        'EG' => 'EGP',
        'ZA' => 'ZAR',
        'NG' => 'NGN',
        'KE' => 'KES',
        'MX' => 'MXN',
        'BR' => 'BRL',
        'JP' => 'JPY',
        'CN' => 'CNY',
        'HK' => 'HKD',
        'CH' => 'CHF',
    ];

    /**
     * Display symbol and minor-unit precision per currency.
     *
     * Symbols are the forms people in that market actually read: "Rs" rather
     * than "₨" for Pakistan, "₹" for India. Whole-rupee currencies drop the
     * decimals because nobody quotes paisa on a maintenance bill.
     *
     * @var array<string, array{symbol: string, decimals: int}>
     */
    private const DISPLAY = [
        'USD' => ['symbol' => '$', 'decimals' => 2],
        'PKR' => ['symbol' => 'Rs', 'decimals' => 0],
        'INR' => ['symbol' => '₹', 'decimals' => 0],
        'BDT' => ['symbol' => '৳', 'decimals' => 0],
        'LKR' => ['symbol' => 'Rs', 'decimals' => 0],
        'AED' => ['symbol' => 'AED', 'decimals' => 2],
        'SAR' => ['symbol' => 'SAR', 'decimals' => 2],
        'QAR' => ['symbol' => 'QAR', 'decimals' => 2],
        'KWD' => ['symbol' => 'KWD', 'decimals' => 3],
        'BHD' => ['symbol' => 'BHD', 'decimals' => 3],
        'OMR' => ['symbol' => 'OMR', 'decimals' => 3],
        'GBP' => ['symbol' => '£', 'decimals' => 2],
        'EUR' => ['symbol' => '€', 'decimals' => 2],
        'CAD' => ['symbol' => 'C$', 'decimals' => 2],
        'AUD' => ['symbol' => 'A$', 'decimals' => 2],
        'NZD' => ['symbol' => 'NZ$', 'decimals' => 2],
        'SGD' => ['symbol' => 'S$', 'decimals' => 2],
        'MYR' => ['symbol' => 'RM', 'decimals' => 2],
        'IDR' => ['symbol' => 'Rp', 'decimals' => 0],
        'PHP' => ['symbol' => '₱', 'decimals' => 2],
        'TRY' => ['symbol' => '₺', 'decimals' => 2],
        'EGP' => ['symbol' => 'E£', 'decimals' => 2],
        'ZAR' => ['symbol' => 'R', 'decimals' => 2],
        'NGN' => ['symbol' => '₦', 'decimals' => 0],
        'KES' => ['symbol' => 'KSh', 'decimals' => 0],
        'MXN' => ['symbol' => 'MX$', 'decimals' => 2],
        'BRL' => ['symbol' => 'R$', 'decimals' => 2],
        'JPY' => ['symbol' => '¥', 'decimals' => 0],
        'CNY' => ['symbol' => '¥', 'decimals' => 2],
        'HKD' => ['symbol' => 'HK$', 'decimals' => 2],
        'CHF' => ['symbol' => 'CHF', 'decimals' => 2],
    ];

    /** @return list<string> */
    public static function codes(): array
    {
        return array_keys(self::DISPLAY);
    }

    public static function isSupported(?string $code): bool
    {
        return $code !== null && isset(self::DISPLAY[strtoupper(trim($code))]);
    }

    /** Normalises any input to a supported code, falling back to USD. */
    public static function normalize(?string $code): string
    {
        $upper = strtoupper(trim((string) $code));

        return isset(self::DISPLAY[$upper]) ? $upper : self::DEFAULT;
    }

    public static function forCountry(?string $countryCode): string
    {
        $upper = strtoupper(trim((string) $countryCode));

        return self::BY_COUNTRY[$upper] ?? self::DEFAULT;
    }

    public static function symbol(?string $code): string
    {
        return self::DISPLAY[self::normalize($code)]['symbol'];
    }

    public static function decimals(?string $code): int
    {
        return self::DISPLAY[self::normalize($code)]['decimals'];
    }

    /** @return array{code: string, symbol: string, decimals: int} */
    public static function describe(?string $code): array
    {
        $normalized = self::normalize($code);

        return [
            'code' => $normalized,
            'symbol' => self::DISPLAY[$normalized]['symbol'],
            'decimals' => self::DISPLAY[$normalized]['decimals'],
        ];
    }

    /**
     * "Rs 18,000" / "$1,250.50". Trailing zeros are dropped so a round amount
     * reads as "$75" rather than "$75.00", and letter symbols get a space so
     * "Rs18,000" never happens.
     */
    public static function format(float|int|string|null $amount, ?string $code = null): string
    {
        $value = (float) ($amount ?? 0);
        $normalized = self::normalize($code);
        $symbol = self::DISPLAY[$normalized]['symbol'];
        $decimals = self::DISPLAY[$normalized]['decimals'];

        if ($decimals > 0 && abs($value - round($value)) < 0.00001) {
            $decimals = 0;
        }

        $separator = preg_match('/[A-Za-z]$/', $symbol) === 1 ? ' ' : '';

        return $symbol.$separator.number_format($value, $decimals);
    }
}
