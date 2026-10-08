<?php

namespace App\Services\Kuickpay;

final class KuickpaySignature
{
    /** Fields KuickPay signs on the checkout return, in order. */
    public const RETURN_FIELDS = ['orderid', 'transactionid', 'amount', 'status', 'responsecode'];

    /** companyid|orderid|amount|amountPayable|timestamp, HMAC-SHA256, lowercase hex. */
    public static function session(
        string $companyId,
        string $orderId,
        string $amount,
        string $amountPayable,
        string $timestamp,
        string $securedKey,
    ): string {
        return hash_hmac('sha256', implode('|', [$companyId, $orderId, $amount, $amountPayable, $timestamp]), $securedKey);
    }

    /** @param  array<string, mixed>  $params */
    public static function forReturn(array $params, string $securedKey): string
    {
        $message = implode('|', array_map(
            static fn (string $field) => trim((string) ($params[$field] ?? '')),
            self::RETURN_FIELDS,
        ));

        return hash_hmac('sha256', $message, $securedKey);
    }

    /** @param  array<string, mixed>  $params */
    public static function verifyReturn(array $params, string $securedKey): bool
    {
        $given = strtolower(trim((string) ($params['signature'] ?? '')));
        if ($given === '' || $securedKey === '') {
            return false;
        }

        return hash_equals(self::forReturn($params, $securedKey), $given);
    }
}
