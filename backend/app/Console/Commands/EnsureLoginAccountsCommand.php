<?php

namespace App\Console\Commands;

use App\Services\LocalLoginAccountRestorer;
use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class EnsureLoginAccountsCommand extends Command
{
    protected $signature = 'havena:ensure-login-accounts';

    protected $description = 'Restore platform and TGI community admin logins after migrate/test wipes';

    public function handle(LocalLoginAccountRestorer $restorer): int
    {
        if (! Schema::hasTable('users')) {
            $this->error('Users table is missing. Run migrations first.');

            return self::FAILURE;
        }

        try {
            $restorer->restoreUsers();
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Seeding TGI community login accounts…');
        $this->call('db:seed', [
            '--class' => TgiCommunitySeeder::class,
            '--force' => true,
        ]);

        $this->info('Login accounts ready.');
        $this->line('  Platform:  '.LocalLoginAccountRestorer::SYSTEM_ADMIN_EMAIL.' / '.LocalLoginAccountRestorer::SYSTEM_ADMIN_PASSWORD);
        $this->line('  Community: '.TgiCommunitySeeder::ADMIN_EMAIL.' / OTP 123456 (local)');

        return self::SUCCESS;
    }
}
