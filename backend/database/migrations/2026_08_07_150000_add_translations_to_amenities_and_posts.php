<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->string('name_es', 100)->nullable()->after('name');
            $table->string('name_ar', 100)->nullable()->after('name_es');
            $table->text('description_es')->nullable()->after('description');
            $table->text('description_ar')->nullable()->after('description_es');
        });

        Schema::table('posts', function (Blueprint $table) {
            $table->text('body_es')->nullable()->after('body');
            $table->text('body_ar')->nullable()->after('body_es');
        });
    }

    public function down(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->dropColumn(['name_es', 'name_ar', 'description_es', 'description_ar']);
        });

        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn(['body_es', 'body_ar']);
        });
    }
};
