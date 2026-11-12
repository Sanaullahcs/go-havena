<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 32)->unique();
            $table->string('type', 20);
            $table->string('routed_to', 32);
            $table->foreignId('community_id')->nullable()->constrained('communities')->nullOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->string('unit_number_snapshot', 50)->nullable();
            $table->foreignId('reporter_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('reporter_name_snapshot', 120);
            $table->string('category', 40);
            $table->string('priority', 20)->default('normal');
            $table->string('title', 200);
            $table->text('description');
            $table->string('status', 32)->default('submitted');
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedTinyInteger('feedback_rating')->nullable();
            $table->text('feedback_comment')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['type', 'status']);
            $table->index(['community_id', 'type', 'status']);
            $table->index(['reporter_user_id', 'status']);
            $table->index('assigned_to_user_id');
        });

        Schema::create('complaint_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->string('visibility', 20)->default('public');
            $table->timestamps();

            $table->index(['complaint_id', 'visibility']);
        });

        Schema::create('complaint_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('message_id')->nullable()->constrained('complaint_messages')->nullOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('disk', 20)->default('local');
            $table->string('file_path', 500);
            $table->string('file_name', 255);
            $table->unsignedInteger('file_size')->default(0);
            $table->string('mime_type', 120)->nullable();
            $table->timestamps();
        });

        Schema::create('complaint_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 40);
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['complaint_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_events');
        Schema::dropIfExists('complaint_attachments');
        Schema::dropIfExists('complaint_messages');
        Schema::dropIfExists('complaints');
    }
};
