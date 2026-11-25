<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_plaid_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained('communities')->cascadeOnDelete();
            $table->foreignId('connected_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('plaid_item_id')->unique();
            $table->text('plaid_access_token');
            $table->string('institution_id')->nullable();
            $table->string('institution_name')->nullable();
            $table->string('status', 32)->default('connected');
            $table->timestamps();

            $table->unique('community_id');
            $table->index(['community_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_plaid_connections');
    }
};
