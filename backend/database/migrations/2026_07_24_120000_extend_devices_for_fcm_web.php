<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('devices')) {
            return;
        }

        Schema::table('devices', function (Blueprint $table) {
            if (! Schema::hasColumn('devices', 'fcm_token')) {
                $table->string('fcm_token', 512)->nullable()->after('expo_push_token');
            }
        });

        // MySQL enum — add `web` platform for browser FCM tokens.
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE devices MODIFY platform ENUM('ios', 'android', 'web') NOT NULL");
            DB::statement('ALTER TABLE devices MODIFY expo_push_token VARCHAR(191) NULL');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('devices')) {
            return;
        }

        Schema::table('devices', function (Blueprint $table) {
            if (Schema::hasColumn('devices', 'fcm_token')) {
                $table->dropColumn('fcm_token');
            }
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::table('devices')->where('platform', 'web')->delete();
            DB::statement("ALTER TABLE devices MODIFY platform ENUM('ios', 'android') NOT NULL");
        }
    }
};
