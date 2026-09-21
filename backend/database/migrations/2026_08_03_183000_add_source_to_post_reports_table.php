<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            if (! Schema::hasColumn('post_reports', 'source')) {
                $table->string('source', 20)->default('resident')->after('reason');
            }
            if (! Schema::hasColumn('post_reports', 'type')) {
                $table->string('type', 40)->nullable()->after('source');
            }
        });

        // Prior post_reports rows came from admin "mark sensitive" actions.
        if (Schema::hasColumn('posts', 'is_sensitive') && Schema::hasColumn('post_reports', 'source')) {
            $adminReportIds = DB::table('post_reports')
                ->join('posts', 'posts.id', '=', 'post_reports.post_id')
                ->where('posts.is_sensitive', true)
                ->pluck('post_reports.id');

            if ($adminReportIds->isNotEmpty()) {
                DB::table('post_reports')
                    ->whereIn('id', $adminReportIds)
                    ->update(['source' => 'admin']);
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        Schema::table('post_reports', function (Blueprint $table) {
            if (Schema::hasColumn('post_reports', 'type')) {
                $table->dropColumn('type');
            }
            if (Schema::hasColumn('post_reports', 'source')) {
                $table->dropColumn('source');
            }
        });
    }
};
