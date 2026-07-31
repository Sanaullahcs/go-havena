<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wellness_lessons', function (Blueprint $table) {
            $table->string('link_url', 512)->nullable()->after('video_url');
            $table->string('file_path', 512)->nullable()->after('link_url');
            $table->json('key_takeaways')->nullable()->after('file_path');
        });

        // Backfill link_url from existing video_url values.
        DB::table('wellness_lessons')
            ->whereNotNull('video_url')
            ->where('video_url', '!=', '')
            ->update([
                'link_url' => DB::raw('video_url'),
            ]);
    }

    public function down(): void
    {
        Schema::table('wellness_lessons', function (Blueprint $table) {
            $table->dropColumn(['link_url', 'file_path', 'key_takeaways']);
        });
    }
};
