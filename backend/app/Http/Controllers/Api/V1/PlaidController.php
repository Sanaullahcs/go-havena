<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\PlaidService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlaidController extends Controller
{
    public function __construct(
        private readonly PlaidService $plaid,
    ) {
    }

    /** POST /v1/plaid/link-token */
    public function createLinkToken(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! AdminRoleService::isCommunityAdminRole($user)) {
            abort(403, 'Community admin access required');
        }

        $payload = $this->plaid->createLinkToken($user);

        return response()->json([
            'success' => true,
            'data' => $payload,
        ]);
    }
}
