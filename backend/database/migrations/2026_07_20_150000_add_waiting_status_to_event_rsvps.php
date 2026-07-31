<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE event_rsvps MODIFY status ENUM('going', 'maybe', 'not_going', 'waiting') NOT NULL DEFAULT 'going'",
        );
    }

    public function down(): void
    {
        DB::table('event_rsvps')->where('status', 'waiting')->delete();

        DB::statement(
            "ALTER TABLE event_rsvps MODIFY status ENUM('going', 'maybe', 'not_going') NOT NULL DEFAULT 'going'",
        );
    }
};
