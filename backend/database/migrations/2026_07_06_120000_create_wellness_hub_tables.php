<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wellness_categories', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('title', 120);
            $table->string('subtitle', 255)->nullable();
            $table->string('icon_key', 40)->nullable();
            $table->string('color', 20)->default('#0052DF');
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });

        Schema::create('wellness_courses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('wellness_categories')->cascadeOnDelete();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('image_url', 512)->nullable();
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->enum('status', ['published', 'draft'])->default('published');
            $table->timestamps();
        });

        Schema::create('wellness_lessons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('wellness_courses')->cascadeOnDelete();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('duration_min')->default(10);
            $table->string('video_url', 512)->nullable();
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->enum('status', ['published', 'draft'])->default('published');
            $table->timestamps();
        });

        Schema::create('wellness_lesson_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lesson_id')->constrained('wellness_lessons')->cascadeOnDelete();
            $table->timestamp('completed_at')->useCurrent();
            $table->unique(['user_id', 'lesson_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wellness_lesson_progress');
        Schema::dropIfExists('wellness_lessons');
        Schema::dropIfExists('wellness_courses');
        Schema::dropIfExists('wellness_categories');
    }
};
