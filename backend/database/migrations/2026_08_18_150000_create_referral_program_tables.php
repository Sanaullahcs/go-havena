<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referral_program_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('reward_percent', 5, 2)->default(5);
            $table->boolean('is_active')->default(true);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('referral_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->string('code', 16)->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('referral_attributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referral_code_id')->constrained('referral_codes')->cascadeOnDelete();
            $table->foreignId('referrer_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referee_user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->foreignId('referee_community_id')->nullable()->unique()->constrained('communities')->nullOnDelete();
            $table->decimal('reward_percent', 5, 2);
            $table->string('status', 32)->default('locked');
            $table->string('referral_source', 32)->default('web_link');
            $table->string('referral_token', 40)->nullable();
            $table->timestamp('locked_at');
            $table->timestamp('disqualified_at')->nullable();
            $table->string('disqualify_reason')->nullable();
            $table->json('fraud_flags')->nullable();
            $table->string('fraud_review_status', 16)->default('none');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['referrer_user_id', 'status']);
            $table->index('status');
        });

        Schema::create('referral_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referral_attribution_id')->unique()->constrained('referral_attributions')->cascadeOnDelete();
            $table->foreignId('referrer_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referee_community_id')->constrained('communities')->cascadeOnDelete();
            $table->decimal('reward_percent', 5, 2);
            $table->unsignedInteger('invoice_subtotal_cents');
            $table->unsignedInteger('reward_amount_cents');
            $table->string('currency', 3)->default('usd');
            $table->string('stripe_invoice_id', 64)->unique();
            $table->string('stripe_balance_transaction_id', 64)->nullable();
            $table->string('referrer_stripe_customer_id', 64)->nullable();
            $table->string('status', 16)->default('pending');
            $table->timestamp('qualified_at');
            $table->timestamp('credited_at')->nullable();
            $table->string('failure_reason')->nullable();
            $table->timestamps();

            $table->index(['referrer_user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_rewards');
        Schema::dropIfExists('referral_attributions');
        Schema::dropIfExists('referral_codes');
        Schema::dropIfExists('referral_program_settings');
    }
};
