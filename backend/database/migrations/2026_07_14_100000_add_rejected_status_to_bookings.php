<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Bookings now require admin approval, so they start as "pending"
        // and can be "rejected" by an admin.
        DB::statement(
            "ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'rejected') NOT NULL DEFAULT 'pending'"
        );
    }

    public function down(): void
    {
        DB::statement(
            "ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed'"
        );
    }
};
