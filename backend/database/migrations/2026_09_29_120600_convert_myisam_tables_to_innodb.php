<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        $tables = DB::select(
            "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'MyISAM' AND TABLE_TYPE = 'BASE TABLE'"
        );

        foreach ($tables as $table) {
            $raw = (string) ($table->name ?? $table->NAME ?? $table->TABLE_NAME ?? '');
            if ($raw === '') {
                continue;
            }
            $name = str_replace('`', '``', $raw);
            DB::statement('ALTER TABLE `'.$name.'` ENGINE=InnoDB');
        }

        $this->releaseStuckFailedBankBookings();
    }

    public function down(): void
    {
        // Leave tables on InnoDB. MyISAM cannot roll back a failed bank charge.
    }

    private function releaseStuckFailedBankBookings(): void
    {
        if (! Schema::hasTable('bookings') || ! Schema::hasColumn('bookings', 'ach_status')) {
            return;
        }

        $stuck = DB::table('bookings')
            ->where('status', 'pending')
            ->where('payment_method', 'bank_ach')
            ->where('ach_status', 'failed')
            ->pluck('id');

        if ($stuck->isEmpty()) {
            return;
        }

        if (Schema::hasTable('booking_slot_allocations')) {
            DB::table('booking_slot_allocations')->whereIn('booking_id', $stuck->all())->delete();
        }

        DB::table('bookings')->whereIn('id', $stuck->all())->update([
            'status' => 'cancelled',
            'updated_at' => now(),
        ]);
    }
};
