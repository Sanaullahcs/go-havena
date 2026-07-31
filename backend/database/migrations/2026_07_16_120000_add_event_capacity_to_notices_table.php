<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('notices', 'event_capacity')) {
            return;
        }

        Schema::table('notices', function (Blueprint $table) {
            if (Schema::hasColumn('notices', 'event_time_end')) {
                $table->unsignedInteger('event_capacity')->nullable()->after('event_time_end');
            } else {
                $table->unsignedInteger('event_capacity')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->dropColumn('event_capacity');
        });
    }
};
