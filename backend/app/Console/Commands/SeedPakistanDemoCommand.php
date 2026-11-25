<?php

namespace App\Console\Commands;

use Database\Seeders\PakistanCommunitySeeder;
use Database\Seeders\TgiCommunitySeeder;
use Illuminate\Console\Command;

class SeedPakistanDemoCommand extends Command
{
    protected $signature = 'havena:seed-pakistan-demo
                            {--force-images : Regenerate demo seed images}';

    protected $description = 'Seed presentation demo data for Pakistan - Lahore (TGI community)';

    public function handle(): int
    {
        $this->info('Linking public storage…');
        $publicStorage = public_path('storage');
        if (file_exists($publicStorage)) {
            $this->line('  Storage link already present.');
        } else {
            $this->call('storage:link');
        }

        $this->info('Downloading demo photos…');
        $this->downloadSeedPhotos();

        $this->info('Filling seed images…');
        if ($this->generateSeedImages() !== 0) {
            return self::FAILURE;
        }

        $this->syncSeedImagesToMobile();

        $this->info('Seeding Pakistan (Lahore) community and demo content…');
        $this->call('db:seed', [
            '--class' => PakistanCommunitySeeder::class,
            '--force' => true,
        ]);

        $this->newLine();
        $this->info('Pakistan demo logins (OTP 123456 on web and mobile):');
        $this->line('  Community admin: '.TgiCommunitySeeder::ADMIN_EMAIL);
        $this->line('  Resident:        '.TgiCommunitySeeder::RESIDENTS[0]['email']);
        $this->line('  Region:          Pakistan - Lahore');
        $this->line('  Community:       '.TgiCommunitySeeder::COMMUNITY_NAME.' — '.TgiCommunitySeeder::COMMUNITY_ADDRESS);
        $this->line('  Password (if prompted): password');

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
