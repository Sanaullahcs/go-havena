<?php

namespace App\Services;

use App\Exceptions\PlaidException;
use App\Support\TlsCaBundle;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PlaidHttpClient
{
    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function post(string $path, array $payload = []): array
    {
        $url = rtrim($this->host(), '/').'/'.ltrim($path, '/');

        $body = array_merge([
            'client_id' => (string) config('plaid.client_id'),
            'secret' => (string) config('plaid.secret'),
        ], $payload);

        try {
            return $this->decode($path, $this->send($url, $body, true));
        } catch (PlaidException $e) {
            throw $e;
        } catch (\Throwable $first) {
            if (! $this->isTlsFailure($first)) {
                throw $first;
            }

            Log::warning('Plaid TLS failed, retrying', ['message' => $first->getMessage()]);

            try {
                return $this->decode($path, $this->send($url, $body, true));
            } catch (PlaidException $e) {
                throw $e;
            } catch (\Throwable $retry) {
                if (! $this->isTlsFailure($retry)) {
                    throw $retry;
                }

                throw $this->connectionFailed($retry);
            }
        }
    }

    /**
     * WAMP's curl often resets the TLS handshake (cURL error 35) on HTTP/2.
     * Force HTTP/1.1, then retry once without a custom CA file.
     *
     * @param  array<string, mixed>  $body
     */
    protected function send(string $url, array $body, bool $useCaBundle): Response
    {
        $curl = [
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        ];
        if (defined('CURL_SSLVERSION_TLSv1_2')) {
            $curl[CURLOPT_SSLVERSION] = CURL_SSLVERSION_TLSv1_2;
        }

        $options = ['curl' => $curl];
        $caBundle = $useCaBundle ? TlsCaBundle::path() : null;
        if ($caBundle) {
            $options['verify'] = $caBundle;
            $curl[CURLOPT_CAINFO] = $caBundle;
            $options['curl'] = $curl;
        }

        return Http::acceptJson()
            ->asJson()
            ->timeout(30)
            ->withOptions($options)
            ->post($url, $body);
    }

    protected function isTlsFailure(\Throwable $exception): bool
    {
        return (bool) preg_match('/cURL error (35|51|60)|SSL connect|SSL certificate|certificate verify|unable to get local issuer/i', $exception->getMessage());
    }

    protected function connectionFailed(\Throwable $exception): PlaidException
    {
        Log::warning('Plaid HTTPS connection failed', [
            'message' => $exception->getMessage(),
        ]);

        return new PlaidException(
            'Could not reach the bank network from this computer. Try the payment again.',
            'PLAID_CONNECT_FAILED',
            502,
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function decode(string $path, Response $response): array
    {
        $json = $response->json();
        $payload = is_array($json) ? $json : [];

        if ($response->successful()) {
            return $payload;
        }

        $errorCode = (string) ($payload['error_code'] ?? '');
        $errorType = (string) ($payload['error_type'] ?? '');
        $message = (string) ($payload['display_message'] ?? $payload['error_message'] ?? 'Plaid request failed.');

        Log::warning('Plaid HTTP request failed', [
            'path' => $path,
            'status' => $response->status(),
            'error_type' => $errorType !== '' ? $errorType : null,
            'error_code' => $errorCode !== '' ? $errorCode : null,
        ]);

        throw new PlaidException(
            $message !== '' ? $message : 'Plaid request failed.',
            $errorCode !== '' ? $errorCode : 'PLAID_HTTP_ERROR',
            $response->status() >= 400 && $response->status() < 500 ? 422 : 502,
            [
                'path' => $path,
                'error_type' => $errorType,
                'error_code' => $errorCode,
                'http_status' => $response->status(),
            ],
        );
    }

    protected function host(): string
    {
        return match ((string) config('plaid.environment', 'sandbox')) {
            'production' => 'https://production.plaid.com',
            'development' => 'https://development.plaid.com',
            default => 'https://sandbox.plaid.com',
        };
    }
}
