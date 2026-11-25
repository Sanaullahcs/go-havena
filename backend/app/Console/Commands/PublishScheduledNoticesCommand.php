<?php

namespace App\Console\Commands;

use App\Services\ScheduledNoticeService;
use Illuminate\Console\Command;

class PublishScheduledNoticesCommand extends Command
{
    protected $signature = 'notices:publish-scheduled';

    protected $description = 'Publish notices and events whose scheduled_at time has passed';

    public function handle(): int
    {
        $count = ScheduledNoticeService::publishDue();

        $this->info("Published {$count} scheduled notice(s).");

        return self::SUCCESS;
    }
}
