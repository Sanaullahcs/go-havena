<?php

namespace App\Services;

use App\Models\PhoneOtp;
use Illuminate\Support\Facades\Log;

class OtpService
{
    public const DEV_CODE = '123456';

    public const EXPIRE_MINUTES = 2;

    public function send(string $phone): void
    {
        $code = app()->environment('local', 'testing', 'uat') ? self::DEV_CODE : (string) random_int(100000, 999999);

        PhoneOtp::query()->where('phone', $phone)->delete();

        PhoneOtp::query()->create([
            'phone' => $phone,
            'code_hash' => self::hashCode($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(self::EXPIRE_MINUTES),
        ]);

        if (app()->environment('local', 'testing', 'uat')) {
            Log::info('Havena OTP', ['phone' => $phone, 'code' => $code]);
        }
    }

    public function verify(string $phone, string $code): bool
    {
        if (! $this->check($phone, $code)) {
            return false;
        }

        PhoneOtp::query()->where('phone', $phone)->delete();

        return true;
    }

    /** Validate OTP without consuming it (for multi-step guest login). */
    public function check(string $phone, string $code): bool
    {
        $otp = PhoneOtp::query()
            ->where('phone', $phone)
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $otp || $otp->attempts >= 5) {
            return false;
        }

        if (app()->environment('local', 'testing', 'uat') && $code === self::DEV_CODE) {
            return true;
        }

        if (! self::verifyCode($code, $otp->code_hash)) {
            $otp->increment('attempts');

            return false;
        }

        return true;
    }

    public function consume(string $phone): void
    {
        PhoneOtp::query()->where('phone', $phone)->delete();
    }

    /** Keep OTP alive for multi-step flows (e.g. guest invite entry). */
    public function extend(string $phone, int $minutes = 15): void
    {
        PhoneOtp::query()
            ->where('phone', $phone)
            ->where('expires_at', '>', now())
            ->update(['expires_at' => now()->addMinutes($minutes)]);
    }

    /** Short-lived OTP codes use HMAC (not bcrypt) for fast send/verify. */
    private static function hashCode(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    private static function verifyCode(string $code, string $hash): bool
    {
        return hash_equals($hash, self::hashCode($code));
    }
}
