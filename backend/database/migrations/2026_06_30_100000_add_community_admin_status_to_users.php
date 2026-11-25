<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('community_admin_status', 20)->nullable()->after('role');
        });

        // Widen role column: system_admin | community_admin | admin (legacy) | moderator | resident
        DB::statement("ALTER TABLE users MODIFY role VARCHAR(32) NOT NULL DEFAULT 'resident'");

        // Legacy seeded platform admins stay system-level.
        DB::table('users')
            ->where('role', 'admin')
            ->whereNull('community_admin_status')
            ->update(['role' => 'system_admin']);
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'system_admin')->update(['role' => 'admin']);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('community_admin_status');
        });

        DB::statement("ALTER TABLE users MODIFY role ENUM('admin','moderator','resident') NOT NULL DEFAULT 'resident'");
    }
};
