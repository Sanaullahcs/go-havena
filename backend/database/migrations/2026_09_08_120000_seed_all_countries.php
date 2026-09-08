<?php

use App\Support\CountriesData;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('countries')) {
            return;
        }

        $exemptCodes = CountriesData::exemptCodes();
        $priorityCodes = ['US', 'PK', 'GB', 'CA', 'AE', 'SA', 'IN'];
        $now = now();

        foreach (CountriesData::all() as $index => $row) {
            $code = strtoupper($row['code']);
            $priority = array_search($code, $priorityCodes, true);
            $billingPolicy = in_array($code, $exemptCodes, true) ? 'exempt' : 'required';
            $sortOrder = $priority !== false ? $priority + 1 : 100 + $index;

            $existing = DB::table('countries')->where('code', $code)->first();

            if ($existing) {
                DB::table('countries')->where('id', $existing->id)->update([
                    'name' => $row['name'],
                    'billing_policy' => $billingPolicy,
                    'sort_order' => $sortOrder,
                    'status' => 'active',
                    'updated_at' => $now,
                ]);

                continue;
            }

            DB::table('countries')->insert([
                'code' => $code,
                'name' => $row['name'],
                'billing_policy' => $billingPolicy,
                'sort_order' => $sortOrder,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Keep seeded countries on rollback — only the initial US/PK pair existed before this migration.
    }
};
