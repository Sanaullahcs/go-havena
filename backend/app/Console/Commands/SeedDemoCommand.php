<?php

namespace App\Console\Commands;

use Database\Seeders\BostonDemoSeeder;
use Database\Seeders\CommunitySeeder;
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
        $publicStorage = public_path('storage');
        // Windows junctions are often not reported as is_link()/is_dir() by PHP.
        if (file_exists($publicStorage)) {
            $this->line('  Storage link already present.');
        } else {
            $this->call('storage:link');
        }

        $this->info('Downloading real demo photos…');
        $code = $this->downloadSeedPhotos();
        if ($code !== 0) {
            $this->warn('  Photo download had failures — falling back to any existing files.');
        }

        $this->info('Filling any missing seed images…');
        $code = $this->generateSeedImages();
        if ($code !== 0) {
            return self::FAILURE;
        }

        $this->syncSeedImagesToMobile();

        $this->info('Ensuring the Boston demo community and mobile test accounts…');
        $this->call('db:seed', ['--class' => CommunitySeeder::class, '--force' => true]);
        $this->call('db:seed', ['--class' => BostonDemoSeeder::class, '--force' => true]);
        $this->call('db:seed', ['--class' => MobileTestAccountsSeeder::class, '--force' => true]);

        $this->info('Seeding demo content…');
        $this->call('db:seed', ['--class' => DemoContentSeeder::class, '--force' => true]);

        $this->newLine();
        $this->info('Demo data ready. Showcase logins (OTP 221322):');
        $this->line('  Resident:        resident@gohavena.com');
        $this->line('  Community admin: community@gohavena.com');
        $this->line('  Community:       Harbor Point Residences, Boston Seaport');

        return self::SUCCESS;
    }

    private function downloadSeedPhotos(): int
    {
        $script = base_path('scripts/download-seed-photos.php');
        if (! is_file($script)) {
            $this->warn('  Missing scripts/download-seed-photos.php');

            return self::FAILURE;
        }

        $args = escapeshellarg($script);
        if ($this->option('force-images')) {
            $args .= ' --force';
        }

        passthru(PHP_BINARY.' '.$args, $code);

        return $code;
    }

    private function generateSeedImages(): int
    {
        $force = $this->option('force-images');

        if (PHP_OS_FAMILY === 'Windows') {
            $psScript = base_path('scripts/generate-seed-images.ps1');
            $phpScript = base_path('scripts/generate-seed-images.php');
            if (is_file($psScript)) {
                $forceArg = $force ? ' -Force' : '';
                passthru(
                    'powershell -NoProfile -ExecutionPolicy Bypass -File '
                    .escapeshellarg($psScript)
                    .$forceArg,
                    $code,
                );

                return $code;
            }
            if (is_file($phpScript)) {
                $args = escapeshellarg($phpScript).($force ? ' --force' : '');
                passthru(PHP_BINARY.' '.$args, $code);

                return $code;
            }
            $this->error('Missing scripts/generate-seed-images.ps1 (or .php)');

            return self::FAILURE;
        }

        $script = base_path('scripts/generate-seed-images.php');
        if (! is_file($script)) {
            $this->error('Missing scripts/generate-seed-images.php');

            return self::FAILURE;
        }

        $args = escapeshellarg($script);
        if ($force) {
            $args .= ' --force';
        }

        passthru(PHP_BINARY.' '.$args, $code);

        return $code;
    }

    /** Keep Expo bundled seed art in sync with backend/public disk demo JPEGs. */
    private function syncSeedImagesToMobile(): void
    {
        $from = storage_path('app/public/seed');
        $to = dirname(base_path()).DIRECTORY_SEPARATOR.'apps'.DIRECTORY_SEPARATOR.'mobile'.DIRECTORY_SEPARATOR.'assets'.DIRECTORY_SEPARATOR.'images'.DIRECTORY_SEPARATOR.'seed';

        if (! is_dir($from)) {
            $this->warn('  No seed image directory to sync.');

            return;
        }

        if (! is_dir($to) && ! mkdir($to, 0755, true) && ! is_dir($to)) {
            $this->warn('  Could not create mobile seed assets folder.');

            return;
        }

        $copied = 0;
        foreach (glob($from.DIRECTORY_SEPARATOR.'*.jpg') ?: [] as $file) {
            $name = basename($file);
            if (@copy($file, $to.DIRECTORY_SEPARATOR.$name)) {
                $copied++;
            }
        }

        $this->line("  Synced {$copied} seed images → apps/mobile/assets/images/seed");
    }
}
