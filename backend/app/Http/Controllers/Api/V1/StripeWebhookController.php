<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\BillingException;
use App\Http\Controllers\Controller;
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

            return response()->json(['message' => 'Invalid signature'], 400);
        } catch (BillingException $e) {
            return $e->render();
        } catch (\Throwable $e) {
            Log::error('Stripe webhook failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Webhook handling failed'], 500);
        }

        return response()->json(['received' => true]);
    }
}
