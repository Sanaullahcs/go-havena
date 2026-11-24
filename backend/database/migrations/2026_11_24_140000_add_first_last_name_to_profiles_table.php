<?php

use App\Support\PersonName;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->string('first_name', 50)->nullable()->after('display_name');
            $table->string('last_name', 50)->nullable()->after('first_name');
        });

        if (! Schema::hasTable('profiles')) {
            return;
        }

        DB::table('profiles')
            ->select(['id', 'display_name', 'first_name'])
            ->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    if (filled($row->first_name)) {
                        continue;
                    }
                    $display = trim((string) ($row->display_name ?? ''));
                    if ($display === '') {
                        continue;
                    }
                    [$first, $last] = PersonName::split($display);
                    DB::table('profiles')->where('id', $row->id)->update([
                        'first_name' => $first !== '' ? $first : null,
                        'last_name' => $last !== '' ? $last : null,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'last_name']);
        });
    }
};