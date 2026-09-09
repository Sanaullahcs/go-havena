<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactional_email_sends', function (Blueprint $table) {
            $table->id();
            $table->string('mail_type', 80);
            $table->string('context_key', 191);
            $table->string('recipient_email', 191);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['mail_type', 'context_key']);
            $table->index('recipient_email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactional_email_sends');
    }
};
