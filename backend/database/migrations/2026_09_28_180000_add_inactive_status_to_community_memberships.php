<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE community_memberships MODIFY status ENUM('pending','approved','rejected','banned','not_invited','inactive') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        DB::table('community_memberships')->where('status', 'inactive')->update(['status' => 'banned']);
        DB::statement("ALTER TABLE community_memberships MODIFY status ENUM('pending','approved','rejected','banned','not_invited') NOT NULL DEFAULT 'pending'");
    }
};
