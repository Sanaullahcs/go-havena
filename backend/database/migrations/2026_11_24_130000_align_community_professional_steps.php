<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Round Per Community Professional flats so marketing tiers read as one ladder:
 * $109 → $199 → $399 → $999 (example sizes 50, 500, 1,000, 5,000).
 */
return new class extends Migration
{
    private function bookId(): ?int
    {
        return DB::table('saas_price_books')
            ->where('plan_slug', 'professional')
            ->where('billing_model', 'per_community')
            ->where('status', 'published')
            ->orderByDesc('version')
            ->value('id');
    }

    public function up(): void
    {
        $bookId = $this->bookId();
        if (! $bookId) {
            return;
        }

        foreach ([1 => 19900, 2 => 39900, 3 => 99900] as $sortOrder => $cents) {
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
        $bookId = $this->bookId();
        if (! $bookId) {
            return;
        }

        foreach ([1 => 24900, 2 => 44900, 3 => 129900] as $sortOrder => $cents) {
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