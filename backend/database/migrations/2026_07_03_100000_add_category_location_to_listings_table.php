<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            if (! Schema::hasColumn('listings', 'category')) {
                $table->string('category', 60)->nullable()->after('type');
            }
            if (! Schema::hasColumn('listings', 'location')) {
                $table->string('location', 160)->nullable()->after('description');
            }
        });
    }

    public function down(): void
    {
        Schema::table('listings', function (Blueprint $table) {
            if (Schema::hasColumn('listings', 'category')) {
                $table->dropColumn('category');
            }
            if (Schema::hasColumn('listings', 'location')) {
                $table->dropColumn('location');
            }
        });
    }
};
