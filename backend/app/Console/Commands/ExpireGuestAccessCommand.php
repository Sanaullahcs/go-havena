<?php

namespace App\Console\Commands;

use App\Models\GuestInvitation;
use App\Services\GuestAccessService;
use Illuminate\Console\Command;

class ExpireGuestAccessCommand extends Command
{
    protected $signature = 'guests:expire-access';

    protected $description = 'Expire guest invitations past their end date and revoke tokens';

    public function handle(): int
    {
        $expired = GuestInvitation::query()
            ->whereIn('status', ['active', 'pending_approval', 'pending_verification'])
            ->where('ends_at', '<', now())
            ->get();

        foreach ($expired as $invitation) {
            GuestAccessService::expireInvitation($invitation);
        }

        $this->info("Expired {$expired->count()} guest invitation(s).");

        return self::SUCCESS;
    }
}
