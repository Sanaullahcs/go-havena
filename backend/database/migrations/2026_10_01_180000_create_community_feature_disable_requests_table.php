<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_feature_disable_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->string('feature_key', 64);
            $table->text('reason');
            $table->string('status', 20)->default('pending');
            $table->foreignId('requested_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['community_id', 'feature_key', 'status'], 'feature_disable_req_lookup');
            $table->index(['status', 'created_at'], 'feature_disable_req_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_feature_disable_requests');
    }
};
