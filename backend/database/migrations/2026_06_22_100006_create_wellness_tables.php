<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wellness_content', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('category', ['fitness', 'mental_health', 'nutrition', 'sleep', 'mindfulness'])->default('fitness');
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('duration_min')->default(10);
            $table->string('image_url', 512)->nullable();
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('wellness_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('content_id')->constrained('wellness_content')->cascadeOnDelete();
            $table->timestamp('completed_at')->useCurrent();
            $table->unique(['user_id', 'content_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wellness_progress');
        Schema::dropIfExists('wellness_content');
    }
};
