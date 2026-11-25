<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Smoother Per Community steps for Professional — marketing quotes at 500 vs 1,000
 * were jumping bands (249 → 749). These flats keep ~2× headcount closer to ~1.8× price.
 */
return new class extends Migration
{
    public function up(): void
    {
        $bookId = DB::table('saas_price_books')
            ->where('plan_slug', 'professional')
            ->where('billing_model', 'per_community')
            ->where('status', 'published')
            ->orderByDesc('version')
            ->value('id');

        if (! $bookId) {
            return;
        }

        $updates = [
            2 => 44900,   // 501–2,500 residents (was 74,900)
            3 => 129900,  // 2,501–10,000 (was 189,900)
        ];

        foreach ($updates as $sortOrder => $cents) {
            DB::table('saas_price_tiers')
                ->where('price_book_id', $bookId)
                ->where('sort_order', $sortOrder)
                ->update([
                    'fixed_amount_cents' => $cents,
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        $bookId = DB::table('saas_price_books')
            ->where('plan_slug', 'professional')
            ->where('billing_model', 'per_community')
            ->where('status', 'published')
            ->orderByDesc('version')
            ->value('id');

        if (! $bookId) {
            return;
        }

        $revert = [
            2 => 74900,
            3 => 189900,
        ];

        foreach ($revert as $sortOrder => $cents) {
            DB::table('saas_price_tiers')
                ->where('price_book_id', $bookId)
                ->where('sort_order', $sortOrder)
                ->update([
                    'fixed_amount_cents' => $cents,
                    'updated_at' => now(),
                ]);
        }
    }
};