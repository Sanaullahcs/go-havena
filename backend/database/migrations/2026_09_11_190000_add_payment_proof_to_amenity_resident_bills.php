<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenity_resident_bills', function (Blueprint $table) {
            $table->string('proof_file_path', 512)->nullable()->after('status');
            $table->string('proof_file_name', 255)->nullable()->after('proof_file_path');
            $table->unsignedInteger('proof_file_size')->nullable()->after('proof_file_name');
            $table->string('proof_mime_type', 127)->nullable()->after('proof_file_size');
            $table->date('payment_date')->nullable()->after('proof_mime_type');
            $table->string('payment_reference', 100)->nullable()->after('payment_date');
            $table->text('payment_note')->nullable()->after('payment_reference');
            $table->timestamp('proof_submitted_at')->nullable()->after('payment_note');
        });
    }

    public function down(): void
    {
        Schema::table('amenity_resident_bills', function (Blueprint $table) {
            $table->dropColumn([
                'proof_file_path',
                'proof_file_name',
                'proof_file_size',
                'proof_mime_type',
                'payment_date',
                'payment_reference',
                'payment_note',
                'proof_submitted_at',
            ]);
        });
    }
};
