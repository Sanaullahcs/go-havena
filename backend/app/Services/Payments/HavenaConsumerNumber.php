<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use App\Services\Kuickpay\KuickpayFormat;

/**
 * 18-digit KuickPay / 1BILL consumer number for a Havena-generated bill:
 * 5-digit institution prefix + 1-digit bill kind + 12-digit bill id.
 * Residents can pay it from any bank or wallet app that supports KuickPay.
 */
final class HavenaConsumerNumber
{
    private const KINDS = [
        PaymentAttempt::PAYABLE_SERVICE_BILL => '1',
        PaymentAttempt::PAYABLE_AMENITY_BILL => '2',
    ];

    public static function prefix(): string
    {
        $prefix = KuickpayFormat::digits((string) config('kuickpay.institution.prefix', '01999'));

        return str_pad(substr($prefix, 0, 5), 5, '0', STR_PAD_LEFT);
    }

    public static function encode(string $payableType, int $id): ?string
    {
        $kind = self::KINDS[$payableType] ?? null;
        if ($kind === null || $id < 1) {
            return null;
        }

        return self::prefix().$kind.str_pad((string) $id, 12, '0', STR_PAD_LEFT);
    }

    /** @return array{0: string, 1: int}|null  [payable_type, id] */
    public static function decode(string $consumerNumber): ?array
    {
        $digits = KuickpayFormat::digits($consumerNumber);
        if (strlen($digits) !== 18 || ! str_starts_with($digits, self::prefix())) {
            return null;
        }

        $type = array_search(substr($digits, 5, 1), self::KINDS, true);
        $id = (int) ltrim(substr($digits, 6), '0');
        if ($type === false || $id < 1) {
            return null;
        }

        return [(string) $type, $id];
    }

    /** "01999 1000 0000 0012 3" style grouping so it is easy to read out at a bank counter. */
    public static function display(string $consumerNumber): string
    {
        return substr($consumerNumber, 0, 5).' '.trim(chunk_split(substr($consumerNumber, 5), 4, ' '));
    }
}
