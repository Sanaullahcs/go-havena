<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Verifies the `Plaid-Verification` JWT on incoming webhooks:
 * ES256 only, key from /webhook_verification_key/get, iat within the allowed age,
 * and SHA-256 of the raw body equal to `request_body_sha256`.
 */
class PlaidWebhookVerifier
{
    /** DER prefix of a P-256 SubjectPublicKeyInfo, followed by the uncompressed point 04||X||Y. */
    private const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

    public function __construct(
        private readonly PlaidHttpClient $http,
    ) {
    }

    public function verify(string $jwt, string $rawBody): bool
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return $this->reject('malformed_jwt');
        }

        $header = json_decode($this->base64UrlDecode($parts[0]) ?? '', true);
        $claims = json_decode($this->base64UrlDecode($parts[1]) ?? '', true);
        $signature = $this->base64UrlDecode($parts[2]);

        if (! is_array($header) || ($header['alg'] ?? null) !== 'ES256' || ! is_string($header['kid'] ?? null) || $header['kid'] === '') {
            return $this->reject('bad_header');
        }
        if (! is_array($claims) || $signature === null || strlen($signature) !== 64) {
            return $this->reject('bad_claims_or_signature');
        }

        $pem = $this->publicKeyPem($header['kid']);
        if ($pem === null) {
            return $this->reject('key_unavailable');
        }

        $verified = openssl_verify($parts[0].'.'.$parts[1], $this->rawSignatureToDer($signature), $pem, OPENSSL_ALGO_SHA256);
        if ($verified !== 1) {
            return $this->reject('signature');
        }

        $iat = $claims['iat'] ?? null;
        $maxAge = (int) config('plaid.webhook_max_age_seconds', 300);
        if (! is_numeric($iat) || (int) $iat < time() - $maxAge || (int) $iat > time() + $maxAge) {
            return $this->reject('stale');
        }

        $expected = (string) ($claims['request_body_sha256'] ?? '');
        if ($expected === '' || ! hash_equals($expected, hash('sha256', $rawBody))) {
            return $this->reject('body_hash');
        }

        return true;
    }

    protected function publicKeyPem(string $kid): ?string
    {
        $cacheKey = 'plaid:webhook-key:'.sha1($kid);
        $jwk = Cache::get($cacheKey);

        if (! is_array($jwk)) {
            try {
                $payload = $this->http->post('/webhook_verification_key/get', ['key_id' => $kid]);
            } catch (\Throwable $e) {
                Log::warning('Plaid webhook key lookup failed', ['error' => $e->getMessage()]);

                return null;
            }

            $jwk = $payload['key'] ?? null;
            if (! is_array($jwk)) {
                return null;
            }
            Cache::put($cacheKey, $jwk, now()->addHours(12));
        }

        if (($jwk['expired_at'] ?? null) !== null && (int) $jwk['expired_at'] < time()) {
            return null;
        }
        if (($jwk['kty'] ?? 'EC') !== 'EC' || ($jwk['crv'] ?? 'P-256') !== 'P-256') {
            return null;
        }

        $x = $this->base64UrlDecode((string) ($jwk['x'] ?? ''));
        $y = $this->base64UrlDecode((string) ($jwk['y'] ?? ''));
        if ($x === null || $y === null || strlen($x) !== 32 || strlen($y) !== 32) {
            return null;
        }

        $der = hex2bin(self::P256_SPKI_PREFIX)."\x04".$x.$y;

        return "-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($der), 64, "\n")."-----END PUBLIC KEY-----\n";
    }

    protected function rawSignatureToDer(string $signature): string
    {
        $encode = static function (string $int): string {
            $int = ltrim($int, "\x00");
            if ($int === '' || (ord($int[0]) & 0x80) !== 0) {
                $int = "\x00".$int;
            }

            return "\x02".chr(strlen($int)).$int;
        };

        $sequence = $encode(substr($signature, 0, 32)).$encode(substr($signature, 32, 32));

        return "\x30".chr(strlen($sequence)).$sequence;
    }

    protected function base64UrlDecode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/').str_repeat('=', (4 - strlen($value) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }

    private function reject(string $reason): bool
    {
        Log::warning('Plaid webhook verification failed', ['reason' => $reason]);

        return false;
    }
}
