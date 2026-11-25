<?php

namespace App\Console\Commands;

use App\Services\PlaidAchService;
use Illuminate\Console\Command;

class PlaidSyncEventsCommand extends Command
{
    protected $signature = 'plaid:sync-events {--pages=20 : Maximum pages of 500 events to fetch}';

    protected $description = 'Pull Plaid Transfer events after the last stored event and apply them';

    public function handle(PlaidAchService $ach): int
    {
        $result = $ach->syncEvents(max(1, (int) $this->option('pages')));

        if ($result['skipped']) {
            $this->line('Skipped: another sync is running, transfers are simulated, or Plaid is not configured.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Fetched %d new events (matched %d, unmatched %d, applied %d). Cursor %d.',
            $result['fetched'],
            $result['matched'],
            $result['unmatched'],
            $result['applied'],
            $result['cursor'],
        ));

        return self::SUCCESS;
    }
}
