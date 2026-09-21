<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('active_context', 32)->nullable()->after('community_admin_status');
            $table->unsignedBigInteger('active_context_community_id')->nullable()->after('active_context');
            $table->index(['active_context', 'active_context_community_id'], 'users_active_context_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_active_context_idx');
            $table->dropColumn(['active_context', 'active_context_community_id']);
        });
    }
};
