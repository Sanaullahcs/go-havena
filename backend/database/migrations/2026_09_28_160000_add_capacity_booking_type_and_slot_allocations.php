<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('amenities') && ! Schema::hasColumn('amenities', 'capacity_booking_type')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->string('capacity_booking_type', 20)->default('per_seat')->after('capacity');
            });
        }

        if (! Schema::hasTable('booking_slot_allocations')) {
            Schema::create('booking_slot_allocations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('amenity_id')->constrained('amenities')->cascadeOnDelete();
                $table->date('date');
                $table->string('time_slot', 50);
                $table->unsignedSmallInteger('seats');
                $table->timestamps();
                $table->index(['amenity_id', 'date']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_slot_allocations');

        if (Schema::hasTable('amenities') && Schema::hasColumn('amenities', 'capacity_booking_type')) {
            Schema::table('amenities', function (Blueprint $table) {
                $table->dropColumn('capacity_booking_type');
            });
        }
    }
};
