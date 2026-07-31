<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('platform', ['ios', 'android']);
            // Keep under MySQL utf8mb4 index limit (1000 bytes with user_id).
            $table->string('expo_push_token', 191);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'expo_push_token']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
