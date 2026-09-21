<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('title', 200);
            $table->string('category', 100);
            $table->text('description');
            $table->enum('severity', ['important', 'standard', 'info'])->default('standard');
            $table->boolean('requires_acknowledgment')->default(false);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
            $table->index(['community_id', 'status']);
        });

        Schema::create('rule_acknowledgments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rule_id')->constrained('community_rules')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('acknowledged_at')->useCurrent();
            $table->unique(['rule_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rule_acknowledgments');
        Schema::dropIfExists('community_rules');
    }
};
