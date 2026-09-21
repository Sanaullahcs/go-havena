<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('event_rsvps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notice_id')->constrained('notices')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('status', ['going', 'maybe', 'not_going'])->default('going');
            $table->timestamps();

            $table->unique(['notice_id', 'user_id']);
            $table->index(['notice_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('event_rsvps');
    }
};
