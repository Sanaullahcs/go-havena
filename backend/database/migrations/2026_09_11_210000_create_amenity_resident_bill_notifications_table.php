<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('amenity_resident_bill_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('resident_bill_id')->constrained('amenity_resident_bills')->cascadeOnDelete();
            $table->string('kind', 32);
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['resident_bill_id', 'kind'], 'amenity_bill_notifications_unique');
            $table->index('kind');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('amenity_resident_bill_notifications');
    }
};
