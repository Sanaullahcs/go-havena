<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE app_notifications MODIFY body TEXT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE app_notifications MODIFY body VARCHAR(500) NULL');
    }
};
