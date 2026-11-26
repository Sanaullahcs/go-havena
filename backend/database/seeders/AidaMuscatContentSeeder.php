<?php

namespace Database\Seeders;

use Database\Seeders\Support\AidaMuscatDemoContent;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo content for AIDA Muscat — English and Arabic, scoped to this community only.
 *
 * Run via AidaMuscatCommunitySeeder.
 */
class AidaMuscatContentSeeder extends Seeder
{
    public ?int $communityId = null;

    public function log(string $message): void
    {
        $this->command?->info($message);
    }

    public function run(): void
    {
        $community = $this->communityId
            ? DB::table('communities')->where('id', $this->communityId)->first()
            : DB::table('communities')->where('id', AidaMuscatCommunitySeeder::seededCommunityId())->first();

        if (! $community) {
            $this->command?->error('AidaMuscatContentSeeder: run AidaMuscatCommunitySeeder first.');

            return;
        }

        $runner = new AidaMuscatDemoContent($this, (int) $community->id);
        $runner->run();

        $this->command?->info('  AIDA Muscat content ready for community #'.$community->id.'.');
    }
}