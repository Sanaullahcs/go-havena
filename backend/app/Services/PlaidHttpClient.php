<?php

namespace App\Services;

use App\Exceptions\PlaidException;
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

        $response = Http::acceptJson()
            ->asJson()
            ->timeout(30)
            ->post($url, $body);

        return $this->decode($path, $response);
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
