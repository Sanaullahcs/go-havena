<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('regions', function (Blueprint $table) {
            if (! Schema::hasColumn('regions', 'state_id')) {
                $table->foreignId('state_id')->nullable()->after('state')->constrained('states')->nullOnDelete();
            }
        });

        $this->backfillGeography();
    }

    public function down(): void
    {
        Schema::table('regions', function (Blueprint $table) {
            if (Schema::hasColumn('regions', 'state_id')) {
                $table->dropConstrainedForeignId('state_id');
            }
        });
    }

    private function backfillGeography(): void
    {
        if (! Schema::hasTable('countries') || ! Schema::hasTable('states')) {
            return;
        }

        $now = now();

        $usId = DB::table('countries')->where('code', 'US')->value('id');
        if (! $usId) {
            $usId = DB::table('countries')->insertGetId([
                'code' => 'US',
                'name' => 'United States',
                'billing_policy' => 'required',
                'sort_order' => 1,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $pkId = DB::table('countries')->where('code', 'PK')->value('id');
        if (! $pkId) {
            $pkId = DB::table('countries')->insertGetId([
                'code' => 'PK',
                'name' => 'Pakistan',
                'billing_policy' => 'exempt',
                'sort_order' => 2,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $usStates = [
            'Florida', 'California', 'Texas', 'New York', 'Georgia', 'Illinois',
            'Washington', 'Arizona', 'Colorado', 'Nevada', 'Massachusetts',
            'Pennsylvania', 'North Carolina', 'Virginia',
        ];

        $pkStates = [
            'Punjab', 'Sindh', 'Islamabad', 'Khyber Pakhtunkhwa', 'Balochistan',
        ];

        $stateIds = [];

        foreach ($usStates as $i => $name) {
            $existing = DB::table('states')->where('country_id', $usId)->where('name', $name)->value('id');
            $stateIds['US:'.$name] = $existing ?: DB::table('states')->insertGetId([
                'country_id' => $usId,
                'name' => $name,
                'sort_order' => $i + 1,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        foreach ($pkStates as $i => $name) {
            $existing = DB::table('states')->where('country_id', $pkId)->where('name', $name)->value('id');
            $stateIds['PK:'.$name] = $existing ?: DB::table('states')->insertGetId([
                'country_id' => $pkId,
                'name' => $name,
                'sort_order' => $i + 1,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $regions = DB::table('regions')->get(['id', 'title', 'state']);

        foreach ($regions as $region) {
            $title = (string) $region->title;
            $stateName = trim((string) ($region->state ?? ''));

            if (str_starts_with($title, 'Pakistan -')) {
                $key = 'PK:'.$stateName;
                if (isset($stateIds[$key])) {
                    DB::table('regions')->where('id', $region->id)->update(['state_id' => $stateIds[$key]]);
                }

                continue;
            }

            if ($stateName !== '') {
                $key = 'US:'.$stateName;
                if (isset($stateIds[$key])) {
                    DB::table('regions')->where('id', $region->id)->update(['state_id' => $stateIds[$key]]);
                }
            }
        }
    }
};
