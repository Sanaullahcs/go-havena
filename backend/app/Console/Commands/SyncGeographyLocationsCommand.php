<?php

namespace App\Console\Commands;

use App\Services\LocationCatalog;
use Database\Seeders\GeographySeeder;
use Illuminate\Console\Command;

class SyncGeographyLocationsCommand extends Command
{
    protected $signature = 'geography:sync-locations';

    protected $description = 'Seed countries/states and open statewide regions for signup and community creation.';

    public function handle(LocationCatalog $catalog): int
    {
        $this->info('Seeding countries and states…');
        $this->callSilent(GeographySeeder::class);

        $this->info('Opening statewide regions for priority countries…');
        $count = $catalog->syncPriorityStateRegions();
        $this->info("Ready: {$count} state locations.");

        return self::SUCCESS;
    }
}
