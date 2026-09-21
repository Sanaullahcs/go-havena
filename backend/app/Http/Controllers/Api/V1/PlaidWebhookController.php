<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AuditEventLogger;
use App\Services\PlaidService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PlaidWebhookController extends Controller
{
    public function __invoke(Request $request, PlaidService $plaid): JsonResponse
    {
        if ((bool) config('plaid.verify_webhooks', false) && ! $this->verified($request)) {
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

        $payload = $request->all();
        if (! is_array($payload)) {
            return response()->json(['received' => true]);
        }

        try {
            $plaid->handleWebhook($payload);
        } catch (\Throwable $e) {
            Log::error('Plaid webhook handling failed', ['error' => $e->getMessage()]);
            AuditEventLogger::webhook(
                'plaid',
                'failed',
                'Plaid webhook could not be processed',
                'error',
                [
                    'endpoint' => '/v1/plaid/webhook',
                    'http_method' => 'POST',
                    'error' => $e->getMessage(),
                    'webhook_type' => $payload['webhook_type'] ?? null,
                    'webhook_code' => $payload['webhook_code'] ?? null,
                ],
            );

            return response()->json(['message' => 'Webhook handling failed'], 500);
        }

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

    private function verified(Request $request): bool
    {
        $jwt = (string) $request->header('Plaid-Verification', '');

        return $jwt !== '';
    }
}
