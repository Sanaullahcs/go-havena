<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('app_version_settings')) {
            return;
        }

        Schema::create('app_version_settings', function (Blueprint $table) {
            $table->id();
            $table->string('ios_latest_version', 32)->default('1.0.2');
            $table->string('ios_minimum_version', 32)->default('1.0.2');
            $table->boolean('ios_force_update')->default(false);
            $table->string('ios_store_url', 500)->nullable();
            $table->string('android_latest_version', 32)->default('1.0.2');
            $table->string('android_minimum_version', 32)->default('1.0.2');
            $table->boolean('android_force_update')->default(false);
            $table->string('android_store_url', 500)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_version_settings');
    }
};
