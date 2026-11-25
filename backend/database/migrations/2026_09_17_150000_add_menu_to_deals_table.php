<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->string('menu_image_url', 512)->nullable()->after('image_url');
            $table->json('menu_items')->nullable()->after('menu_image_url');
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->dropColumn(['menu_image_url', 'menu_items']);
        });
    }
};
