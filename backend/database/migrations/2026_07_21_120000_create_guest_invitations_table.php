<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guest_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('invitation_type', ['resident', 'admin'])->default('resident');
            $table->string('guest_name', 100);
            $table->string('guest_email', 200)->nullable();
            $table->string('guest_phone', 30);
            $table->string('invite_code', 32)->unique();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->enum('status', [
                'pending_verification',
                'pending_approval',
                'active',
                'rejected',
                'expired',
                'revoked',
            ])->default('pending_verification');
            $table->foreignId('guest_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'status']);
            $table->index('guest_phone');
        });

        Schema::create('guest_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_invitation_id')->constrained('guest_invitations')->cascadeOnDelete();
            $table->foreignId('guest_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->string('action', 64);
            $table->string('description', 500)->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_activity_logs');
        Schema::dropIfExists('guest_invitations');
    }
};
