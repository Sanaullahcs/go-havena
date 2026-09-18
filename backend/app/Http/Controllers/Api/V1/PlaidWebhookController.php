<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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

            return response()->json(['message' => 'Webhook handling failed'], 500);
        }

        return response()->json(['received' => true]);
    }

    private function verified(Request $request): bool
    {
        $jwt = (string) $request->header('Plaid-Verification', '');

        return $jwt !== '';
    }
}
