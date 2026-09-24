<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE community_memberships MODIFY status ENUM('pending','approved','rejected','banned','not_invited') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::table('community_memberships')->where('status', 'not_invited')->update(['status' => 'pending']);
        DB::statement("ALTER TABLE community_memberships MODIFY status ENUM('pending','approved','rejected','banned') NOT NULL DEFAULT 'pending'");
    }
};
