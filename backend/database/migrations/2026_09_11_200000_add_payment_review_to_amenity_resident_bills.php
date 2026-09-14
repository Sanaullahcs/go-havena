<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenity_resident_bills', function (Blueprint $table) {
            $table->foreignId('proof_submitted_by')->nullable()->after('proof_submitted_at')->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->after('proof_submitted_by')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->foreignId('rejected_by')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable()->after('rejected_by');
            $table->string('rejection_reason', 500)->nullable()->after('rejected_at');
        });

        Schema::create('amenity_resident_bill_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('resident_bill_id')->constrained('amenity_resident_bills')->cascadeOnDelete();
            $table->foreignId('monthly_bill_id')->constrained('amenity_monthly_bills')->cascadeOnDelete();
            $table->foreignId('amenity_id')->constrained('amenities')->cascadeOnDelete();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('action', 32);
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status_from', 20)->nullable();
            $table->string('status_to', 20);
            $table->string('proof_file_path', 512)->nullable();
            $table->string('proof_file_name', 255)->nullable();
            $table->unsignedInteger('proof_file_size')->nullable();
            $table->string('proof_mime_type', 127)->nullable();
            $table->date('payment_date')->nullable();
            $table->string('payment_reference', 100)->nullable();
            $table->text('payment_note')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->timestamps();

            $table->index(['resident_bill_id', 'created_at']);
            $table->index(['community_id', 'action']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('amenity_resident_bill_reviews');

        Schema::table('amenity_resident_bills', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proof_submitted_by');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropConstrainedForeignId('rejected_by');
            $table->dropColumn(['approved_at', 'rejected_at', 'rejection_reason']);
        });
    }
};
