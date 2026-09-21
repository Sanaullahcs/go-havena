<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->string('plan_slug', 50);
            $table->string('billing_interval', 20)->default('month'); // month|year
            $table->string('status', 40)->default('incomplete');
            // incomplete|active|past_due|canceled|unpaid|grace|trialing
            $table->unsignedInteger('seat_limit');
            $table->unsignedInteger('extra_seats')->default(0);
            $table->unsignedInteger('estimated_residents')->nullable();
            $table->string('stripe_customer_id')->nullable()->index();
            $table->string('stripe_subscription_id')->nullable()->unique();
            $table->string('stripe_price_id')->nullable();
            $table->timestamp('current_period_start')->nullable();
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('cancel_at_period_end')->default(false);
            $table->timestamp('grace_ends_at')->nullable();
            $table->timestamp('canceled_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique('community_id');
            $table->index(['status', 'grace_ends_at']);
        });

        Schema::create('community_seat_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('invite_code_id')->nullable()->constrained('invite_codes')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('reserved'); // reserved|consumed|released
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'status', 'expires_at']);
        });

        Schema::table('communities', function (Blueprint $table) {
            $table->unsignedInteger('estimated_residents')->nullable()->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('communities', function (Blueprint $table) {
            $table->dropColumn('estimated_residents');
        });

        Schema::dropIfExists('community_seat_reservations');
        Schema::dropIfExists('community_subscriptions');
    }
};
