<?php

use App\Support\Currency;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Communities display money in their own currency. The column is an explicit
 * override; a null value means "derive from the region's country", so existing
 * rows keep working without a backfill being correct forever.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('communities', 'currency')) {
            Schema::table('communities', function (Blueprint $table) {
                $table->char('currency', 3)->nullable()->after('timezone');
            });
        }

        // Seed the override from each community's country so existing rows are
        // explicit and visible in the admin UI from day one.
        $rows = DB::table('communities')
            ->leftJoin('regions', 'regions.id', '=', 'communities.region_id')
            ->leftJoin('states', 'states.id', '=', 'regions.state_id')
            ->leftJoin('countries', 'countries.id', '=', 'states.country_id')
            ->select('communities.id', 'countries.code as country_code', 'regions.title as region_title')
            ->get();

        foreach ($rows as $row) {
            $code = $row->country_code;

            if (! $code) {
                // Legacy rows with no state_id: fall back to the region title.
                $code = str_contains(mb_strtolower((string) $row->region_title), 'pakistan') ? 'PK' : 'US';
            }

            DB::table('communities')
                ->where('id', $row->id)
                ->update(['currency' => Currency::forCountry($code)]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('communities', 'currency')) {
            Schema::table('communities', function (Blueprint $table) {
                $table->dropColumn('currency');
            });
        }
    }
};
