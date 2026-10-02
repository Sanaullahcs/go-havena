<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_feature_flags', function (Blueprint $table) {
            $table->string('disabled_by', 32)->nullable()->after('enabled');
        });

        if (Schema::hasTable('community_feature_disable_requests')) {
            $approved = DB::table('community_feature_disable_requests')
                ->where('status', 'approved')
                ->get(['community_id', 'feature_key']);

            foreach ($approved as $row) {
                DB::table('community_feature_flags')
                    ->where('community_id', $row->community_id)
                    ->where('feature_key', $row->feature_key)
                    ->where('enabled', false)
                    ->whereNull('disabled_by')
                    ->update(['disabled_by' => 'community_admin']);
            }
        }

        DB::table('community_feature_flags')
            ->where('enabled', false)
            ->whereNull('disabled_by')
            ->update(['disabled_by' => 'system_admin']);
    }

    public function down(): void
    {
        Schema::table('community_feature_flags', function (Blueprint $table) {
            $table->dropColumn('disabled_by');
        });
    }
};
