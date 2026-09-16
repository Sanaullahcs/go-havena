<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;

class OtpRateLimitService
{
    /** @return array<string, mixed> */
    public function status(string $email): array
    {
        $email = $this->normalize($email);
        if ($this->isBypassed($email)) {
            return $this->bypassStatus();
        }

        $state = $this->refreshExpiredLocks($email);

        $now = now()->timestamp;
        $securityUntil = (int) ($state['security_locked_until'] ?? 0);
        if ($securityUntil > $now) {
            return $this->lockedStatus('security', $securityUntil - $now, $state);
        }

        $resendUntil = (int) ($state['resend_locked_until'] ?? 0);
        if ($resendUntil > $now) {
            return $this->lockedStatus('resend_limit', $resendUntil - $now, $state);
        }

        $sendCount = (int) ($state['send_count'] ?? 0);
        $resendsUsed = max(0, $sendCount - 1);
        $maxResends = $this->maxResends();
        $cooldown = max(0, ((int) ($state['last_send_at'] ?? 0)) + $this->resendCooldownSeconds() - $now);

        return [
            'locked' => false,
            'lock_type' => null,
            'resend_cooldown_seconds' => $cooldown,
            'resends_remaining' => max(0, $maxResends - $resendsUsed),
            'resend_limit' => $maxResends,
            'retry_after_seconds' => $cooldown,
        ];
    }

    public function assertCanRequest(string $email): void
    {
        $email = $this->normalize($email);
        if ($this->isBypassed($email)) {
            return;
        }

        $status = $this->status($email);
        if ($status['locked']) {
            $this->throwLocked($status);
        }

        if (($status['retry_after_seconds'] ?? 0) > 0) {
            $this->throwCooldown($status);
        }
    }

    public function assertCanVerify(string $email): void
    {
        $email = $this->normalize($email);
        if ($this->isBypassed($email)) {
            return;
        }

        $state = $this->refreshExpiredLocks($email);
        $now = now()->timestamp;
        $securityUntil = (int) ($state['security_locked_until'] ?? 0);
        if ($securityUntil > $now) {
            $this->throwLocked($this->lockedStatus('security', $securityUntil - $now, $state));
        }
    }

    /** @return array<string, mixed> */
    public function recordRequest(string $email): array
    {
        $email = $this->normalize($email);
        if ($this->isBypassed($email)) {
            return $this->bypassStatus();
        }

        $this->assertCanRequest($email);

        $state = $this->getState($email);
        $state['send_count'] = (int) ($state['send_count'] ?? 0) + 1;
        $state['last_send_at'] = now()->timestamp;

        $resendsUsed = max(0, $state['send_count'] - 1);
        if ($resendsUsed >= $this->maxResends()) {
            $state['resend_locked_until'] = now()->timestamp + $this->resendLockSeconds();
        }

        $this->putState($email, $state);

        return $this->status($email);
    }

    public function recordFailedVerify(string $email): void
    {
        $email = $this->normalize($email);
        if ($this->isBypassed($email)) {
            return;
        }

        $state = $this->refreshExpiredLocks($email);
        if (! ($state['watch_verify_after_resend_lock'] ?? false)) {
            return;
        }

        $state['watch_verify_after_resend_lock'] = false;
        $state['security_locked_until'] = now()->timestamp + $this->wrongVerifyLockSeconds();
        $state['send_count'] = 0;
        $state['last_send_at'] = 0;
        $this->putState($email, $state);

        $retry = $this->wrongVerifyLockSeconds();
        $this->throwLocked($this->lockedStatus('security', $retry, $state));
    }

    public function clear(string $email): void
    {
        Cache::forget($this->cacheKey($this->normalize($email)));
    }

    private function normalize(string $email): string
    {
        return strtolower(trim($email));
    }

    private function isBypassed(string $email): bool
    {
        if (! config('otp.rate_limit_enabled', true)) {
            return true;
        }

        return $this->isDemoOrFixedEmail($email);
    }

    private function isDemoOrFixedEmail(string $email): bool
    {
        $fixed = array_map(
            static fn (string $item): string => strtolower(trim($item)),
            explode(',', (string) config('otp.fixed_emails', '')),
        );

        if (in_array($email, $fixed, true)) {
            return true;
        }

        $demoCodes = config('otp.demo_email_codes', []);
        if (is_array($demoCodes) && array_key_exists($email, $demoCodes)) {
            return true;
        }

        return false;
    }

