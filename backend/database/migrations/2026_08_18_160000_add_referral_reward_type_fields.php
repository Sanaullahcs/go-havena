<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('referral_program_settings', function (Blueprint $table) {
            $table->string('reward_type', 16)->default('percent')->after('id');
            $table->unsignedInteger('reward_fixed_cents')->nullable()->after('reward_percent');
        });

        Schema::table('referral_attributions', function (Blueprint $table) {
            $table->string('reward_type', 16)->default('percent')->after('referee_community_id');
            $table->unsignedInteger('reward_fixed_cents')->nullable()->after('reward_percent');
        });

        Schema::table('referral_rewards', function (Blueprint $table) {
            $table->string('reward_type', 16)->default('percent')->after('referee_community_id');
            $table->unsignedInteger('reward_fixed_cents')->nullable()->after('reward_percent');
        });
    }

    public function down(): void
    {
        Schema::table('referral_rewards', function (Blueprint $table) {
            $table->dropColumn(['reward_type', 'reward_fixed_cents']);
        });

        Schema::table('referral_attributions', function (Blueprint $table) {
            $table->dropColumn(['reward_type', 'reward_fixed_cents']);
        });

        Schema::table('referral_program_settings', function (Blueprint $table) {
            $table->dropColumn(['reward_type', 'reward_fixed_cents']);
        });
    }
};
