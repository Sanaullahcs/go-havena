<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function __construct(private readonly ReferralService $referrals)
    {
    }

    /** GET /v1/admin/referrals/me */
    public function me(Request $request): JsonResponse
    {
        $this->referrals->reconcilePendingReferralsForReferrer((int) $request->user()->id);

        return response()->json([
            'data' => $this->referrals->dashboardForUser($request->user()),
        ]);
    }
}
