<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaint_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('last_message_id')->default(0);
            $table->timestamp('read_at')->useCurrent();
            $table->unique(['complaint_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_reads');
    }
};
