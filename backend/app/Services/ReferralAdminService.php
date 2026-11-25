<?php

namespace App\Services;

use App\Models\ReferralAttribution;
use App\Models\ReferralProgramSetting;
use App\Models\ReferralReward;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class ReferralAdminService
{
    public function __construct(private readonly ReferralService $referrals)
    {
    }

    /** @return array<string, mixed> */
    public function settingsPayload(): array
    {
        $settings = ReferralProgramSetting::current();

        return $this->serializeSettings($settings);
    }

    /**
     * @param  array{
     *   reward_type: string,
     *   reward_percent?: float|null,
     *   reward_fixed_cents?: int|null,
     *   is_active: bool
     * }  $input
     */
    public function updateSettings(array $input, ?User $actor = null): ReferralProgramSetting
    {
        $rewardType = (string) ($input['reward_type'] ?? ReferralProgramSetting::REWARD_TYPE_PERCENT);
        if (! in_array($rewardType, [ReferralProgramSetting::REWARD_TYPE_PERCENT, ReferralProgramSetting::REWARD_TYPE_FIXED], true)) {
            throw ValidationException::withMessages([
                'reward_type' => ['Reward type must be percent or fixed.'],
            ]);
        }

        $settings = ReferralProgramSetting::current();
        $payload = [
            'reward_type' => $rewardType,
            'is_active' => (bool) ($input['is_active'] ?? true),
            'updated_by' => $actor?->id,
        ];

        if ($rewardType === ReferralProgramSetting::REWARD_TYPE_FIXED) {
            $fixedCents = max(1, (int) ($input['reward_fixed_cents'] ?? 0));
            $payload['reward_fixed_cents'] = $fixedCents;
            $payload['reward_percent'] = 0;
        } else {
            $payload['reward_percent'] = max(0, min(100, (float) ($input['reward_percent'] ?? 0)));
            $payload['reward_fixed_cents'] = null;
        }

        $settings->update($payload);

        return $settings->fresh();
    }

    /** @return array<string, mixed> */
    public function serializeSettings(ReferralProgramSetting $settings): array
    {
        return [
            'reward_type' => (string) ($settings->reward_type ?? ReferralProgramSetting::REWARD_TYPE_PERCENT),
            'reward_percent' => (float) $settings->reward_percent,
            'reward_fixed_cents' => $settings->reward_fixed_cents !== null ? (int) $settings->reward_fixed_cents : null,
            'is_active' => (bool) $settings->is_active,
            'updated_at' => $settings->updated_at?->toIso8601String(),
        ];
    }

    /** @return array{data: list<array<string, mixed>>, meta: array<string, mixed>} */
    public function listAttributions(array $filters = []): array
    {
        $query = ReferralAttribution::query()
            ->with(['referrer', 'referee', 'refereeCommunity', 'reward', 'referralCode'])
            ->orderByDesc('id');

        if ($status = ($filters['status'] ?? null)) {
            $query->where('status', $status);
        }

        if ($review = ($filters['fraud_review_status'] ?? null)) {
            $query->where('fraud_review_status', $review);
        }

        if ($q = trim((string) ($filters['q'] ?? ''))) {
            $query->where(function ($builder) use ($q) {
                $builder->whereHas('referralCode', fn ($code) => $code->where('code', 'like', '%'.$q.'%'))
                    ->orWhereHas('referrer', fn ($user) => $user->where('name', 'like', '%'.$q.'%')->orWhere('phone', 'like', '%'.$q.'%'))
                    ->orWhereHas('referee', fn ($user) => $user->where('name', 'like', '%'.$q.'%')->orWhere('phone', 'like', '%'.$q.'%'))
                    ->orWhereHas('refereeCommunity', fn ($community) => $community->where('name', 'like', '%'.$q.'%'));
            });
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $query->paginate((int) ($filters['per_page'] ?? 20));

        return [
            'data' => collect($paginator->items())
                ->map(fn (ReferralAttribution $row) => $this->referrals->transformAttribution($row))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'overview' => $this->overviewStats(),
            ],
        ];
    }

    /** @return array<string, int|float> */
    public function overviewStats(): array
    {
        return [
            'total_attributions' => ReferralAttribution::query()->count(),
            'pending_qualification' => ReferralAttribution::query()->whereIn('status', [
                ReferralAttribution::STATUS_LOCKED,
                ReferralAttribution::STATUS_PENDING_QUALIFICATION,
            ])->count(),
            'qualified' => ReferralAttribution::query()->where('status', ReferralAttribution::STATUS_QUALIFIED)->count(),
            'disqualified' => ReferralAttribution::query()->where('status', ReferralAttribution::STATUS_DISQUALIFIED)->count(),
            'flagged_for_review' => ReferralAttribution::query()->where('fraud_review_status', ReferralAttribution::FRAUD_FLAGGED)->count(),
            'total_credit_earned_cents' => (int) ReferralReward::query()->where('status', ReferralReward::STATUS_CREDITED)->sum('reward_amount_cents'),
        ];
    }

    public function reviewAttribution(ReferralAttribution $attribution, string $decision, ?User $actor = null): ReferralAttribution
    {
        if ($decision === 'approve') {
            $attribution->update(['fraud_review_status' => ReferralAttribution::FRAUD_APPROVED]);

            $reward = $attribution->reward;
            if ($reward && $reward->status === ReferralReward::STATUS_PENDING && filled($reward->referrer_stripe_customer_id)) {
                $this->referrals->creditReferrer($reward, $attribution);
            }

            return $attribution->fresh(['referrer', 'referee', 'refereeCommunity', 'reward', 'referralCode']);
        }

        $attribution->update([
            'fraud_review_status' => ReferralAttribution::FRAUD_REJECTED,
            'status' => ReferralAttribution::STATUS_DISQUALIFIED,
            'disqualified_at' => now(),
            'disqualify_reason' => 'Rejected during fraud review.',
        ]);

        return $attribution->fresh(['referrer', 'referee', 'refereeCommunity', 'reward', 'referralCode']);
    }

    public function retryReward(ReferralReward $reward): ReferralReward
    {
        if ($reward->status !== ReferralReward::STATUS_FAILED && $reward->status !== ReferralReward::STATUS_PENDING) {
            return $reward;
        }

        if (! filled($reward->referrer_stripe_customer_id)) {
            $customerId = app(ReferralService::class)->resolveReferrerStripeCustomerId($reward->referrer_user_id);
            if ($customerId !== '') {
                $reward->update(['referrer_stripe_customer_id' => $customerId]);
            }
        }

        return $this->referrals->creditReferrer($reward->fresh(['attribution']));
    }
}
