<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AuditEventLogger;
use App\Services\PlaidService;
use App\Services\PlaidWebhookVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class PlaidWebhookController extends Controller
{
    public function __invoke(Request $request, PlaidService $plaid, PlaidWebhookVerifier $verifier): JsonResponse
    {
        if ((bool) config('plaid.verify_webhooks', false)
            && ! $verifier->verify((string) $request->header('Plaid-Verification', ''), (string) $request->getContent())) {
            Log::warning('Plaid webhook rejected: verification failed');
            AuditEventLogger::webhook(
                'plaid',
                'invalid',
                'Plaid webhook signature was rejected',
                'warning',
                [
                    'endpoint' => '/v1/plaid/webhook',
                    'http_method' => 'POST',
                ],
            );

            return response()->json(['message' => 'Invalid webhook'], 400);
        }

        $payload = json_decode((string) $request->getContent(), true);
        if (! is_array($payload)) {
            return response()->json(['received' => true]);
        }

        Cache::put('plaid:webhook:last_received', now()->toIso8601String(), now()->addDays(30));

        try {
            $plaid->handleWebhook($payload);
        } catch (\Throwable $e) {
            Log::error('Plaid webhook handling failed', ['error' => $e->getMessage()]);
            Cache::put('plaid:webhook:last_failed', now()->toIso8601String(), now()->addDays(30));
            AuditEventLogger::webhook(
                'plaid',
                'failed',
                'Plaid webhook could not be processed',
                'error',
                [
                    'endpoint' => '/v1/plaid/webhook',
                    'http_method' => 'POST',
                    'error' => mb_substr($e->getMessage(), 0, 300),
                    'webhook_type' => $payload['webhook_type'] ?? null,
                    'webhook_code' => $payload['webhook_code'] ?? null,
                ],
            );

            return response()->json(['message' => 'Webhook handling failed'], 500);
        }

        Cache::put('plaid:webhook:last_processed', now()->toIso8601String(), now()->addDays(30));
        AuditEventLogger::webhook(
            'plaid',
            'processed',
            'Plaid webhook processed',
            'info',
            [
                'endpoint' => '/v1/plaid/webhook',
                'http_method' => 'POST',
                'webhook_type' => $payload['webhook_type'] ?? null,
                'webhook_code' => $payload['webhook_code'] ?? null,
            ],
        );

        return response()->json(['received' => true]);
    }
}
