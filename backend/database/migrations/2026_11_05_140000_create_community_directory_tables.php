<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_nearby_places', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->string('name');
            $table->string('category', 40);
            $table->string('address')->nullable();
            $table->string('phone', 40)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('verified')->default(false);
            $table->string('source', 20)->default('resident');
            $table->unsignedBigInteger('suggestion_id')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'category']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
        });

        Schema::create('community_place_hides', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->string('place_id', 80);
            $table->timestamps();

            $table->unique(['community_id', 'place_id']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
        });

        Schema::create('nearby_place_suggestions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('user_id');
            $table->string('kind', 20);
            $table->string('place_id', 80)->nullable();
            $table->string('name')->nullable();
            $table->string('category', 40)->nullable();
            $table->string('address')->nullable();
            $table->string('phone', 40)->nullable();
            $table->text('note')->nullable();
            $table->string('status', 20)->default('pending');
            $table->text('review_note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'status']);
            $table->index(['user_id', 'community_id']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('community_essential_entries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->string('section', 20);
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('address')->nullable();
            $table->boolean('verified')->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'section']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_essential_entries');
        Schema::dropIfExists('nearby_place_suggestions');
        Schema::dropIfExists('community_place_hides');
        Schema::dropIfExists('community_nearby_places');
    }
};
