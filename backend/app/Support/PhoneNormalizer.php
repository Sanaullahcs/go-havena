<?php

namespace App\Support;

use App\Models\User;

class PhoneNormalizer
{
    /** Normalize phone to E.164 (+XXXXXXXX). Supports international numbers. */
    public static function normalize(?string $phone): ?string
    {
        if ($phone === null || trim($phone) === '') {
            return null;
        }

        $trimmed = trim($phone);

        if (str_starts_with($trimmed, '+')) {
            $digits = preg_replace('/\D/', '', substr($trimmed, 1));

            if (strlen($digits) >= 8 && strlen($digits) <= 15) {
                return '+'.$digits;
            }

            return null;
        }

        $digits = preg_replace('/\D/', '', $trimmed);

        if (strlen($digits) === 11 && str_starts_with($digits, '1')) {
            return '+'.$digits;
        }

        if (strlen($digits) > 11) {
            return null;
        }

        if (strlen($digits) === 11) {
            $digits = substr($digits, 0, 10);
        }

        if (strlen($digits) === 10) {
            // Egypt and other +20 numbers were sometimes misread as US area code 201.
            if (preg_match('/^20[1-9]\d{7}$/', $digits)) {
                return '+'.$digits;
            }

            return '+1'.$digits;
        }

        if (strlen($digits) >= 8 && strlen($digits) <= 15) {
            return '+'.$digits;
        }

        return null;
    }

    /**
     * Legacy lookup aliases when +20… was incorrectly stored as +1 + 20….
     * Example: +2017777777 ↔ +12017777777
     *
     * @return list<string>
     */
    public static function alternatesForLookup(string $normalized): array
    {
        $alternates = [];

        if (preg_match('/^\+20(\d+)$/', $normalized)) {
            $alternates[] = '+1'.substr($normalized, 1);
        }

        if (preg_match('/^\+1(20\d+)$/', $normalized, $matches)) {
            $alternates[] = '+'.$matches[1];
        }

        return array_values(array_unique($alternates));
    }

    /** Find user by normalized phone, including legacy mis-stored variants. */
    public static function findUserByPhone(string $rawPhone): ?User
    {
        $phone = self::normalize($rawPhone);
        if (! $phone) {
            return null;
        }

        $user = User::query()->where('phone', $phone)->first();
        if ($user) {
            return $user;
        }

        foreach (self::alternatesForLookup($phone) as $alternate) {
            $user = User::query()->where('phone', $alternate)->first();
            if (! $user) {
                continue;
            }

            if (self::shouldMigrateStoredPhone($rawPhone, $phone, $user->phone)) {
                $user->update(['phone' => $phone]);
            }

            return $user->fresh();
        }

        return null;
    }

    /** Prefer explicit international input (+20…) over legacy +1-prefixed storage. */
    private static function shouldMigrateStoredPhone(string $rawPhone, string $normalized, string $stored): bool
    {
        if ($normalized === $stored) {
            return false;
        }

        if (! str_starts_with(trim($rawPhone), '+')) {
            return false;
        }

        return in_array($stored, self::alternatesForLookup($normalized), true);
    }

    public static function isValid(?string $phone): bool
    {
        return self::normalize($phone) !== null;
    }
}
