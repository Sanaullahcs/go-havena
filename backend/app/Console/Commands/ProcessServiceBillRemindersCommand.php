<?php

namespace App\Console\Commands;

use App\Services\UnitServiceBillReminderService;
use App\Services\UnitServiceBillService;
use Illuminate\Console\Command;

class ProcessServiceBillRemindersCommand extends Command
{
    protected $signature = 'service-bills:process-reminders';

    protected $description = 'Generate due monthly and yearly service bills, mark overdue unit bills, and send reminders';

    public function handle(UnitServiceBillService $bills, UnitServiceBillReminderService $reminders): int
    {
        $generated = $bills->generateDueAutomaticBills();
        $result = $reminders->processReminders();

        $this->info("Generated {$generated['created_count']} automatic bill(s), marked {$result['overdue_marked']} overdue, and sent {$result['sent']} reminder(s).");

        return self::SUCCESS;
    }
}
