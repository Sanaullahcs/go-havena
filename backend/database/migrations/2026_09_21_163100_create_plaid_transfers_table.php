<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plaid_transfers', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 36)->unique();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('purpose', 40);
            $table->string('payable_type', 80)->nullable();
            $table->unsignedBigInteger('payable_id')->nullable();
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('USD');
            $table->string('status', 32)->default('authorizing');
            $table->string('provider', 32)->default('plaid');
            $table->boolean('simulated')->default(false);
            $table->string('description', 80)->nullable();
            $table->string('idempotency_key', 64)->unique();
            $table->string('debit_authorization_id')->nullable();
            $table->string('debit_transfer_id')->nullable();
            $table->string('credit_authorization_id')->nullable();
            $table->string('credit_transfer_id')->nullable();
            $table->string('refund_transfer_id')->nullable();
            $table->string('source_institution')->nullable();
            $table->string('source_account_mask', 8)->nullable();
            $table->string('destination_institution')->nullable();
            $table->string('destination_account_mask', 8)->nullable();
            $table->string('failure_code', 64)->nullable();
            $table->string('failure_message', 500)->nullable();
            $table->timestamp('authorized_at')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'status']);
            $table->index(['user_id', 'created_at']);
            $table->index(['payable_type', 'payable_id']);
            $table->index('debit_transfer_id');
            $table->index('credit_transfer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plaid_transfers');
    }
};
