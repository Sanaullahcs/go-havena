<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('wellness_lessons', 'image_url')) {
            Schema::table('wellness_lessons', function (Blueprint $table) {
                $table->dropColumn('image_url');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('wellness_lessons', 'image_url')) {
            Schema::table('wellness_lessons', function (Blueprint $table) {
                $table->string('image_url', 512)->nullable()->after('description');
            });
        }
    }
};
