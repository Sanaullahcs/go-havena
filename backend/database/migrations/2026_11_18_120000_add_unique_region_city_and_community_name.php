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
        $this->disambiguateDuplicateCommunityNames();

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

    private function disambiguateDuplicateCommunityNames(): void
    {
        if (! Schema::hasTable('communities') || ! Schema::hasColumn('communities', 'name')) {
            return;
        }

        $memberCounts = [];
        if (Schema::hasTable('community_memberships') && Schema::hasColumn('community_memberships', 'community_id')) {
            $memberCounts = DB::table('community_memberships')
                ->select('community_id', DB::raw('COUNT(*) as members'))
                ->groupBy('community_id')
                ->pluck('members', 'community_id')
                ->all();
        }

        $groups = [];
        $rows = DB::table('communities')->orderBy('id')->get(['id', 'name', 'status', 'review_status']);
        foreach ($rows as $row) {
            $groups[mb_strtolower(trim((string) $row->name))][] = $row;
        }

        foreach ($groups as $group) {
            if (count($group) < 2) {
                continue;
            }

            usort($group, function ($left, $right) use ($memberCounts) {
                $score = function ($row) use ($memberCounts) {
                    $rank = ($row->status === 'active' ? 2 : 0) + ($row->review_status === 'approved' ? 1 : 0);

                    return [$rank, (int) ($memberCounts[$row->id] ?? 0), -1 * (int) $row->id];
                };

                return $score($right) <=> $score($left);
            });

            $keep = array_shift($group);
            $keepName = trim((string) $keep->name);
            if ($keepName === '') {
                $keepName = 'Community '.$keep->id;
            }
            if ($keepName !== (string) $keep->name) {
                DB::table('communities')->where('id', $keep->id)->update(['name' => $keepName]);
            }

            foreach ($group as $row) {
                $base = trim((string) $row->name);
                if ($base === '') {
                    $base = 'Community';
                }
                $suffix = ' ('.$row->id.')';
                $name = mb_substr($base, 0, 150 - mb_strlen($suffix)).$suffix;
                DB::table('communities')->where('id', $row->id)->update(['name' => $name]);
            }
        }
    }
};