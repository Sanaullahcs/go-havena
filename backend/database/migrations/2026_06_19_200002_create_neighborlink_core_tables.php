<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('display_name', 50)->default('');
            $table->string('avatar_url', 512)->nullable();
            $table->string('bio', 500)->nullable();
            $table->string('unit_number', 50)->nullable();
            $table->string('residence_type', 50)->nullable();
            $table->timestamps();
            $table->unique('user_id');
        });

        Schema::create('communities', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('region', 150);
            $table->text('description')->nullable();
            $table->string('timezone', 64)->default('America/New_York');
            $table->json('settings')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });

        Schema::create('community_memberships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->enum('role', ['member', 'moderator', 'admin'])->default('member');
            $table->enum('status', ['pending', 'approved', 'rejected', 'banned'])->default('pending');
            $table->string('invite_code_used', 64)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'community_id']);
        });

        Schema::create('invite_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->string('code', 64)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('phone_otps', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20)->index();
            $table->string('code_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_otps');
        Schema::dropIfExists('invite_codes');
        Schema::dropIfExists('community_memberships');
        Schema::dropIfExists('communities');
        Schema::dropIfExists('profiles');
    }
};
