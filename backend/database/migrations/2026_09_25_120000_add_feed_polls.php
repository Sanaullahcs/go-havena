<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE posts MODIFY COLUMN category ENUM('general','event','update','help','announcement','poll') NOT NULL DEFAULT 'general'");
        }

        Schema::create('polls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->string('question', 200);
            $table->string('description', 500)->nullable();
            $table->unsignedTinyInteger('duration_days');
            $table->timestamp('ends_at');
            $table->timestamps();
            $table->unique('post_id');
        });

        Schema::create('poll_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->string('label', 80);
            $table->unsignedTinyInteger('position');
            $table->timestamps();
        });

        Schema::create('poll_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->foreignId('option_id')->constrained('poll_options')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['poll_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poll_votes');
        Schema::dropIfExists('poll_options');
        Schema::dropIfExists('polls');

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::table('posts')->where('category', 'poll')->update(['category' => 'general']);
            DB::statement("ALTER TABLE posts MODIFY COLUMN category ENUM('general','event','update','help','announcement') NOT NULL DEFAULT 'general'");
        }
    }
};
