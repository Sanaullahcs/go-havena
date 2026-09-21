<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('title', 200);
            $table->string('category', 100);
            $table->text('description')->nullable();
            $table->string('file_path', 512);
            $table->string('file_name', 255);
            $table->unsignedInteger('file_size')->default(0);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedInteger('download_count')->default(0);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
            $table->index(['community_id', 'status']);
            $table->index(['community_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_documents');
    }
};
