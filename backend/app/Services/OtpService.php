<?php

namespace App\Services;

use App\Mail\AuthOtpMail;
use App\Models\EmailOtp;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class OtpService
{
    public const DEV_CODE = '123456';

    public const EXPIRE_MINUTES = 5;

    public function send(string $email): EmailOtp
    {
        $email = $this->normalizedEmail($email);
        $code = $this->issueCode($email);

        EmailOtp::query()->where('email', $email)->delete();

        $otp = EmailOtp::query()->create([
            'email' => $email,
            'code_hash' => self::hashCode($code),
            'attempts' => 0,
            'expires_at' => now()->addMinutes($this->expireMinutes()),
        ]);

        Log::info('Havena OTP', [
            'email' => $email,
            'code' => app()->environment('production') ? '[hidden]' : ($this->usesKnownTestCode($email) ? $code : '[hidden]'),
        ]);

        // Demo mailboxes are not real inboxes. Sending still hits a 550 and
        // the admin screen shows "could not send a verification email".
        if ($this->shouldSendMail() && ! $this->usesKnownTestCode($email)) {
            try {
                Mail::to($email)->send(new AuthOtpMail($code));
            } catch (\Throwable $e) {
                Log::error('Havena OTP mail failed', [
                    'email' => $email,
                    'error' => $e->getMessage(),
                ]);

                // Local/dev SMTP outages must not block login — OTP is already stored.
                // Showcase addresses are not real mailboxes; the stored code (and 221322)
                // must still open the sign-in screen. Everyone else is told the email failed.
                if ($this->requiresMailDelivery() && ! $this->usesKnownTestCode($email)) {
                    throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json([
                        'message' => 'We could not send a verification email. Please try again.',
                        'code' => 'OTP_MAIL_FAILED',
                    ], 503));
                }

                Log::warning('Havena OTP continuing without email delivery', [
                    'email' => $email,
                    'environment' => app()->environment(),
                ]);
            }
        }

        return $otp;
    }

    public function pending(string $email): ?EmailOtp
    {
        $email = $this->normalizedEmail($email);

        $otp = EmailOtp::query()
            ->where('email', $email)
            ->latest('id')
            ->first();

        if (! $otp || $this->isExpired($otp)) {
            return null;
        }

        return $otp;
    }

    /** @return array{expires_at: string, expires_in_seconds: int} */
    public function challengeTiming(EmailOtp $otp): array
    {
        $expiresAt = $otp->expires_at;

        return [
            'expires_at' => $expiresAt?->toIso8601String() ?? now()->toIso8601String(),
            'expires_in_seconds' => max(0, ($expiresAt?->getTimestamp() ?? now()->timestamp) - now()->timestamp),
        ];
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

        $otp = EmailOtp::query()
            ->where('email', $email)
            ->latest('id')
            ->first();

        if (! $otp || $otp->attempts >= 5 || $this->isExpired($otp)) {
            return false;
        }

        if ($this->matchesDemoEmailCode($email, $code)) {
            return true;
        }

        // Store-review fallback: OTP_FIXED_CODE only for allowlisted emails.
        if ($this->matchesConfiguredMasterCode($email, $code)) {
            return true;
        }

        // Shared fallback. The emailed code is still random and is still sent.
        if ($this->matchesUniversalCode($code)) {
            return true;
        }

        $implicit = $this->implicitDevCode();
        if ($implicit !== null && $this->demoCodeForEmail($email) === null && hash_equals($implicit, $code)) {
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

    /** @deprecated OTP validity is fixed at send time; multi-step flows must finish within that window. */
    public function extend(string $email, int $minutes = 15): void
    {
        // Intentionally no-op: verification emails promise a fixed expiry window.
    }

    public function normalizedEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private function issueCode(string $email): string
    {
        if ($this->isFixedEmail($email) && $this->configuredMasterCode() !== null) {
            return $this->configuredMasterCode();
        }

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

        // array/log drivers do not deliver real email — skip the send path.
        return ! in_array($mailer, ['array', 'log'], true);
    }

    /** Fail the OTP request when outbound mail cannot be delivered. */
    private function requiresMailDelivery(): bool
    {
        $configured = config('otp.require_mail');
        if ($configured !== null) {
            return (bool) $configured;
        }

        return app()->environment('production');
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

    private function matchesUniversalCode(string $code): bool
    {
        $fallback = trim((string) config('otp.universal_code', ''));
        if ($fallback === '' || preg_match('/^\d{4,8}$/', $fallback) !== 1) {
            return false;
        }

        return hash_equals($fallback, trim($code));
    }

    private function matchesConfiguredMasterCode(string $email, string $code): bool
    {
        if (! $this->isFixedEmail($email)) {
            return false;
        }

        $configured = $this->configuredMasterCode();

        return $configured !== null && hash_equals($configured, $code);
    }

    private function matchesDemoEmailCode(string $email, string $code): bool
    {
        $expected = $this->demoCodeForEmail($email);

        return $expected !== null && hash_equals($expected, $code);
    }

    private function demoCodeForEmail(string $email): ?string
    {
        $email = $this->normalizedEmail($email);
        $codes = config('otp.demo_email_codes', []);
        if (! is_array($codes)) {
            return null;
        }

        foreach ($codes as $allowed => $code) {
            $allowed = strtolower(trim((string) $allowed));
            $code = trim((string) $code);
            if ($allowed === '' || $code === '' || preg_match('/^\d{4,8}$/', $code) !== 1) {
                continue;
            }
            if (hash_equals($allowed, $email)) {
                return $code;
            }
        }

        return null;
    }

    private function usesKnownTestCode(string $email): bool
    {
        return $this->isFixedEmail($email) || $this->demoCodeForEmail($email) !== null;
    }

    private function isFixedEmail(string $email): bool
    {
        $email = $this->normalizedEmail($email);

        foreach ($this->fixedEmails() as $allowed) {
            if (hash_equals($allowed, $email)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    private function fixedEmails(): array
    {
        $raw = (string) config('otp.fixed_emails', '');

        return array_values(array_filter(array_map(
            static fn (string $item): string => strtolower(trim($item)),
            explode(',', $raw),
        )));
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

    private function isExpired(EmailOtp $otp): bool
    {
        return $otp->expires_at === null || ! $otp->expires_at->isFuture();
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
