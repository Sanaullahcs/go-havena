<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE family_add_member_requests MODIFY phone VARCHAR(32) NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE family_add_member_requests MODIFY phone VARCHAR(32) NOT NULL');
    }
};
