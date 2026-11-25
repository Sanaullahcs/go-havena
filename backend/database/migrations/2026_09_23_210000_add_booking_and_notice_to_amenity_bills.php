<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('amenity_monthly_bills') && ! Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            Schema::table('amenity_monthly_bills', function (Blueprint $table) {
                $table->unsignedBigInteger('booking_id')->nullable()->after('amenity_id');
            });
        }

        if (Schema::hasTable('amenity_resident_bills')) {
            Schema::table('amenity_resident_bills', function (Blueprint $table) {
                if (! Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
                    $table->unsignedBigInteger('booking_id')->nullable()->after('user_id');
                }
                if (! Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
                    $table->unsignedBigInteger('finance_notice_id')->nullable()->after('booking_id');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('amenity_resident_bills')) {
            Schema::table('amenity_resident_bills', function (Blueprint $table) {
                if (Schema::hasColumn('amenity_resident_bills', 'finance_notice_id')) {
                    $table->dropColumn('finance_notice_id');
                }
                if (Schema::hasColumn('amenity_resident_bills', 'booking_id')) {
                    $table->dropColumn('booking_id');
                }
            });
        }

        if (Schema::hasTable('amenity_monthly_bills') && Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            Schema::table('amenity_monthly_bills', function (Blueprint $table) {
                $table->dropColumn('booking_id');
            });
        }
    }
};
