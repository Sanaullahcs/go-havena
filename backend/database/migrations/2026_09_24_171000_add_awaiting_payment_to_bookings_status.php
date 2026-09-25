<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql' || ! Schema::hasTable('bookings')) {
            return;
        }

        DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'awaiting_payment', 'confirmed', 'cancelled', 'rejected') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql' || ! Schema::hasTable('bookings')) {
            return;
        }

        DB::table('bookings')->where('status', 'awaiting_payment')->update(['status' => 'pending']);
        DB::statement("ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'confirmed', 'cancelled', 'rejected') NOT NULL DEFAULT 'pending'");
    }
};
