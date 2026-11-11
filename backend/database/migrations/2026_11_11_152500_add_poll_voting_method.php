<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('polls', function (Blueprint $table) {
            $table->string('voting_method', 16)->default('single')->after('duration_days');
        });

        if (Schema::hasTable('poll_votes')) {
            try {
                Schema::table('poll_votes', function (Blueprint $table) {
                    $table->dropUnique(['poll_id', 'user_id']);
                });
            } catch (\Throwable) {
                // SQLite / alternate index names in dev.
            }

            Schema::table('poll_votes', function (Blueprint $table) {
                $table->unique(['poll_id', 'user_id', 'option_id'], 'poll_votes_poll_user_option_unique');
            });
        }

        DB::table('polls')->whereNull('voting_method')->update(['voting_method' => 'single']);
    }

    public function down(): void
    {
        if (Schema::hasTable('poll_votes')) {
            try {
                Schema::table('poll_votes', function (Blueprint $table) {
                    $table->dropUnique('poll_votes_poll_user_option_unique');
                });
            } catch (\Throwable) {
            }

            Schema::table('poll_votes', function (Blueprint $table) {
                $table->unique(['poll_id', 'user_id']);
            });
        }

        Schema::table('polls', function (Blueprint $table) {
            $table->dropColumn('voting_method');
        });
    }
};
