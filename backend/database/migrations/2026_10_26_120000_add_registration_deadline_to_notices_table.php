<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            if (! Schema::hasColumn('notices', 'registration_deadline_date')) {
                $after = Schema::hasColumn('notices', 'event_time_end')
                    ? 'event_time_end'
                    : (Schema::hasColumn('notices', 'event_time') ? 'event_time' : 'event_date');
                $table->date('registration_deadline_date')->nullable()->after($after);
            }
            if (! Schema::hasColumn('notices', 'registration_deadline_time')) {
                $after = Schema::hasColumn('notices', 'registration_deadline_date')
                    ? 'registration_deadline_date'
                    : (Schema::hasColumn('notices', 'event_time_end') ? 'event_time_end' : 'event_date');
                $table->string('registration_deadline_time', 20)->nullable()->after($after);
            }
        });
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            if (Schema::hasColumn('notices', 'registration_deadline_time')) {
                $table->dropColumn('registration_deadline_time');
            }
            if (Schema::hasColumn('notices', 'registration_deadline_date')) {
                $table->dropColumn('registration_deadline_date');
            }
        });
    }
};
