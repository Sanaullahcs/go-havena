<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Maps optional contact phones onto existing email-login test users.
 * Sign-in is email OTP (123456 in local/uat). Phone is contact-only.
 */
class DevPhoneSeeder extends Seeder
{
    private const PHONE_MAP = [
        '+15555550100' => 'test.resident@havena.app',
        '+15555550200' => 'test.community.admin@havena.app',
        '+15555555555' => 'sarah@havena.app',    // legacy dev phone (555) 555-5555
        '+15555550002' => 'david@havena.app',
        '+15555550003' => 'lisa@havena.app',
        '+15555550004' => 'james@havena.app',
        '+15555550005' => 'emily@havena.app',
        '+15555550006' => 'michael@havena.app',
        '+15555550007' => 'aisha@havena.app',
        '+15555550008' => 'carlos@havena.app',
        '+15555550009' => 'zara@havena.app',     // pending
        '+15555550010' => 'tom@havena.app',      // pending
        '+15555550011' => 'jake@havena.app',     // suspended/banned
        '+15555550012' => 'nina@havena.app',
        '+15555550013' => 'noah@havena.app',
        '+15555550014' => 'fatima@havena.app',
        '+15555550015' => 'lucas@havena.app',
        '+15555550016' => 'amara@havena.app',
        '+15555550017' => 'ryan@havena.app',
        '+15555550018' => 'priya@havena.app',
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
