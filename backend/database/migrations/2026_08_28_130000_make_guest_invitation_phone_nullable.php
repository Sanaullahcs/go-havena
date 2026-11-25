<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('guest_invitations') || ! Schema::hasColumn('guest_invitations', 'guest_phone')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE guest_invitations MODIFY guest_phone VARCHAR(30) NULL');
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE guest_invitations ALTER COLUMN guest_phone DROP NOT NULL');
            return;
        }

        if ($driver === 'sqlite') {
            // SQLite ignores NOT NULL changes in this environment; new rows already accept nulls in tests.
            return;
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('guest_invitations') || ! Schema::hasColumn('guest_invitations', 'guest_phone')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE guest_invitations MODIFY guest_phone VARCHAR(30) NOT NULL');
            return;
        }

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE guest_invitations ALTER COLUMN guest_phone SET NOT NULL');
        }
    }
};
