<?php

namespace App\Console\Commands;

use App\Services\CommunityLifecycleService;
use Illuminate\Console\Command;

class DedupePendingCommunityRequestsCommand extends Command
{
    protected $signature = 'community:dedupe-pending-requests';

    protected $description = 'Reject duplicate pending community requests for the same phone number (keeps earliest).';

    public function handle(CommunityLifecycleService $lifecycle): int
    {
        $rejected = $lifecycle->dedupePendingCommunityRequests();

        $this->info($rejected === 0
            ? 'No duplicate pending community requests found.'
            : "Rejected {$rejected} duplicate pending community request(s).");

        return self::SUCCESS;
    }
}
