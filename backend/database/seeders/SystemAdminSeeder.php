<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Ensures the platform system admin exists with known dev credentials.
 * Email: admin@neighborlink.app  Password: password
 */
class SystemAdminSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['email' => 'admin@neighborlink.app'],
            [
                'name'     => 'Admin User',
                'password' => 'password',
                'status'   => 'active',
                'role'     => 'system_admin',
            ],
        );

        $this->command?->info('SystemAdminSeeder: admin@neighborlink.app / password (system_admin)');
    }
}