    /** @return array<string, mixed> */
    private function bypassStatus(): array
    {
        return [
            'locked' => false,
            'lock_type' => null,
            'resend_cooldown_seconds' => 0,
            'resends_remaining' => $this->maxResends(),
            'resend_limit' => $this->maxResends(),
            'retry_after_seconds' => 0,
        ];
    }

    /** @return array<string, mixed> */
    private function lockedStatus(string $lockType, int $retryAfter, array $state): array
    {
        $sendCount = (int) ($state['send_count'] ?? 0);
        $resendsUsed = max(0, $sendCount - 1);

        return [
            'locked' => true,
            'lock_type' => $lockType,
            'resend_cooldown_seconds' => $retryAfter,
            'resends_remaining' => max(0, $this->maxResends() - $resendsUsed),
            'resend_limit' => $this->maxResends(),
            'retry_after_seconds' => $retryAfter,
        ];
    }

    /** @param array<string, mixed> $status */
    private function throwCooldown(array $status): never
    {
        $seconds = (int) ($status['retry_after_seconds'] ?? $this->resendCooldownSeconds());
        throw new HttpResponseException(response()->json([
            'message' => 'Please wait '.$this->formatDuration($seconds).' before requesting another code.',
            'code' => 'OTP_COOLDOWN',
            'retry_after_seconds' => $seconds,
            'rate_limit' => $status,
        ], 429));
    }

    /** @param array<string, mixed> $status */
    private function throwLocked(array $status): never
    {
        $seconds = (int) ($status['retry_after_seconds'] ?? 0);
        $lockType = (string) ($status['lock_type'] ?? 'resend_limit');
        $code = $lockType === 'security' ? 'OTP_VERIFY_LOCKED' : 'OTP_RESEND_LOCKED';
        $message = $lockType === 'security'
            ? 'Too many failed verification attempts. Try again in '.$this->formatDuration($seconds).'.'
            : 'Too many code requests. Please try again in '.intdiv($this->resendLockSeconds(), 60).' minutes.';

        throw new HttpResponseException(response()->json([
            'message' => $message,
            'code' => $code,
            'retry_after_seconds' => $seconds,
            'rate_limit' => $status,
        ], 429));
    }

    /** @return array<string, mixed> */
    private function refreshExpiredLocks(string $email): array
    {
        $state = $this->getState($email);
        $now = now()->timestamp;
        $resendUntil = (int) ($state['resend_locked_until'] ?? 0);

        if ($resendUntil > 0 && $resendUntil <= $now) {
            $state['resend_locked_until'] = null;
            $state['send_count'] = 0;
            $state['last_send_at'] = 0;
            $state['watch_verify_after_resend_lock'] = true;
            $this->putState($email, $state);
        }

        return $state;
    }

    /** @return array<string, mixed> */
    private function getState(string $email): array
    {
        $cached = Cache::get($this->cacheKey($email));

        return is_array($cached) ? $cached : [];
    }

    /** @param array<string, mixed> $state */
    private function putState(string $email, array $state): void
    {
        Cache::put($this->cacheKey($email), $state, now()->addSeconds($this->wrongVerifyLockSeconds() + 300));
    }

    private function cacheKey(string $email): string
    {
        return 'otp-rate:'.hash('sha256', $email);
    }

    private function resendCooldownSeconds(): int
    {
        return max(0, (int) config('otp.resend_cooldown_seconds', 60));
    }

    private function maxResends(): int
    {
        $max = (int) config('otp.max_resends', 3);

        return $max > 0 ? $max : 3;
    }

    private function resendLockSeconds(): int
    {
        $seconds = (int) config('otp.resend_lock_seconds', 900);

        return $seconds > 0 ? $seconds : 900;
    }

    private function wrongVerifyLockSeconds(): int
    {
        $seconds = (int) config('otp.wrong_verify_lock_seconds', 3600);

        return $seconds > 0 ? $seconds : 3600;
    }

    private function formatDuration(int $seconds): string
    {
        if ($seconds >= 3600) {
            $hours = intdiv($seconds, 3600);
            $minutes = intdiv($seconds % 3600, 60);

            return $minutes > 0 ? "{$hours}h {$minutes}m" : "{$hours} hour".($hours === 1 ? '' : 's');
        }

        if ($seconds >= 60) {
            $minutes = intdiv($seconds, 60);
            $remain = $seconds % 60;

            return $remain > 0 ? "{$minutes}m {$remain}s" : "{$minutes} minute".($minutes === 1 ? '' : 's');
        }

        return "{$seconds}s";
    }
}
