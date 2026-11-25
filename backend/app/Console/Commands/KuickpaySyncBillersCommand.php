<?php

namespace App\Console\Commands;

use App\Services\Kuickpay\KuickpayGateway;
use App\Services\Kuickpay\UtilityBillerCatalog;
use Illuminate\Console\Command;

class KuickpaySyncBillersCommand extends Command
{
    protected $signature = 'kuickpay:sync-billers';

    protected $description = 'Refresh the supported utility biller catalog from KuickPay GetBillers.';

    public function handle(KuickpayGateway $gateway): int
    {
        if ($gateway->isSimulated()) {
            $count = UtilityBillerCatalog::upsertDefaults();
            $this->info("Sandbox: {$count} default billers ready.");

            return self::SUCCESS;
        }

        $remote = $gateway->getBillers();
        if ($remote === []) {
            // Keep the cached catalog; an outage must not disable every biller.
            $this->warn('KuickPay returned no billers. Catalog left unchanged.');

            return self::SUCCESS;
        }

        $disabled = UtilityBillerCatalog::applyRemote($remote);
        $this->info(count($remote).' billers synced, '.$disabled.' no longer offered.');

        return self::SUCCESS;
    }
}
