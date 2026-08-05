<?php

namespace App\Console\Commands;

use Database\Seeders\DemoContentSeeder;
use Database\Seeders\MobileTestAccountsSeeder;
use Illuminate\Console\Command;

class SeedDemoCommand extends Command
{
    protected $signature = 'havena:seed-demo
                            {--force-images : Regenerate demo seed images}';

    protected $description = 'Seed presentation-ready demo data (notices, events, feed, marketplace, deals, amenities)';

    public function handle(): int
    {
        $this->info('Linking public storage…');
        $this->call('storage:link', ['--force' => true]);

        $this->info('Generating demo seed images…');
        $script = base_path('scripts/generate-seed-images.php');
        if (! is_file($script)) {
            $this->error('Missing scripts/generate-seed-images.php');

            return self::FAILURE;
        }

        $args = escapeshellarg($script);
        if ($this->option('force-images')) {
            $args .= ' --force';
        }

        passthru(PHP_BINARY.' '.$args, $code);
        if ($code !== 0) {
            return self::FAILURE;
        }

        $this->info('Seeding demo content…');
        $this->call('db:seed', ['--class' => DemoContentSeeder::class, '--force' => true]);

        $this->info('Ensuring mobile test accounts…');
        $this->call('db:seed', ['--class' => MobileTestAccountsSeeder::class, '--force' => true]);

        $this->newLine();
        $this->info('Demo data ready.');
        $this->line('  Resident login:        (555) 555-0100  ·  OTP 123456');
        $this->line('  Community admin login: (555) 555-0200  ·  OTP 123456');
        $this->line('  Legacy resident:       (555) 555-5555  ·  OTP 123456');

        return self::SUCCESS;
    }
}
