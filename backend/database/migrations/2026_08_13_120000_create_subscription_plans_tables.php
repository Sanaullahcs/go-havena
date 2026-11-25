<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('name', 80);
            $table->string('description', 500)->nullable();
            $table->unsignedInteger('seat_limit');
            $table->unsignedInteger('price_monthly_cents')->default(0);
            $table->unsignedInteger('price_yearly_cents')->default(0);
            $table->unsignedSmallInteger('trial_period_days')->default(30);
            $table->string('stripe_product_id')->nullable();
            $table->string('stripe_price_monthly')->nullable();
            $table->string('stripe_price_yearly')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_recommended')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('subscription_plan_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();
            $table->string('interval', 10); // month|year
            $table->unsignedInteger('amount_cents');
            $table->string('stripe_price_id')->nullable();
            $table->boolean('is_current')->default(true);
            $table->timestamps();

            $table->index(['subscription_plan_id', 'interval', 'is_current'], 'plan_price_current_idx');
            $table->index('stripe_price_id');
        });

        $trialDays = (int) config('billing.trial_period_days', 30);
        $now = now();

        foreach (config('billing.plans', []) as $slug => $plan) {
            $planId = DB::table('subscription_plans')->insertGetId([
                'slug' => $slug,
                'name' => $plan['name'] ?? ucfirst((string) $slug),
                'description' => $plan['description'] ?? null,
                'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                'price_monthly_cents' => (int) ($plan['price_monthly_cents'] ?? 0),
                'price_yearly_cents' => (int) ($plan['price_yearly_cents'] ?? 0),
                'trial_period_days' => $trialDays,
                'stripe_product_id' => null,
                'stripe_price_monthly' => filled($plan['stripe_price_monthly'] ?? null) ? $plan['stripe_price_monthly'] : null,
                'stripe_price_yearly' => filled($plan['stripe_price_yearly'] ?? null) ? $plan['stripe_price_yearly'] : null,
                'is_active' => true,
                'is_recommended' => (bool) ($plan['recommended'] ?? false),
                'sort_order' => (int) ($plan['sort'] ?? 0),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            if (filled($plan['stripe_price_monthly'] ?? null)) {
                DB::table('subscription_plan_prices')->insert([
                    'subscription_plan_id' => $planId,
                    'interval' => 'month',
                    'amount_cents' => (int) ($plan['price_monthly_cents'] ?? 0),
                    'stripe_price_id' => $plan['stripe_price_monthly'],
                    'is_current' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            if (filled($plan['stripe_price_yearly'] ?? null)) {
                DB::table('subscription_plan_prices')->insert([
                    'subscription_plan_id' => $planId,
                    'interval' => 'year',
                    'amount_cents' => (int) ($plan['price_yearly_cents'] ?? 0),
                    'stripe_price_id' => $plan['stripe_price_yearly'],
                    'is_current' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plan_prices');
        Schema::dropIfExists('subscription_plans');
    }
};
