<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('amenities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->enum('status', ['open', 'closed', 'bookable'])->default('open');
            $table->unsignedSmallInteger('capacity')->default(10);
            $table->string('floor', 20)->nullable();
            $table->string('image_url', 512)->nullable();
            $table->string('hours', 100)->nullable();
            $table->timestamps();
        });

        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('amenity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('time_slot', 50);
            $table->unsignedSmallInteger('guests')->default(1);
            $table->enum('status', ['pending', 'confirmed', 'cancelled'])->default('confirmed');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['amenity_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
        Schema::dropIfExists('amenities');
    }
};
