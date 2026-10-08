<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_attempts')) {
            Schema::create('payment_attempts', function (Blueprint $table) {
                $table->id();
                $table->string('public_id', 36)->unique();
                $table->string('reference', 24)->unique();
                $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->unsignedBigInteger('unit_id')->nullable();
                $table->string('provider', 20)->default('kuickpay');
                $table->string('payable_type', 40);
                $table->unsignedBigInteger('payable_id');
                $table->string('title', 200);
                $table->string('subtitle', 200)->nullable();
                $table->unsignedBigInteger('amount_paisa');
                $table->string('currency', 3)->default('PKR');
                $table->string('status', 32)->default('created');
                $table->string('idempotency_key', 64)->unique();
                // Holds "{payable_type}:{payable_id}" while the attempt is active so the
                // database itself refuses a second concurrent attempt for one bill.
                $table->string('active_lock', 80)->nullable()->unique();
                $table->string('channel', 12)->default('mobile');
                $table->string('method', 24)->nullable();
                $table->string('app_return_url', 500)->nullable();
                $table->string('launch_token', 64)->nullable()->unique();
                $table->string('provider_order_id', 64)->nullable()->unique();
                $table->string('provider_session_id', 80)->nullable();
                $table->string('provider_transaction_id', 80)->nullable()->index();
                $table->string('provider_auth_id', 12)->nullable();
                $table->string('provider_receipt_id', 80)->nullable();
                $table->string('provider_response_code', 8)->nullable();
                $table->string('failure_code', 64)->nullable();
                $table->string('failure_message', 500)->nullable();
                $table->boolean('simulated')->default(false);
                $table->unsignedInteger('reconcile_attempts')->default(0);
                $table->timestamp('next_reconcile_at')->nullable();
                $table->boolean('needs_attention')->default(false);
                $table->timestamp('initiated_at')->nullable();
                $table->timestamp('authorized_at')->nullable();
                $table->timestamp('submitted_at')->nullable();
                $table->timestamp('confirmed_at')->nullable();
                $table->timestamp('failed_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->index(['community_id', 'status']);
                $table->index(['user_id', 'created_at']);
                $table->index(['payable_type', 'payable_id']);
                $table->index(['status', 'next_reconcile_at']);
            });
        }

        if (! Schema::hasTable('payment_events')) {
            Schema::create('payment_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_attempt_id')->constrained('payment_attempts')->cascadeOnDelete();
                $table->string('event', 60);
                $table->string('status_from', 32)->nullable();
                $table->string('status_to', 32)->nullable();
                $table->string('actor_type', 20)->default('system');
                $table->unsignedBigInteger('actor_id')->nullable();
                $table->json('data')->nullable();
                $table->timestamp('created_at')->nullable();

                $table->index(['payment_attempt_id', 'id']);
            });
        }

        if (! Schema::hasTable('utility_billers')) {
            Schema::create('utility_billers', function (Blueprint $table) {
                $table->id();
                $table->string('mnemonic', 20)->unique();
                $table->string('biller_id', 5)->nullable();
                $table->string('name', 120);
                $table->string('short_name', 40);
                $table->string('service_type', 20);
                $table->string('region', 80)->nullable();
                $table->string('reference_label', 60)->default('Consumer number');
                $table->string('reference_hint', 160)->nullable();
                $table->unsignedTinyInteger('reference_min_length')->default(6);
                $table->unsignedTinyInteger('reference_max_length')->default(18);
                $table->string('brand_color', 9)->nullable();
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(100);
                $table->timestamp('synced_at')->nullable();
                $table->timestamps();

                $table->index(['service_type', 'active']);
            });
        }

        if (! Schema::hasTable('utility_accounts')) {
            Schema::create('utility_accounts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
                $table->unsignedBigInteger('unit_id');
                $table->foreignId('utility_biller_id')->constrained('utility_billers')->cascadeOnDelete();
                $table->string('service_type', 20);
                $table->string('nickname', 60)->nullable();
                $table->text('reference_encrypted');
                $table->string('reference_hash', 64);
                $table->string('reference_last4', 4);
                $table->string('consumer_name', 80)->nullable();
                $table->string('verification_status', 20)->default('pending');
                $table->string('verification_message', 200)->nullable();
                $table->timestamp('verified_at')->nullable();
                $table->timestamp('last_inquired_at')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamp('disabled_at')->nullable();
                $table->unsignedBigInteger('disabled_by')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
                $table->index(['unit_id', 'reference_hash']);
                $table->index(['community_id', 'verification_status']);
            });
        }

        if (! Schema::hasTable('utility_bills')) {
            Schema::create('utility_bills', function (Blueprint $table) {
                $table->id();
                $table->foreignId('utility_account_id')->constrained('utility_accounts')->cascadeOnDelete();
                $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
                $table->unsignedBigInteger('unit_id');
                $table->string('billing_month', 7);
                $table->string('consumer_name', 80)->nullable();
                $table->unsignedBigInteger('amount_within_due_paisa');
                $table->unsignedBigInteger('amount_after_due_paisa')->nullable();
                $table->date('due_date')->nullable();
                $table->string('status', 24)->default('unpaid');
                $table->string('provider_status', 4)->nullable();
                $table->string('provider_tran_auth_id', 12)->nullable();
                $table->unsignedBigInteger('paid_amount_paisa')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->string('paid_via', 12)->nullable();
                $table->unsignedBigInteger('payment_attempt_id')->nullable();
                $table->timestamp('fetched_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
                $table->unique(['utility_account_id', 'billing_month'], 'utility_bills_account_month_unique');
                $table->index(['unit_id', 'status']);
            });
        }

        if (! Schema::hasTable('kuickpay_inbound_payments')) {
            Schema::create('kuickpay_inbound_payments', function (Blueprint $table) {
                $table->id();
                $table->string('tran_auth_id', 12);
                $table->string('consumer_number', 18);
                $table->string('bank_mnemonic', 10)->nullable();
                $table->string('payable_type', 40);
                $table->unsignedBigInteger('payable_id');
                $table->unsignedBigInteger('paid_amount_paisa');
                $table->string('tran_date', 8);
                $table->string('tran_time', 6);
                $table->string('identification_parameter', 50);
                $table->string('response_code', 4);
                $table->unsignedBigInteger('payment_attempt_id')->nullable();
                $table->timestamps();

                // KuickPay may reuse a tran_auth_id across consumers from different banks.
                $table->unique(['tran_auth_id', 'consumer_number'], 'kuickpay_inbound_tran_unique');
                $table->index(['payable_type', 'payable_id']);
            });
        }

        if (! Schema::hasTable('community_payment_profiles')) {
            Schema::create('community_payment_profiles', function (Blueprint $table) {
                $table->id();
                $table->foreignId('community_id')->unique()->constrained('communities')->cascadeOnDelete();
                $table->string('provider', 20)->default('kuickpay');
                $table->string('onboarding_status', 20)->default('sandbox');
                $table->boolean('payments_enabled')->default(true);
                $table->boolean('utilities_enabled')->default(true);
                $table->boolean('residents_can_link_utilities')->default(true);
                $table->string('provider_institution_id', 20)->nullable();
                $table->string('settlement_account_title', 120)->nullable();
                $table->string('settlement_bank', 80)->nullable();
                $table->string('settlement_account_last4', 4)->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('unit_service_bills')) {
            Schema::table('unit_service_bills', function (Blueprint $table) {
                if (! Schema::hasColumn('unit_service_bills', 'payment_method')) {
                    $table->string('payment_method', 32)->nullable();
                }
                if (! Schema::hasColumn('unit_service_bills', 'payment_attempt_id')) {
                    $table->unsignedBigInteger('payment_attempt_id')->nullable();
                }
            });
        }

        if (Schema::hasTable('amenity_resident_bills') && ! Schema::hasColumn('amenity_resident_bills', 'payment_attempt_id')) {
            Schema::table('amenity_resident_bills', function (Blueprint $table) {
                $table->unsignedBigInteger('payment_attempt_id')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('amenity_resident_bills') && Schema::hasColumn('amenity_resident_bills', 'payment_attempt_id')) {
            Schema::table('amenity_resident_bills', fn (Blueprint $table) => $table->dropColumn('payment_attempt_id'));
        }
        if (Schema::hasTable('unit_service_bills') && Schema::hasColumn('unit_service_bills', 'payment_attempt_id')) {
            Schema::table('unit_service_bills', fn (Blueprint $table) => $table->dropColumn(['payment_attempt_id', 'payment_method']));
        }

        Schema::dropIfExists('community_payment_profiles');
        Schema::dropIfExists('kuickpay_inbound_payments');
        Schema::dropIfExists('utility_bills');
        Schema::dropIfExists('utility_accounts');
        Schema::dropIfExists('utility_billers');
        Schema::dropIfExists('payment_events');
        Schema::dropIfExists('payment_attempts');
    }
};
