<?php

namespace App\Console\Commands;

use App\Models\PlaidTransfer;
use App\Services\PlaidAchService;
use Illuminate\Console\Command;

/** Safety net when webhooks are missed: re-read unresolved transfers from `/transfer/get`. */
class PlaidReconcileCommand extends Command
{
    protected $signature = 'plaid:reconcile {--limit=100} {--older-than=30 : Minutes since the last sync}';

    protected $description = 'Refresh unresolved Plaid transfers and refunds from Plaid';

    public function handle(PlaidAchService $ach): int
    {
        $cutoff = now()->subMinutes(max(1, (int) $this->option('older-than')));

        $transfers = PlaidTransfer::query()
            ->where('simulated', false)
            ->whereNotNull('debit_transfer_id')
            ->where(fn ($q) => $q
                ->whereIn('status', [PlaidTransfer::STATUS_PROCESSING, PlaidTransfer::STATUS_POSTED])
                ->orWhereIn('refund_status', [PlaidTransfer::REFUND_PENDING, PlaidTransfer::REFUND_POSTED])
                ->orWhere('exception_code', PlaidTransfer::EXCEPTION_REFUND_UNKNOWN))
            ->where(fn ($q) => $q->whereNull('last_synced_at')->orWhere('last_synced_at', '<', $cutoff))
            ->orderBy('last_synced_at')
            ->limit(max(1, (int) $this->option('limit')))
            ->get();

        foreach ($transfers as $transfer) {
            $ach->refreshFromProvider($transfer);
        }

        $this->info('Refreshed '.$transfers->count().' transfer(s).');

        return self::SUCCESS;
    }
}
