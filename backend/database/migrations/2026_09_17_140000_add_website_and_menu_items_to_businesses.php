<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('businesses', 'website')) {
            Schema::table('businesses', function (Blueprint $table) {
                $table->string('website', 512)->nullable()->after('amenities');
            });
        }
        if (! Schema::hasColumn('businesses', 'menu_items')) {
            Schema::table('businesses', function (Blueprint $table) {
                $table->longText('menu_items')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::table('businesses', function (Blueprint $table) {
            if (Schema::hasColumn('businesses', 'menu_items')) {
                $table->dropColumn('menu_items');
            }
            if (Schema::hasColumn('businesses', 'website')) {
                $table->dropColumn('website');
            }
        });
    }
};
