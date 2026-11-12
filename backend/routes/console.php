<?php

use App\Services\AgreementService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('agreements:remind', function () {
    $sent = app(AgreementService::class)->sendDueReminders();
    $this->info('Reminders sent: '.$sent);
})->purpose('Remind residents with unsigned agreements due within three days');

Schedule::command('agreements:remind')->dailyAt('09:00');
