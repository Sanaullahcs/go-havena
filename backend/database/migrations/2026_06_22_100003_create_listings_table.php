<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('listings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['for_sale', 'service', 'wanted', 'deal'])->default('for_sale');
            $table->string('title', 200);
            $table->decimal('price', 10, 2)->nullable();
            $table->text('description');
            $table->json('images')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected', 'sold'])->default('pending');
            $table->boolean('is_verified')->default(false);
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['community_id', 'status']);
        });

        Schema::create('listing_saves', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('listing_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->primary(['user_id', 'listing_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('listing_saves');
        Schema::dropIfExists('listings');
    }
};
