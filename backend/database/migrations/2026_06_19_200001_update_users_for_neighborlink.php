<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->char('uuid', 26)->nullable()->unique()->after('id');
            $table->string('phone', 20)->nullable()->unique()->after('email');
            $table->timestamp('phone_verified_at')->nullable()->after('phone');
            $table->string('google_id')->nullable()->after('password');
            $table->string('apple_id')->nullable()->after('google_id');
            $table->enum('status', ['active', 'suspended', 'deleted'])->default('active')->after('apple_id');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropSoftDeletes();
            $table->dropColumn([
                'uuid', 'phone', 'phone_verified_at',
                'google_id', 'apple_id', 'status',
            ]);
        });
    }
};
