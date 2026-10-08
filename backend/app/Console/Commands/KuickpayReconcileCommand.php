<?php

namespace App\Console\Commands;

use App\Services\Payments\PaymentOrchestrator;
use Illuminate\Console\Command;

class KuickpayReconcileCommand extends Command
{
    protected $signature = 'kuickpay:reconcile {--limit=100 : Maximum attempts to check in one run}';

    protected $description = 'Expire abandoned KuickPay checkouts and confirm payments whose outcome is still unknown.';

    public function handle(PaymentOrchestrator $orchestrator): int
    {
        $count = $orchestrator->reconcileDue(max(1, (int) $this->option('limit')));
        $this->info("Checked {$count} KuickPay payment(s).");

        return self::SUCCESS;
    }
}
