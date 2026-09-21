<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_rule_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('community_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->timestamps();
            $table->unique(['community_id', 'name']);
        });

        // Seed existing rule category names so admins can manage them immediately.
        $rows = DB::table('community_rules')
            ->whereNull('deleted_at')
            ->select('community_id', 'category')
            ->distinct()
            ->get();

        $now = now();
        foreach ($rows as $row) {
            $name = trim((string) $row->category);
            if ($name === '') {
                continue;
            }
            DB::table('community_rule_categories')->insertOrIgnore([
                'community_id' => $row->community_id,
                'name'         => $name,
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('community_rule_categories');
    }
};
