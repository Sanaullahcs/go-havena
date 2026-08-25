<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agreements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id')->index();
            $table->unsignedBigInteger('created_by')->index();
            $table->string('title');
            $table->string('category', 40)->default('general');
            $table->longText('body');
            $table->string('status', 20)->default('draft')->index();
            $table->string('audience', 20)->default('all');
            $table->unsignedInteger('signature_fee_cents')->default(0);
            $table->timestamp('due_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('agreement_recipients', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('agreement_id')->index();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('status', 20)->default('pending')->index();
            $table->timestamp('viewed_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->timestamp('declined_at')->nullable();
            $table->string('decline_reason', 500)->nullable();
            $table->string('signer_name')->nullable();
            $table->string('signature_path')->nullable();
            $table->string('signer_ip', 64)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->string('content_hash', 64)->nullable();
            $table->string('certificate_id', 40)->nullable()->unique();
            $table->string('payment_status', 20)->default('not_required');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->unique(['agreement_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agreement_recipients');
        Schema::dropIfExists('agreements');
    }
};
