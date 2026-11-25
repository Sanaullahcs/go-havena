<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        // The first TIMESTAMP column auto-updates on every row change in MySQL,
        // so a failed OTP attempt was immediately expiring the code.
        DB::statement('ALTER TABLE phone_otps MODIFY expires_at DATETIME NOT NULL');
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE phone_otps MODIFY expires_at TIMESTAMP NOT NULL');
    }
};
