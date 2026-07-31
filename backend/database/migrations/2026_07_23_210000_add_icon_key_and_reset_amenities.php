<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('amenities', 'icon_key')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->string('icon_key', 40)->nullable()->after('image_url');
            });
        }

        // Amenities become admin-owned; clear seeded catalog + bookings.
        DB::table('bookings')->delete();
        DB::table('amenities')->delete();
    }

    public function down(): void
    {
        if (Schema::hasColumn('amenities', 'icon_key')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->dropColumn('icon_key');
            });
        }
    }
};
