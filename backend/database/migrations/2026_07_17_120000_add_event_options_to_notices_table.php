<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            if (! Schema::hasColumn('notices', 'is_pinned')) {
                $table->boolean('is_pinned')->default(false)->after('event_capacity');
            }
            if (! Schema::hasColumn('notices', 'scheduled_at')) {
                $table->timestamp('scheduled_at')->nullable()->after('published_at');
            }
            if (! Schema::hasColumn('notices', 'requires_rsvp')) {
                $table->boolean('requires_rsvp')->default(false)->after('is_pinned');
            }
        });

        // Existing events keep RSVP enabled (matches prior always-on behavior).
        DB::table('notices')
            ->where('category', 'event')
            ->update(['requires_rsvp' => true]);
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            if (Schema::hasColumn('notices', 'requires_rsvp')) {
                $table->dropColumn('requires_rsvp');
            }
            if (Schema::hasColumn('notices', 'scheduled_at')) {
                $table->dropColumn('scheduled_at');
            }
            if (Schema::hasColumn('notices', 'is_pinned')) {
                $table->dropColumn('is_pinned');
            }
        });
    }
};
