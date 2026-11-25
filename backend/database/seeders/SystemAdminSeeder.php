<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Ensures the platform system admin exists with known dev credentials.
 * Email: admin@havena.app  Password: password
 */
class SystemAdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = 'admin@havena.app';
        $password = 'password';

        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name'     => 'Admin User',
                'password' => $password,
                'status'   => 'active',
                'role'     => 'system_admin',
            ],
        );

        // Force a fresh hash even when updateOrCreate skipped an unchanged row,
        // then confirm Auth::attempt works (avoids silent "Invalid credentials").
        $user->forceFill(['password' => $password, 'status' => 'active', 'role' => 'system_admin'])->save();

        if (! Hash::check($password, (string) $user->fresh()->password)) {
            throw new \RuntimeException("SystemAdminSeeder: password verification failed for {$email}.");
        }

        $this->command?->info("SystemAdminSeeder: {$email} / {$password} (system_admin, id: {$user->id})");
    }
}
