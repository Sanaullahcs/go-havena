<?php

namespace App\Console\Commands;

use App\Services\PlaidService;
use Illuminate\Console\Command;

class PlaidStatusCommand extends Command
{
    protected $signature = 'plaid:status';

    protected $description = 'Show Plaid configuration status and verify Sandbox connectivity';

    public function handle(PlaidService $plaid): int
    {
        $this->line('Plaid environment: '.config('plaid.environment', 'sandbox'));
        $this->line('Plaid client ID: '.(filled(config('plaid.client_id')) ? 'set' : 'missing'));
        $this->line('Plaid secret: '.(filled(config('plaid.secret')) ? 'set' : 'missing'));
        $this->line('Plaid configured: '.($plaid->configured() ? 'yes' : 'no'));
        $this->line('Supported countries: '.implode(', ', config('plaid.supported_country_codes', ['US'])));

        if (! $plaid->configured()) {
            $this->newLine();
            $this->warn('Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV=sandbox in backend/.env');

            return self::FAILURE;
        }

        try {
            $client = $plaid->client();
            $client->institutions->list(1, 0, ['US']);
            $this->info('Plaid client initialized and Sandbox API responded successfully.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Plaid client failed: '.$e->getMessage());

            return self::FAILURE;
        }
    }
}
