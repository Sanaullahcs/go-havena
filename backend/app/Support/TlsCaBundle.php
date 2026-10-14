<?php

namespace App\Support;

/**
 * Point PHP cURL/OpenSSL at a CA bundle.
 * WAMP ships with empty curl.cainfo, so Plaid (and any HTTPS call) fails with
 * "SSL peer certificate or SSH remote key was not OK".
 */
class TlsCaBundle
{
    public static function apply(): ?string
    {
        $path = self::path();
        if ($path === null) {
            return null;
        }

        @ini_set('curl.cainfo', $path);
        @ini_set('openssl.cafile', $path);

        return $path;
    }

    /**
     * Guzzle does not pick up curl.cainfo on WAMP, so HTTPS clients must
     * receive the bundle as a request option.
     *
     * @return array<string, mixed>
     */
    public static function httpOptions(): array
    {
        $path = self::path();
        if ($path === null) {
            return [];
        }

        $curl = [
            CURLOPT_CAINFO => $path,
        ];
        if (defined('CURL_HTTP_VERSION_1_1')) {
            $curl[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_1_1;
        }

        return [
            'verify' => $path,
            'curl' => $curl,
        ];
    }

    public static function path(): ?string
    {
        foreach (self::candidates() as $candidate) {
            if (is_string($candidate) && $candidate !== '' && is_file($candidate) && is_readable($candidate)) {
                return $candidate;
            }
        }

        $downloaded = self::ensureStoredBundle();

        return $downloaded && is_file($downloaded) ? $downloaded : null;
    }

    /**
     * @return list<string>
     */
    private static function candidates(): array
    {
        $stored = self::storedPath();

        return array_values(array_filter([
            config('plaid.ca_bundle'),
            env('PLAID_CA_BUNDLE'),
            env('CURL_CA_BUNDLE'),
            getenv('SSL_CERT_FILE') ?: null,
            getenv('CURL_CA_BUNDLE') ?: null,
            ini_get('curl.cainfo') ?: null,
            ini_get('openssl.cafile') ?: null,
            $stored,
            'D:\\wamp64-330\\bin\\php\\extras\\ssl\\cacert.pem',
            'C:\\wamp64\\bin\\php\\extras\\ssl\\cacert.pem',
            '/etc/ssl/certs/ca-certificates.crt',
            '/etc/pki/tls/certs/ca-bundle.crt',
        ], static fn ($path) => is_string($path) && trim($path) !== ''));
    }

    private static function storedPath(): string
    {
        return storage_path('app/certs/cacert.pem');
    }

    private static function ensureStoredBundle(): ?string
    {
        $path = self::storedPath();
        if (is_file($path) && filesize($path) > 1000) {
            return $path;
        }

        $dir = dirname($path);
        if (! is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $pem = self::downloadMozillaBundle();
        if ($pem === null || ! str_contains($pem, 'BEGIN CERTIFICATE')) {
            return is_file($path) ? $path : null;
        }

        @file_put_contents($path, $pem);

        return is_file($path) ? $path : null;
    }

    private static function downloadMozillaBundle(): ?string
    {
        $url = 'https://curl.se/ca/cacert.pem';

        if (function_exists('curl_init')) {
            $handle = curl_init($url);
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => 20,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);
            $body = curl_exec($handle);
            $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
            curl_close($handle);

            if (is_string($body) && $status === 200) {
                return $body;
            }
        }

        $context = stream_context_create([
            'http' => ['timeout' => 20],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
        ]);
        $body = @file_get_contents($url, false, $context);

        return is_string($body) ? $body : null;
    }
}
