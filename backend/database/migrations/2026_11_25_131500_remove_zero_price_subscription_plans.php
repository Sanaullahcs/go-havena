<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('subscription_plans')) {
            return;
        }

        $ids = DB::table('subscription_plans')
            ->where('price_monthly_cents', 0)
            ->where('price_yearly_cents', 0)
            ->whereIn('slug', ['essential', 'professional', 'premium', 'custom'])
            ->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        $inUse = Schema::hasTable('community_subscriptions')
            && DB::table('community_subscriptions')->whereIn('plan_slug', ['essential', 'professional', 'premium', 'custom'])->exists();

        if ($inUse) {
            DB::table('subscription_plans')->whereIn('id', $ids)->update([
                'is_active' => false,
                'is_recommended' => false,
                'updated_at' => now(),
            ]);

            return;
        }

        if (Schema::hasTable('subscription_plan_prices')) {
            DB::table('subscription_plan_prices')->whereIn('subscription_plan_id', $ids)->delete();
        }

        DB::table('subscription_plans')->whereIn('id', $ids)->delete();
    }

    public function down(): void
    {
        // Catalog rows are recreated by the SaaS pricing migration on a fresh install.
    }
};
