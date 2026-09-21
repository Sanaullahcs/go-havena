<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('businesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 200);
            $table->string('category', 60)->nullable();
            $table->text('description')->nullable();
            $table->string('address', 255)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('hours', 120)->nullable();
            $table->text('amenities')->nullable();
            $table->string('image_url', 512)->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected', 'inactive'])->default('pending');
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['community_id', 'status']);
            $table->index(['owner_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('businesses');
    }
};
