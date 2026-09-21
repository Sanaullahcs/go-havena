<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('suspension_reason', 64)->nullable()->after('status');
        });

        Schema::table('community_memberships', function (Blueprint $table) {
            $table->string('status_before_deactivation', 32)->nullable()->after('status');
            $table->string('deactivation_source', 32)->nullable()->after('status_before_deactivation');
        });
    }

    public function down(): void
    {
        Schema::table('community_memberships', function (Blueprint $table) {
            $table->dropColumn(['status_before_deactivation', 'deactivation_source']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('suspension_reason');
        });
    }
};
