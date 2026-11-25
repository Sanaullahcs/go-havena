<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('notices', 'event_end_date')) {
            Schema::table('notices', function (Blueprint $table) {
                $after = Schema::hasColumn('notices', 'event_date') ? 'event_date' : 'body';
                $table->date('event_end_date')->nullable()->after($after);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('notices', 'event_end_date')) {
            Schema::table('notices', function (Blueprint $table) {
                $table->dropColumn('event_end_date');
            });
        }
    }
};
