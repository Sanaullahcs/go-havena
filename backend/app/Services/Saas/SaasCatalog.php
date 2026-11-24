<?php

namespace App\Services\Saas;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SaasCatalog
{
    public function __construct(private readonly PricingCalculator $calculator) {}

    /** @return array<string, mixed> */
    public function publicCatalog(?string $currency = null): array
    {
        if (! Schema::hasTable('saas_price_books')) {
            return ['plans' => [], 'currencies' => [], 'annual_discount_bps' => 0];
        }

        $currency = strtoupper($currency ?: 'USD');
        $plans = DB::table('subscription_plans')
            ->whereIn('slug', ['essential', 'professional', 'premium', 'custom'])
            ->orderBy('sort_order')
            ->get();

        $books = DB::table('saas_price_books')
            ->where('status', 'published')
            ->where('currency', $currency)
            ->orderByDesc('version')
            ->get();

        $tiersByBook = Schema::hasTable('saas_price_tiers')
            ? DB::table('saas_price_tiers')
                ->whereIn('price_book_id', $books->pluck('id'))
                ->orderBy('sort_order')
                ->get()
                ->groupBy('price_book_id')
            : collect();

        $features = Schema::hasTable('saas_plan_entitlements')
            ? DB::table('saas_plan_entitlements')->orderBy('sort_order')->get()->groupBy('plan_slug')
            : collect();

        $out = [];
        foreach ($plans as $plan) {
            $planBooks = $books->where('plan_slug', $plan->slug)->values();
            $out[] = [
                'slug' => $plan->slug,
                'name' => $plan->name,
                'description' => $plan->description,
                'recommended' => (bool) $plan->is_recommended,
                'custom' => $plan->slug === 'custom',
                'features' => ($features[$plan->slug] ?? collect())->map(fn ($row) => [
                    'key' => $row->feature_key,
                    'label' => $row->label,
                    'included' => (bool) $row->included,
                    'group' => $row->group_key,
                ])->values(),
                'price_books' => $planBooks->map(fn ($book) => [
                    'id' => (int) $book->id,
                    'billing_model' => $book->billing_model,
                    'currency' => $book->currency,
                    'minimum_monthly_cents' => (int) $book->minimum_monthly_cents,
                    'annual_discount_bps' => (int) $book->annual_discount_bps,
                ])->values(),
            ];
        }

        $rateCard = [];
        foreach ($books as $book) {
            if (isset($rateCard[$book->billing_model][$book->plan_slug])) {
                continue;
            }
            $rateCard[$book->billing_model][$book->plan_slug] = [
                'minimum_monthly_cents' => (int) $book->minimum_monthly_cents,
                'annual_discount_bps' => (int) $book->annual_discount_bps,
                'currency' => $book->currency,
                'tiers' => ($tiersByBook[$book->id] ?? collect())->map(fn ($row) => [
                    'min' => (int) $row->min_quantity,
                    'max' => $row->max_quantity !== null ? (int) $row->max_quantity : null,
                    'unit_cents' => $row->unit_amount_cents !== null ? (int) $row->unit_amount_cents : null,
                    'fixed_cents' => $row->fixed_amount_cents !== null ? (int) $row->fixed_amount_cents : null,
                ])->values(),
            ];
        }

        return [
            'plans' => $out,
            'currencies' => DB::table('saas_price_books')->where('status', 'published')->distinct()->orderBy('currency')->pluck('currency')->values(),
            'annual_discount_bps' => (int) ($books->max('annual_discount_bps') ?? 0),
            'currency' => $currency,
            'rate_card' => $rateCard,
        ];
    }

    /** @return array<string, mixed> */
    public function preview(string $planSlug, string $model, string $interval, int $residents, string $currency): array
    {
        if ($planSlug === 'custom') {
            return [
                'available' => false,
                'quote_required' => true,
                'reason' => 'Custom plans are quoted by Havena.',
                'plan' => 'custom',
                'residents' => $residents,
                'billing_model' => $model,
                'interval' => $interval,
                'currency' => strtoupper($currency),
                'amount_due_cents' => null,
            ];
        }

        $book = DB::table('saas_price_books')
            ->where('plan_slug', $planSlug)
            ->where('billing_model', $model)
            ->where('currency', strtoupper($currency))
            ->where('status', 'published')
            ->orderByDesc('version')
            ->first();

        if (! $book) {
            return [
                'available' => false,
                'quote_required' => true,
                'reason' => 'Pricing for this currency is not published.',
                'plan' => $planSlug,
                'residents' => $residents,
                'billing_model' => $model,
                'interval' => $interval,
                'currency' => strtoupper($currency),
                'amount_due_cents' => null,
            ];
        }

        $tiers = DB::table('saas_price_tiers')
            ->where('price_book_id', $book->id)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($row) => [
                'min' => (int) $row->min_quantity,
                'max' => $row->max_quantity !== null ? (int) $row->max_quantity : null,
                'unit_cents' => $row->unit_amount_cents !== null ? (int) $row->unit_amount_cents : null,
                'fixed_cents' => $row->fixed_amount_cents !== null ? (int) $row->fixed_amount_cents : null,
            ])
            ->all();

        $quote = $this->calculator->quote([
            'residents' => $residents,
            'billing_model' => $model,
            'interval' => $interval,
            'currency' => $book->currency,
            'minimum_monthly_cents' => (int) $book->minimum_monthly_cents,
            'annual_discount_bps' => (int) $book->annual_discount_bps,
            'tiers' => $tiers,
        ]);
        $quote['plan'] = $planSlug;
        $quote['price_book_id'] = (int) $book->id;
        $quote['price_version'] = (int) $book->version;

        return $quote;
    }
}
