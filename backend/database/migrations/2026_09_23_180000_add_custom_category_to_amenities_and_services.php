<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('amenities') && ! Schema::hasColumn('amenities', 'custom_category')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->string('custom_category', 80)->nullable()->after('icon_key');
            });
        }

        if (Schema::hasTable('property_services') && ! Schema::hasColumn('property_services', 'custom_category')) {
            Schema::table('property_services', function (Blueprint $table) {
                $table->string('custom_category', 80)->nullable()->after('category');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('amenities') && Schema::hasColumn('amenities', 'custom_category')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->dropColumn('custom_category');
            });
        }

        if (Schema::hasTable('property_services') && Schema::hasColumn('property_services', 'custom_category')) {
            Schema::table('property_services', function (Blueprint $table) {
                $table->dropColumn('custom_category');
            });
        }
    }
};
