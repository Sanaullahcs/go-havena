<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('transactional_email_sends')) {
            return;
        }

        $indexes = collect(DB::select('SHOW INDEX FROM transactional_email_sends'))
            ->where('Non_unique', 0)
            ->groupBy('Key_name');

        foreach ($indexes as $name => $rows) {
            if ($name === 'PRIMARY') {
                continue;
            }

            $columns = collect($rows)->pluck('Column_name');
            if ($columns->contains('mail_type') && $columns->contains('context_key')) {
                Schema::table('transactional_email_sends', function (Blueprint $table) use ($name) {
                    $table->dropUnique($name);
                });
            }
        }

        DB::statement('ALTER TABLE transactional_email_sends MODIFY mail_type VARCHAR(64) NOT NULL');
        DB::statement('ALTER TABLE transactional_email_sends MODIFY context_key VARCHAR(120) NOT NULL');

        $remaining = collect(DB::select('SHOW INDEX FROM transactional_email_sends'))
            ->pluck('Key_name');

        if (! $remaining->contains('tes_mail_type_context_unique')) {
            Schema::table('transactional_email_sends', function (Blueprint $table) {
                $table->unique(['mail_type', 'context_key'], 'tes_mail_type_context_unique');
            });
        }
    }

    public function down(): void
    {
        // Keep the shorter unique key. Recreating the original utf8mb4 80+191
        // index exceeds MySQL's 1000-byte limit on this server.
    }
};
