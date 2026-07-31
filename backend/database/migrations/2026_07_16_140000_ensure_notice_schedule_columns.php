<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Repairs notices tables where schedule/detail columns were never migrated
 * (e.g. partial deploy or migration marked run without event_time_end).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('notices')) {
            return;
        }

        if (! Schema::hasColumn('notices', 'location')) {
            Schema::table('notices', function (Blueprint $table) {
                $table->string('location', 255)->nullable()->after('body');
            });
        }

        if (! Schema::hasColumn('notices', 'image_url')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'location') ? 'location' : 'body';
                $table->string('image_url', 512)->nullable()->after($after);
            });
        }

        if (! Schema::hasColumn('notices', 'event_date')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'image_url') ? 'image_url' : 'body';
                $table->date('event_date')->nullable()->after($after);
            });
        }

        if (! Schema::hasColumn('notices', 'event_time')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'event_date') ? 'event_date' : 'body';
                $table->string('event_time', 20)->nullable()->after($after);
            });
        }

        if (! Schema::hasColumn('notices', 'event_time_end')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'event_time') ? 'event_time' : 'body';
                $table->string('event_time_end', 20)->nullable()->after($after);
            });
        }

        if (! Schema::hasColumn('notices', 'event_capacity')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'event_time_end')
                    ? 'event_time_end'
                    : (Schema::hasColumn('notices', 'event_time') ? 'event_time' : null);
                if ($after) {
                    $table->unsignedInteger('event_capacity')->nullable()->after($after);
                } else {
                    $table->unsignedInteger('event_capacity')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        // Intentionally no-op: this migration only backfills missing columns.
    }
};
