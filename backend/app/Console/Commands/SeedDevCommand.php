<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class SeedDevCommand extends Command
{
    protected $signature = 'havena:seed-dev
                            {--community-admin-email=test.community.admin@havena.app : Dev community admin email}';

    protected $description = 'Reset dev login accounts and reseed regions/communities (run after tests or dashboard work)';

    public function handle(): int
    {
        $this->info('Ensuring system admin…');
        $code = $this->call('havena:ensure-system-admin');
        if ($code !== self::SUCCESS) {
            return $code;
        }

        $this->info('Seeding regions…');
        $this->call('db:seed', ['--class' => 'Database\\Seeders\\RegionSeeder', '--force' => true]);

        $this->info('Seeding communities…');
        $this->call('db:seed', ['--class' => 'Database\\Seeders\\CommunitySeeder', '--force' => true]);

        $email = (string) $this->option('community-admin-email');
        $this->info("Ensuring community admin {$email}…");
        $this->call('havena:ensure-community-admin', ['email' => $email]);

        $this->newLine();
        $this->info('Dev data ready.');
        $this->line('  System admin: admin@havena.app / password');
        $this->line("  Community admin: {$email} / OTP 123456 (local)");

        return self::SUCCESS;
    }
}
