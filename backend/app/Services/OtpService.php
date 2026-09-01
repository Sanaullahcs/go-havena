<?php

namespace App\Services;

use App\Mail\AuthOtpMail;
use App\Models\EmailOtp;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class OtpService
{
    public const DEV_CODE = '123456';

    public const EXPIRE_MINUTES = 2;

    public function send(string $email): void
    {
        $email = $this->normalizedEmail($email);
        $code = $this->issueCode();

        EmailOtp::query()->where('email', $email)->delete();

        EmailOtp::query()->create([
            'email' => $email,
            'code_hash' => self::hashCode($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes($this->expireMinutes()),
        ]);

        Log::info('Havena OTP', ['email' => $email, 'code' => $this->usesFixedCode() ? $code : '[hidden]']);

        if ($this->shouldSendMail()) {
            Mail::to($email)->send(new AuthOtpMail($code));
        }
    }

    public function verify(string $email, string $code): bool
    {
        if (! $this->check($email, $code)) {
            return false;
        }

        EmailOtp::query()->where('email', $this->normalizedEmail($email))->delete();

        return true;
    }

    /** Validate OTP without consuming it (for multi-step guest login). */
    public function check(string $email, string $code): bool
    {
        $email = $this->normalizedEmail($email);
        $code = trim($code);

        // OTP_FIXED_CODE is a master code for any email (store review / demo).
        // It is env-driven, not an allowlist, and does not depend on the 2-minute row.
        if ($this->matchesConfiguredMasterCode($code)) {
            return true;
        }

        $otp = EmailOtp::query()
            ->where('email', $email)
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $otp || $otp->attempts >= 5) {
            return false;
        }

        $implicit = $this->implicitDevCode();
        if ($implicit !== null && hash_equals($implicit, $code)) {
            return true;
        }

        if (! self::verifyCode($code, $otp->code_hash)) {
            $otp->increment('attempts');

            return false;
        }

        return true;
    }

    public function consume(string $email): void
    {
        EmailOtp::query()->where('email', $this->normalizedEmail($email))->delete();
    }

    /** Keep OTP alive for multi-step flows (e.g. guest invite entry). */
    public function extend(string $email, int $minutes = 15): void
    {
        EmailOtp::query()
            ->where('email', $this->normalizedEmail($email))
            ->where('expires_at', '>', now())
            ->update(['expires_at' => now()->addMinutes($minutes)]);
    }

    public function normalizedEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private function issueCode(): string
    {
        // Production always emails a random code. 123456 may still verify
        // when OTP_FIXED_CODE is set (store / QA fallback).
        if (app()->environment('production')) {
            return (string) random_int(100000, 999999);
        }

        $fixed = $this->fixedCode();

        return $fixed ?? (string) random_int(100000, 999999);
    }

    private function usesFixedCode(): bool
    {
        return $this->fixedCode() !== null;
    }

    private function shouldSendMail(): bool
    {
        $mailer = (string) config('mail.default', 'log');

        return ! in_array($mailer, ['array', 'log'], true) || app()->environment('local');
    }

    /**
     * Fixed demo code when OTP_FIXED_CODE is set, or on local/testing/uat.
     */
    private function fixedCode(): ?string
    {
        $configured = $this->configuredMasterCode();
        if ($configured !== null) {
            return $configured;
        }

        return $this->implicitDevCode();
    }

    /** Explicit OTP_FIXED_CODE from env — works in every environment, including production. */
    private function configuredMasterCode(): ?string
    {
        $configured = trim((string) config('otp.fixed_code', ''));
        if ($configured !== '' && preg_match('/^\d{4,8}$/', $configured) === 1) {
            return $configured;
        }

        return null;
    }

    private function matchesConfiguredMasterCode(string $code): bool
    {
        $configured = $this->configuredMasterCode();

        return $configured !== null && hash_equals($configured, $code);
    }

    /** Local / testing / uat fallback when OTP_FIXED_CODE is empty. */
    private function implicitDevCode(): ?string
    {
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

    private static function hashCode(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    private static function verifyCode(string $code, string $hash): bool
    {
        return hash_equals($hash, self::hashCode($code));
    }
}
