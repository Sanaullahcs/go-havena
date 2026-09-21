<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable()->after('community_id');
            $table->enum('review_status', ['pending', 'approved', 'rejected'])->default('approved')->after('status');
            $table->time('start_time')->nullable()->after('hours');
            $table->time('end_time')->nullable()->after('start_time');
            $table->boolean('weekends_available')->default(true)->after('end_time');
            $table->unsignedSmallInteger('slot_duration_minutes')->nullable()->after('weekends_available');

            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['community_id', 'review_status']);
        });

        // Existing amenities are treated as already approved; bookable ones get 60-min slots.
        DB::table('amenities')->update([
            'review_status' => 'approved',
            'weekends_available' => true,
        ]);

        DB::table('amenities')
            ->where('status', 'bookable')
            ->whereNull('slot_duration_minutes')
            ->update(['slot_duration_minutes' => 60]);

        // Best-effort parse of free-text hours like "6:00 AM – 10:00 PM"
        $rows = DB::table('amenities')->whereNull('start_time')->whereNotNull('hours')->get();
        foreach ($rows as $row) {
            $parsed = $this->parseHoursRange((string) $row->hours);
            if ($parsed) {
                DB::table('amenities')->where('id', $row->id)->update([
                    'start_time' => $parsed[0],
                    'end_time' => $parsed[1],
                ]);
            }
        }

        // Allow open-availability bookings without a timed slot.
        DB::statement('ALTER TABLE bookings MODIFY time_slot VARCHAR(50) NULL');
    }

    public function down(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropIndex(['community_id', 'review_status']);
            $table->dropColumn([
                'created_by',
                'review_status',
                'start_time',
                'end_time',
                'weekends_available',
                'slot_duration_minutes',
            ]);
        });
    }

    private function parseHoursRange(string $hours): ?array
    {
        $normalized = str_replace(['–', '—'], '-', $hours);
        if (! preg_match('/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i', $normalized, $m)) {
            return null;
        }

        try {
            $start = date('H:i:s', strtotime($m[1]));
            $end = date('H:i:s', strtotime($m[2]));

            return $start && $end ? [$start, $end] : null;
        } catch (\Throwable) {
            return null;
        }
    }
};
