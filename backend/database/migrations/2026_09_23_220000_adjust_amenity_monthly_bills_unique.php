<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('amenity_monthly_bills') || ! Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            return;
        }

        DB::table('amenity_monthly_bills')->whereNull('booking_id')->update(['booking_id' => 0]);

        try {
            Schema::table('amenity_monthly_bills', function (Blueprint $table) {
                $table->dropUnique('amenity_monthly_bills_unique');
            });
        } catch (\Throwable) {
            // Fresh sqlite installs may already use the replacement index.
        }

        try {
            Schema::table('amenity_monthly_bills', function (Blueprint $table) {
                $table->unique(['amenity_id', 'billing_month', 'booking_id'], 'amenity_monthly_bills_period_unique');
            });
        } catch (\Throwable) {
            // Already migrated.
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('amenity_monthly_bills')) {
            return;
        }

        Schema::table('amenity_monthly_bills', function (Blueprint $table) {
            $table->dropUnique('amenity_monthly_bills_period_unique');
        });

        Schema::table('amenity_monthly_bills', function (Blueprint $table) {
            $table->unique(['amenity_id', 'billing_month'], 'amenity_monthly_bills_unique');
        });
    }
};
