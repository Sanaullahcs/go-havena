<?php

namespace App\Console\Commands;

use App\Services\AmenityBillReminderService;
use Illuminate\Console\Command;

class ProcessAmenityBillRemindersCommand extends Command
{
    protected $signature = 'amenity-bills:process-reminders';

    protected $description = 'Mark overdue shared amenity bills and send due-date reminders once each';

    public function handle(AmenityBillReminderService $reminders): int
    {
        $result = $reminders->processReminders();

        $this->info("Marked {$result['overdue_marked']} overdue bill(s) and sent {$result['sent']} reminder(s).");

        return self::SUCCESS;
    }
}
