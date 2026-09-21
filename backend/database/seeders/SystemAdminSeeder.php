<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Ensures the platform system admin exists with known dev credentials.
 * Email: admin@havena.app  Password: password
 */
class SystemAdminSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['email' => 'admin@havena.app'],
            [
                'name'     => 'Admin User',
                'password' => 'password',
                'status'   => 'active',
                'role'     => 'system_admin',
            ],
        );

        $this->command?->info('SystemAdminSeeder: admin@havena.app / password (system_admin)');
    }
}
