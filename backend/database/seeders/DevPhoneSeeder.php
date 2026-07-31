<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Maps dummy phone numbers to existing test users.
 * In local env the OTP code is always 123456 (any phone).
 * This seeder just ensures users.phone is set so the
 * OtpController can find them after OTP verify.
 */
class DevPhoneSeeder extends Seeder
{
    private const PHONE_MAP = [
        '+15555550100' => 'test.resident@neighborlink.app',
        '+15555550200' => 'test.community.admin@neighborlink.app',
        '+15555555555' => 'sarah@neighborlink.app',    // legacy dev phone (555) 555-5555
        '+15555550002' => 'david@neighborlink.app',
        '+15555550003' => 'lisa@neighborlink.app',
        '+15555550004' => 'james@neighborlink.app',
        '+15555550005' => 'emily@neighborlink.app',
        '+15555550006' => 'michael@neighborlink.app',
        '+15555550007' => 'aisha@neighborlink.app',
        '+15555550008' => 'carlos@neighborlink.app',
        '+15555550009' => 'zara@neighborlink.app',     // pending
        '+15555550010' => 'tom@neighborlink.app',      // pending
        '+15555550011' => 'jake@neighborlink.app',     // suspended/banned
        '+15555550012' => 'nina@neighborlink.app',
        '+15555550013' => 'noah@neighborlink.app',
        '+15555550014' => 'fatima@neighborlink.app',
        '+15555550015' => 'lucas@neighborlink.app',
        '+15555550016' => 'amara@neighborlink.app',
        '+15555550017' => 'ryan@neighborlink.app',
        '+15555550018' => 'priya@neighborlink.app',
    ];

    public function run(): void
    {
        foreach (self::PHONE_MAP as $phone => $email) {
            $updated = DB::table('users')
                ->where('email', $email)
                ->update(['phone' => $phone, 'updated_at' => now()]);

            if ($updated) {
                $this->command->info("  Set phone {$phone} → {$email}");
            } else {
                $this->command->line("  Skipped: {$email} (phone already set or user not found)");
            }
        }

        $this->command->info('DevPhoneSeeder: complete.');
    }
}
