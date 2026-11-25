<?php

namespace Database\Seeders;

use App\Support\WellnessCategoryCatalog;
use Illuminate\Database\Seeder;

class WellnessCategorySeeder extends Seeder
{
    public function run(): void
    {
        WellnessCategoryCatalog::ensureInDatabase();

        $this->command?->info('WellnessCategorySeeder: W-E-L-L-S pillars ensured.');
    }
}
