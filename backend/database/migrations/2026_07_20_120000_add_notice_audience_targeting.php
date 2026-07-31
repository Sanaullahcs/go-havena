<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->string('audience_type', 20)->default('all')->after('is_global');
        });

        Schema::create('notice_recipients', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('notice_id');
            $table->unsignedBigInteger('user_id');
            $table->timestamps();

            $table->unique(['notice_id', 'user_id']);
            $table->foreign('notice_id')->references('id')->on('notices')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notice_recipients');

        Schema::table('notices', function (Blueprint $table) {
            $table->dropColumn('audience_type');
        });
    }
};
