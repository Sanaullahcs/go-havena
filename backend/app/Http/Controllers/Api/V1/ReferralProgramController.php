<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ReferralAttribution;
use App\Models\ReferralReward;
use App\Services\ReferralAdminService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralProgramController extends Controller
{
    public function __construct(private readonly ReferralAdminService $admin)
    {
    }

    /** GET /v1/admin/referral-program/settings */
    public function settings(): JsonResponse
    {
        return response()->json(['data' => $this->admin->settingsPayload()]);
    }

    /** PUT /v1/admin/referral-program/settings */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reward_type' => ['required', 'in:percent,fixed'],
            'reward_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'reward_fixed_cents' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'is_active' => ['required', 'boolean'],
        ]);

        if (($validated['reward_type'] ?? 'percent') === 'percent' && ! isset($validated['reward_percent'])) {
            return response()->json([
                'message' => 'Reward percent is required for percentage rewards.',
                'errors' => ['reward_percent' => ['Reward percent is required.']],
            ], 422);
        }

        if (($validated['reward_type'] ?? 'percent') === 'fixed' && empty($validated['reward_fixed_cents'])) {
            return response()->json([
                'message' => 'Fixed reward amount is required for fixed rewards.',
                'errors' => ['reward_fixed_cents' => ['Fixed reward amount is required.']],
            ], 422);
        }

        $settings = $this->admin->updateSettings([
            'reward_type' => $validated['reward_type'],
            'reward_percent' => isset($validated['reward_percent']) ? (float) $validated['reward_percent'] : null,
            'reward_fixed_cents' => isset($validated['reward_fixed_cents']) ? (int) $validated['reward_fixed_cents'] : null,
            'is_active' => (bool) $validated['is_active'],
        ], $request->user());

        return response()->json([
            'data' => $this->admin->serializeSettings($settings),
            'message' => 'Referral program settings updated.',
        ]);
    }

    /** GET /v1/admin/referral-program/attributions */
    public function attributions(Request $request): JsonResponse
    {
        $result = $this->admin->listAttributions($request->all());

        return response()->json($result);
    }

    /** POST /v1/admin/referral-program/attributions/{id}/review */
    public function review(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
        ]);

        $attribution = ReferralAttribution::query()->findOrFail($id);
        $updated = $this->admin->reviewAttribution($attribution, $validated['decision'], $request->user());

        return response()->json([
            'data' => app(\App\Services\ReferralService::class)->transformAttribution(
                $updated->load(['referrer', 'referee', 'refereeCommunity', 'reward', 'referralCode']),
            ),
            'message' => $validated['decision'] === 'approve'
                ? 'Referral approved for payout.'
                : 'Referral rejected.',
        ]);
    }

    /** POST /v1/admin/referral-program/rewards/{id}/retry */
    public function retryReward(int $id): JsonResponse
    {
        $reward = ReferralReward::query()->findOrFail($id);
        $reward = $this->admin->retryReward($reward);

        return response()->json([
            'data' => [
                'id' => $reward->id,
                'status' => $reward->status,
                'failure_reason' => $reward->failure_reason,
                'credited_at' => $reward->credited_at?->toIso8601String(),
            ],
            'message' => $reward->status === ReferralReward::STATUS_CREDITED
                ? 'Referral credit applied.'
                : 'Referral credit could not be applied.',
        ]);
    }
}
