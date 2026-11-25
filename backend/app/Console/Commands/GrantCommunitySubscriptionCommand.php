<?php

namespace App\Console\Commands;

use App\Models\Community;
use App\Services\CommunityBillingService;
use Illuminate\Console\Command;

class GrantCommunitySubscriptionCommand extends Command
{
    protected $signature = 'billing:grant
        {community_id : Community ID}
        {plan_slug=growth : Plan slug (starter|growth|campus)}
        {--interval=month : month|year}
        {--extra-seats=0 : Extra seats beyond plan limit}';

    protected $description = 'Manually grant/activate a community subscription (ops / local testing)';

    public function handle(CommunityBillingService $billing): int
    {
        $community = Community::query()->findOrFail((int) $this->argument('community_id'));
        $subscription = $billing->activateManualSubscription(
            $community,
            (string) $this->argument('plan_slug'),
            (string) $this->option('interval'),
        );

        $extra = (int) $this->option('extra-seats');
        if ($extra > 0) {
            $subscription->update(['extra_seats' => $extra]);
        }

        $this->info("Granted {$subscription->plan_slug} ({$subscription->status}) to community #{$community->id} with {$subscription->totalSeatLimit()} seats.");

        return self::SUCCESS;
    }
}
