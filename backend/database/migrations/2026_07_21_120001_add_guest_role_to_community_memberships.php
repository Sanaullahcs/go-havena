<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE community_memberships MODIFY role ENUM('member','moderator','admin','guest') NOT NULL DEFAULT 'member'");
    }

    public function down(): void
    {
        DB::table('community_memberships')->where('role', 'guest')->update(['role' => 'member']);
        DB::statement("ALTER TABLE community_memberships MODIFY role ENUM('member','moderator','admin') NOT NULL DEFAULT 'member'");
    }
};
