<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Default W-E-L-L-S wellness pillars — admins may add and edit categories. */
class WellnessCategoryCatalog
{
    /** @var list<array{key: string, title: string, subtitle: string, icon_key: string, color: string, sort_order: int}> */
    public const CATEGORIES = [
        [
            'key'        => 'weight',
            'title'      => 'Weight & Diet',
            'subtitle'   => 'Nutrition and healthy eating',
            'icon_key'   => 'weight',
            'color'      => '#0052DF',
            'sort_order' => 1,
        ],
        [
            'key'        => 'exercise',
            'title'      => 'Exercise',
            'subtitle'   => 'Physical fitness programs',
            'icon_key'   => 'exercise',
            'color'      => '#84CC16',
            'sort_order' => 2,
        ],
        [
            'key'        => 'stress',
            'title'      => 'Lowering Stress',
            'subtitle'   => 'Mindfulness and relaxation',
            'icon_key'   => 'stress',
            'color'      => '#A855F7',
            'sort_order' => 3,
        ],
        [
            'key'        => 'learning',
            'title'      => 'Learning',
            'subtitle'   => 'Personal development',
            'icon_key'   => 'learning',
            'color'      => '#FDC700',
            'sort_order' => 4,
        ],
        [
            'key'        => 'social',
            'title'      => 'Social',
            'subtitle'   => 'Community connection and support',
            'icon_key'   => 'social',
            'color'      => '#F97316',
            'sort_order' => 5,
        ],
    ];

    /** Insert missing default pillars only — never overwrite admin edits. */
    public static function ensureInDatabase(): void
    {
        $now = now();

        foreach (self::CATEGORIES as $category) {
            $exists = DB::table('wellness_categories')->where('key', $category['key'])->exists();
            if ($exists) {
                continue;
            }

            DB::table('wellness_categories')->insert([
                'key'        => $category['key'],
                'title'      => $category['title'],
                'subtitle'   => $category['subtitle'],
                'icon_key'   => $category['icon_key'],
                'color'      => $category['color'],
                'sort_order' => $category['sort_order'],
                'status'     => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public static function keys(): array
    {
        return array_column(self::CATEGORIES, 'key');
    }

    public static function isStaticKey(string $key): bool
    {
        return in_array($key, self::keys(), true);
    }

    /** Build a unique category key from a title. */
    public static function uniqueKeyFromTitle(string $title, ?int $ignoreId = null): string
    {
        $base = Str::slug($title, '_');
        $base = preg_replace('/[^a-z0-9_]/', '', strtolower($base ?? '')) ?: 'category';
        $base = substr($base, 0, 32);

        $candidate = $base;
        $i = 2;
        while (
            DB::table('wellness_categories')
                ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                ->where('key', $candidate)
                ->exists()
        ) {
            $candidate = substr($base, 0, 28).'_'.$i;
            $i++;
        }

        return $candidate;
    }
}
