<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('amenity_monthly_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('amenity_id')->constrained('amenities')->cascadeOnDelete();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->date('billing_month');
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->decimal('amount_per_resident', 10, 2);
            $table->date('due_date');
            $table->string('file_path', 512)->nullable();
            $table->string('file_name', 255)->nullable();
            $table->unsignedInteger('file_size')->nullable();
            $table->string('mime_type', 127)->nullable();
            $table->string('status', 20)->default('published');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->unique(['amenity_id', 'billing_month'], 'amenity_monthly_bills_unique');
            $table->index(['community_id', 'billing_month']);
        });

        Schema::create('amenity_resident_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('monthly_bill_id')->constrained('amenity_monthly_bills')->cascadeOnDelete();
            $table->foreignId('amenity_id')->constrained('amenities')->cascadeOnDelete();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('status', 20)->default('unpaid');
            $table->timestamps();

            $table->unique(['monthly_bill_id', 'user_id'], 'amenity_resident_bills_unique');
            $table->index(['amenity_id', 'user_id']);
            $table->index(['community_id', 'user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('amenity_resident_bills');
        Schema::dropIfExists('amenity_monthly_bills');
    }
};
