<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_coupons', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 80);
            $table->text('description')->nullable();
            $table->string('discount_type', 20);
            $table->unsignedTinyInteger('percent_off')->nullable();
            $table->unsignedInteger('amount_off_cents')->nullable();
            $table->string('currency', 3)->default('usd');
            $table->string('discount_duration', 20);
            $table->unsignedSmallInteger('discount_months')->nullable();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->unsignedInteger('max_redemptions')->nullable();
            $table->unsignedInteger('redemption_count')->default(0);
            $table->json('applicable_plan_slugs')->nullable();
            $table->string('stripe_coupon_id')->nullable();
            $table->string('stripe_promotion_code_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('superseded_by_id')->nullable()->constrained('subscription_coupons')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'valid_from', 'valid_until']);
        });

        Schema::create('subscription_coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_coupon_id')->constrained('subscription_coupons')->cascadeOnDelete();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->unsignedBigInteger('community_subscription_id')->nullable();
            $table->string('code', 40);
            $table->string('discount_type', 20);
            $table->unsignedTinyInteger('percent_off')->nullable();
            $table->unsignedInteger('amount_off_cents')->nullable();
            $table->string('currency', 3)->default('usd');
            $table->string('discount_duration', 20);
            $table->unsignedSmallInteger('discount_months')->nullable();
            $table->string('plan_slug', 50);
            $table->string('billing_interval', 10);
            $table->string('stripe_coupon_id')->nullable();
            $table->string('stripe_promotion_code_id')->nullable();
            $table->string('status', 20)->default('pending');
            $table->timestamp('redeemed_at');
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();

            $table->foreign('community_subscription_id', 'sub_coupon_redemptions_sub_fk')
                ->references('id')
                ->on('community_subscriptions')
                ->nullOnDelete();
            $table->index(['community_id', 'status'], 'sub_coupon_redemptions_comm_status_idx');
            $table->index(['subscription_coupon_id', 'status'], 'sub_coupon_redemptions_coupon_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_coupon_redemptions');
        Schema::dropIfExists('subscription_coupons');
    }
};
