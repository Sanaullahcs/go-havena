<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Saas\SaasCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaasPricingController extends Controller
{
    public function catalog(Request $request, SaasCatalog $catalog): JsonResponse
    {
        $currency = strtoupper((string) $request->query('currency', 'USD'));

        return response()->json($catalog->publicCatalog($currency));
    }

    public function preview(Request $request, SaasCatalog $catalog): JsonResponse
    {
        $data = $request->validate([
            'plan' => 'required|string|max:50',
            'billing_model' => 'required|in:per_resident,per_community',
            'interval' => 'required|in:month,year',
            'residents' => 'required|integer|min:1|max:10000000',
            'currency' => 'nullable|string|size:3',
        ]);

        try {
            $quote = $catalog->preview(
                $data['plan'],
                $data['billing_model'],
                $data['interval'],
                (int) $data['residents'],
                $data['currency'] ?? 'USD',
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($quote);
    }

    public function previewBundle(Request $request, SaasCatalog $catalog): JsonResponse
    {
        $data = $request->validate([
            'billing_model' => 'required|in:per_resident,per_community',
            'interval' => 'required|in:month,year',
            'residents' => 'required|integer|min:1|max:10000000',
            'currency' => 'nullable|string|size:3',
            'plans' => 'nullable|array|max:8',
            'plans.*' => 'string|max:50',
        ]);

        $slugs = $data['plans'] ?? ['essential', 'professional', 'premium', 'custom'];
        $quotes = [];
        foreach ($slugs as $slug) {
            try {
                $quotes[$slug] = $catalog->preview(
                    $slug,
                    $data['billing_model'],
                    $data['interval'],
                    (int) $data['residents'],
                    $data['currency'] ?? 'USD',
                );
            } catch (\InvalidArgumentException $e) {
                $quotes[$slug] = [
                    'available' => false,
                    'quote_required' => true,
                    'plan' => $slug,
                    'residents' => (int) $data['residents'],
                    'billing_model' => $data['billing_model'],
                    'message' => $e->getMessage(),
                ];
            }
        }

        return response()->json(['quotes' => $quotes]);
    }

    public function inquire(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_name' => 'required|string|max:160',
            'contact_name' => 'required|string|max:120',
            'email' => 'required|email|max:160',
            'phone' => 'nullable|string|max:40',
            'country' => 'nullable|string|max:80',
            'communities' => 'nullable|integer|min:1|max:100000',
            'community_name' => 'nullable|string|max:160',
            'residents' => 'nullable|integer|min:1|max:10000000',
            'units' => 'nullable|integer|min:0|max:10000000',
            'billing_model' => 'nullable|in:per_resident,per_community',
            'interval' => 'nullable|in:month,year',
            'modules' => 'nullable|array',
            'modules.*' => 'string|max:64',
            'integrations' => 'nullable|string|max:1000',
            'launch_date' => 'nullable|date',
            'notes' => 'nullable|string|max:4000',
        ]);

        $id = DB::table('saas_custom_inquiries')->insertGetId([
            'status' => 'new',
            'organization_name' => $data['organization_name'],
            'contact_name' => $data['contact_name'],
            'email' => strtolower($data['email']),
            'phone' => $data['phone'] ?? null,
            'country' => $data['country'] ?? null,
            'communities' => (int) ($data['communities'] ?? 1),
            'residents' => $data['residents'] ?? null,
            'billing_model' => $data['billing_model'] ?? null,
            'interval' => $data['interval'] ?? null,
            'payload' => json_encode($data),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'id' => $id,
            'status' => 'new',
            'message' => 'Your request is with Havena. We will reply with a written quote.',
        ], 201);
    }
}
