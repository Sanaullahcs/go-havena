<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            if (! Schema::hasColumn('notices', 'location')) {
                $table->string('location', 255)->nullable()->after('body');
            }
            if (! Schema::hasColumn('notices', 'image_url')) {
                $table->string('image_url', 512)->nullable()->after('location');
            }
            if (! Schema::hasColumn('notices', 'event_date')) {
                $table->date('event_date')->nullable()->after('image_url');
            }
            if (! Schema::hasColumn('notices', 'event_time')) {
                $table->string('event_time', 20)->nullable()->after('event_date');
            }
            if (! Schema::hasColumn('notices', 'event_time_end')) {
                $table->string('event_time_end', 20)->nullable()->after('event_time');
            }
        });
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->dropColumn(['location', 'image_url', 'event_date', 'event_time', 'event_time_end']);
        });
    }
};
