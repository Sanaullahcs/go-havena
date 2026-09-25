<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\BillingException;
use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\CommunityBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use UnexpectedValueException;

class StripeWebhookController extends Controller
{
    public function __invoke(Request $request, CommunityBillingService $billing): JsonResponse
    {
        $payload = $request->getContent();
        $signature = $request->header('Stripe-Signature');

        try {
            $billing->handleWebhook($payload, $signature);
        } catch (UnexpectedValueException|\Stripe\Exception\SignatureVerificationException $e) {
            Log::warning('Stripe webhook signature failed', ['error' => $e->getMessage()]);
            ActivityLogService::system(
                'stripe_webhook_invalid',
                'Stripe webhook signature was rejected',
                'warning',
                'Billing',
                null,
                [
                    'module' => 'Billing',
                    'status' => 'invalid',
                    'endpoint' => '/v1/billing/webhook',
                    'http_method' => 'POST',
                    'result' => 'rejected',
                    'error' => $e->getMessage(),
                ],
            );

            return response()->json(['message' => 'Invalid signature'], 400);
        } catch (BillingException $e) {
            ActivityLogService::system(
                'stripe_webhook_failed',
                'Stripe webhook could not be processed',
                'error',
                'Billing',
                null,
                [
                    'module' => 'Billing',
                    'status' => 'failed',
                    'endpoint' => '/v1/billing/webhook',
                    'http_method' => 'POST',
                    'result' => 'failed',
                    'error' => $e->getMessage(),
                ],
            );

            return $e->render();
        } catch (\Throwable $e) {
            Log::error('Stripe webhook failed', ['error' => $e->getMessage()]);
            ActivityLogService::system(
                'stripe_webhook_failed',
                'Stripe webhook handling failed',
                'error',
                'Billing',
                null,
                [
                    'module' => 'Billing',
                    'status' => 'failed',
                    'endpoint' => '/v1/billing/webhook',
                    'http_method' => 'POST',
                    'result' => 'failed',
                    'error' => $e->getMessage(),
                ],
            );

            return response()->json(['message' => 'Webhook handling failed'], 500);
        }

        ActivityLogService::system(
            'stripe_webhook_received',
            'Stripe webhook processed',
            'info',
            'Billing',
            null,
            [
                'module' => 'Billing',
                'status' => 'processed',
                'endpoint' => '/v1/billing/webhook',
                'http_method' => 'POST',
                'result' => 'ok',
            ],
        );

        return response()->json(['received' => true]);
    }
}
