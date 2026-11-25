<?php

namespace App\Console\Commands;

use App\Services\CommunityBillingService;
use Illuminate\Console\Command;

class PruneBillingReservationsCommand extends Command
{
    protected $signature = 'billing:prune-reservations';

    protected $description = 'Release expired community seat reservations and refresh subscription grace windows';

    public function handle(CommunityBillingService $billing): int
    {
        $released = $billing->releaseExpiredReservations();
        $this->info("Released {$released} expired seat reservation(s).");

        return self::SUCCESS;
    }
}
