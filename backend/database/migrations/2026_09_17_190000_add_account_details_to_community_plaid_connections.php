<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_plaid_connections', function (Blueprint $table) {
            $table->string('account_id')->nullable()->after('institution_name');
            $table->string('account_name')->nullable()->after('account_id');
            $table->string('account_official_name')->nullable()->after('account_name');
            $table->string('account_type', 40)->nullable()->after('account_official_name');
            $table->string('account_subtype', 40)->nullable()->after('account_type');
            $table->string('account_mask', 8)->nullable()->after('account_subtype');
            $table->string('error_code', 80)->nullable()->after('status');
            $table->string('error_message', 500)->nullable()->after('error_code');
            $table->string('last_webhook_code', 80)->nullable()->after('error_message');
            $table->timestamp('last_webhook_at')->nullable()->after('last_webhook_code');
            $table->timestamp('disconnected_at')->nullable()->after('last_webhook_at');
        });
    }

    public function down(): void
    {
        Schema::table('community_plaid_connections', function (Blueprint $table) {
            $table->dropColumn([
                'account_id',
                'account_name',
                'account_official_name',
                'account_type',
                'account_subtype',
                'account_mask',
                'error_code',
                'error_message',
                'last_webhook_code',
                'last_webhook_at',
                'disconnected_at',
            ]);
        });
    }
};
