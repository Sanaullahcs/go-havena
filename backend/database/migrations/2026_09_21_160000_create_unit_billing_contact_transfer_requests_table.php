<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unit_billing_contact_transfer_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('requested_by_user_id');
            $table->unsignedBigInteger('nominee_user_id');
            $table->string('status', 20)->default('pending');
            $table->string('message', 500)->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->unsignedBigInteger('reviewed_by_user_id')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->foreign('community_id', 'ubctr_community_fk')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('unit_id', 'ubctr_unit_fk')->references('id')->on('units')->cascadeOnDelete();
            $table->foreign('requested_by_user_id', 'ubctr_requested_by_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('nominee_user_id', 'ubctr_nominee_fk')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('reviewed_by_user_id', 'ubctr_reviewed_by_fk')->references('id')->on('users')->nullOnDelete();

            $table->index(['unit_id', 'status'], 'ubctr_unit_status_idx');
            $table->index(['nominee_user_id', 'status'], 'ubctr_nominee_status_idx');
            $table->index(['requested_by_user_id', 'status'], 'ubctr_requester_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unit_billing_contact_transfer_requests');
    }
};
