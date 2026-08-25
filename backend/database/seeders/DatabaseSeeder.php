<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            MainSeeder::class,
            SystemAdminSeeder::class,
            DevPhoneSeeder::class,
            MobileTestAccountsSeeder::class,
            FeedEngagementSeeder::class,
            // Rich presentation demo (notices/events/feed/listings with /storage/seed images).
            DemoContentSeeder::class,
            FamilySeeder::class,
            GuestInvitationSeeder::class,
        ]);
    }
}
