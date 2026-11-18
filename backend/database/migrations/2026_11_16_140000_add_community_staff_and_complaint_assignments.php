<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('phone', 30)->nullable();
            $table->string('staff_type', 20);
            $table->string('status', 20)->default('active');
            $table->string('availability', 20)->default('available');
            $table->json('specializations');
            $table->string('invitation_token', 80)->nullable()->unique();
            $table->timestamp('invitation_expires_at')->nullable();
            $table->timestamp('invited_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['community_id', 'user_id']);
            $table->unique(['community_id', 'email']);
            $table->index(['community_id', 'status']);
        });

        Schema::table('complaints', function (Blueprint $table) {
            $table->foreignId('assigned_staff_id')->nullable()->after('assigned_to_user_id')->constrained('community_staff')->nullOnDelete();
        });

        Schema::create('complaint_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('staff_id')->nullable()->constrained('community_staff')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 20);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['complaint_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_assignments');
        Schema::table('complaints', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_staff_id');
        });
        Schema::dropIfExists('community_staff');
    }
};
