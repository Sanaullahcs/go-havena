<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_essential_entries', function (Blueprint $table) {
            $table->text('description')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('nearby_category', 40)->nullable();
            $table->unsignedBigInteger('nearby_place_id')->nullable();
        });

        Schema::table('community_nearby_places', function (Blueprint $table) {
            $table->text('description')->nullable();
            $table->unsignedBigInteger('essential_entry_id')->nullable();
        });

        Schema::table('nearby_place_suggestions', function (Blueprint $table) {
            $table->text('description')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('essential_section', 20)->nullable();
            $table->boolean('publish_nearby')->default(true);
            $table->boolean('publish_essentials')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('community_essential_entries', function (Blueprint $table) {
            $table->dropColumn(['description', 'latitude', 'longitude', 'nearby_category', 'nearby_place_id']);
        });
        Schema::table('community_nearby_places', function (Blueprint $table) {
            $table->dropColumn(['description', 'essential_entry_id']);
        });
        Schema::table('nearby_place_suggestions', function (Blueprint $table) {
            $table->dropColumn(['description', 'latitude', 'longitude', 'essential_section', 'publish_nearby', 'publish_essentials']);
        });
    }
};
