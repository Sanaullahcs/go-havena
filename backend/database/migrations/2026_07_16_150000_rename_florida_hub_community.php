<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const OLD_NAME = 'Florida Hub';

    private const NEW_NAME = 'Florida Main Street';

    public function up(): void
    {
        if (! Schema::hasTable('communities')) {
            return;
        }

        DB::table('communities')
            ->where('name', self::OLD_NAME)
            ->update([
                'name' => self::NEW_NAME,
                'updated_at' => now(),
            ]);

        if (Schema::hasTable('activity_logs') && Schema::hasColumn('activity_logs', 'description')) {
            DB::table('activity_logs')
                ->where('description', 'like', '%' . self::OLD_NAME . '%')
                ->update([
                    'description' => DB::raw(
                        "REPLACE(description, '" . self::OLD_NAME . "', '" . self::NEW_NAME . "')"
                    ),
                    'updated_at' => now(),
                ]);
        }

        if (Schema::hasTable('app_notifications') && Schema::hasColumn('app_notifications', 'body')) {
            DB::table('app_notifications')
                ->where('body', 'like', '%' . self::OLD_NAME . '%')
                ->update([
                    'body' => DB::raw(
                        "REPLACE(body, '" . self::OLD_NAME . "', '" . self::NEW_NAME . "')"
                    ),
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('communities')) {
            return;
        }

        DB::table('communities')
            ->where('name', self::NEW_NAME)
            ->update([
                'name' => self::OLD_NAME,
                'updated_at' => now(),
            ]);

        if (Schema::hasTable('activity_logs') && Schema::hasColumn('activity_logs', 'description')) {
            DB::table('activity_logs')
                ->where('description', 'like', '%' . self::NEW_NAME . '%')
                ->update([
                    'description' => DB::raw(
                        "REPLACE(description, '" . self::NEW_NAME . "', '" . self::OLD_NAME . "')"
                    ),
                    'updated_at' => now(),
                ]);
        }

        if (Schema::hasTable('app_notifications') && Schema::hasColumn('app_notifications', 'body')) {
            DB::table('app_notifications')
                ->where('body', 'like', '%' . self::NEW_NAME . '%')
                ->update([
                    'body' => DB::raw(
                        "REPLACE(body, '" . self::NEW_NAME . "', '" . self::OLD_NAME . "')"
                    ),
                    'updated_at' => now(),
                ]);
        }
    }
};
