<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('unit_ownerships') && ! Schema::hasColumn('unit_ownerships', 'proof_url')) {
            Schema::table('unit_ownerships', function (Blueprint $table) {
                $table->string('proof_url', 1024)->nullable()->after('source');
            });
        }

        if (Schema::hasTable('unit_registration_package_items') && ! Schema::hasColumn('unit_registration_package_items', 'occupancy')) {
            Schema::table('unit_registration_package_items', function (Blueprint $table) {
                $table->string('occupancy', 20)->nullable()->after('residence_type');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('unit_ownerships') && Schema::hasColumn('unit_ownerships', 'proof_url')) {
            Schema::table('unit_ownerships', function (Blueprint $table) {
                $table->dropColumn('proof_url');
            });
        }

        if (Schema::hasTable('unit_registration_package_items') && Schema::hasColumn('unit_registration_package_items', 'occupancy')) {
            Schema::table('unit_registration_package_items', function (Blueprint $table) {
                $table->dropColumn('occupancy');
            });
        }
    }
};
