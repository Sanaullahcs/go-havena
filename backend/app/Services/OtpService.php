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
        $code = $this->issueCode();

        PhoneOtp::query()->where('phone', $phone)->delete();

        PhoneOtp::query()->create([
            'phone' => $phone,
            'code_hash' => self::hashCode($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes($this->expireMinutes()),
        ]);

        // No SMS provider yet — always log when using a fixed/demo code so ops can recover.
        if ($this->usesFixedCode()) {
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

        $fixed = $this->fixedCode();
        if ($fixed !== null && $code === $fixed) {
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

    private function issueCode(): string
    {
        $fixed = $this->fixedCode();

        return $fixed ?? (string) random_int(100000, 999999);
    }

    private function usesFixedCode(): bool
    {
        return $this->fixedCode() !== null;
    }

    /**
     * Fixed demo code when OTP_FIXED_CODE is set, or on local/testing/uat.
     * Production with no SMS must set OTP_FIXED_CODE explicitly.
     */
    private function fixedCode(): ?string
    {
        $configured = trim((string) config('otp.fixed_code', ''));
        if ($configured !== '') {
            return $configured;
        }

        if (app()->environment('local', 'testing', 'uat', 'staging')) {
            return self::DEV_CODE;
        }

        return null;
    }

    private function expireMinutes(): int
    {
        $minutes = (int) config('otp.expire_minutes', self::EXPIRE_MINUTES);

        return $minutes > 0 ? $minutes : self::EXPIRE_MINUTES;
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
