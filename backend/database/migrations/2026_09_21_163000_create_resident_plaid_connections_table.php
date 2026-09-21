<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resident_plaid_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->string('plaid_item_id')->unique();
            $table->text('plaid_access_token');
            $table->string('institution_id')->nullable();
            $table->string('institution_name')->nullable();
            $table->string('account_id')->nullable();
            $table->string('account_name')->nullable();
            $table->string('account_official_name')->nullable();
            $table->string('account_type', 40)->nullable();
            $table->string('account_subtype', 40)->nullable();
            $table->string('account_mask', 8)->nullable();
            $table->text('ach_account')->nullable();
            $table->text('ach_routing')->nullable();
            $table->string('status', 32)->default('connected');
            $table->string('error_code', 64)->nullable();
            $table->string('error_message', 500)->nullable();
            $table->string('last_webhook_code', 64)->nullable();
            $table->timestamp('last_webhook_at')->nullable();
            $table->timestamp('disconnected_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'community_id']);
            $table->index(['community_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resident_plaid_connections');
    }
};
