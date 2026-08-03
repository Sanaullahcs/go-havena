<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ResetTestDbCommand extends Command
{
    protected $signature = 'havena:reset-test-db
                            {--force : Skip confirmation prompt}';

    protected $description = 'Clear all app data except the regions list and system admin login';

    /** @var list<string> */
    private const PRESERVE_TABLES = [
        'migrations',
        'regions',
    ];

    public function handle(): int
    {
        if (! $this->option('force') && ! $this->confirm(
            'Delete all app data except regions and system admin credentials?',
            false,
        )) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        $regionCount = DB::table('regions')->count();
        $driver = DB::connection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF');
        }

        $cleared = 0;
        foreach (Schema::getTables() as $table) {
            $name = $table['name'];

            if (in_array($name, self::PRESERVE_TABLES, true)) {
                continue;
            }

            DB::table($name)->truncate();
            $cleared++;
        }

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON');
        }

        $this->info("Truncated {$cleared} tables.");

        $code = $this->call('havena:ensure-system-admin');
        if ($code !== self::SUCCESS) {
            return $code;
        }

        $this->call('db:seed', ['--class' => 'Database\\Seeders\\WellnessCategorySeeder', '--force' => true]);

        $this->newLine();
        $this->info('Test database reset complete.');
        $this->line("  Regions kept: {$regionCount}");
        $this->line('  System admin: admin@havena.app / password');
        $this->line('  Wellness hub: W-E-L-L-S categories seeded (add courses and lessons in admin)');

        return self::SUCCESS;
    }
}
