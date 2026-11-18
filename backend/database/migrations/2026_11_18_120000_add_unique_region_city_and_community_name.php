<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->mergeDuplicateRegions();

        Schema::table('regions', function (Blueprint $table) {
            $table->unique(['state_id', 'area'], 'regions_state_id_area_unique');
        });

        Schema::table('communities', function (Blueprint $table) {
            $table->unique('name', 'communities_name_unique');
        });
    }

    public function down(): void
    {
        Schema::table('communities', function (Blueprint $table) {
            $table->dropUnique('communities_name_unique');
        });

        Schema::table('regions', function (Blueprint $table) {
            $table->dropUnique('regions_state_id_area_unique');
        });
    }

    private function mergeDuplicateRegions(): void
    {
        if (! Schema::hasTable('regions') || ! Schema::hasColumn('regions', 'state_id')) {
            return;
        }

        $rows = DB::table('regions')
            ->whereNotNull('state_id')
            ->orderBy('id')
            ->get(['id', 'state_id', 'area', 'title']);

        $keepers = [];
        foreach ($rows as $row) {
            $area = trim((string) $row->area);
            if ($area === '' || ! $row->state_id) {
                continue;
            }

            $key = (int) $row->state_id.'|'.mb_strtolower($area);
            if (! isset($keepers[$key])) {
                $keepers[$key] = (int) $row->id;

                continue;
            }

            $keepId = $keepers[$key];
            $dropId = (int) $row->id;

            if (Schema::hasTable('communities') && Schema::hasColumn('communities', 'region_id')) {
                DB::table('communities')->where('region_id', $dropId)->update(['region_id' => $keepId]);
            }

            if (Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'region_id')) {
                DB::table('profiles')->where('region_id', $dropId)->update(['region_id' => $keepId]);
            }

            DB::table('regions')->where('id', $dropId)->delete();
        }
    }
};