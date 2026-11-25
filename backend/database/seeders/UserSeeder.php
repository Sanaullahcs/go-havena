<?php

namespace Database\Seeders;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            [
                'name'     => 'Admin User',
                'email'    => 'admin@havena.app',
                'password' => 'password',
                'role'     => 'system_admin',
                'status'   => 'active',
                'profile'  => ['display_name' => 'Admin User', 'unit_number' => 'Office'],
            ],
            [
                'name'     => 'Moderator User',
                'email'    => 'mod@havena.app',
                'password' => 'password',
                'role'     => 'moderator',
                'status'   => 'active',
                'profile'  => ['display_name' => 'Community Moderator', 'unit_number' => 'B-02'],
            ],
            [
                'name'     => 'Resident Demo',
                'email'    => 'resident@havena.app',
                'password' => 'password',
                'role'     => 'resident',
                'status'   => 'active',
                'profile'  => ['display_name' => 'Resident Demo', 'unit_number' => 'A-12'],
            ],
            [
                'name'     => 'Guest User',
                'email'    => 'guest@havena.app',
                'password' => 'password',
                'role'     => 'resident',
                'status'   => 'active',
                'profile'  => ['display_name' => 'Guest User', 'unit_number' => 'C-07'],
            ],
        ];

        foreach ($accounts as $data) {
            $profile = $data['profile'];
            unset($data['profile']);

            $user = User::query()->updateOrCreate(
                ['email' => $data['email']],
                array_merge($data, [
                    'uuid'     => (string) Str::ulid(),
                ]),
            );

            Profile::query()->updateOrCreate(
                ['user_id' => $user->id],
                $profile,
            );
        }
    }
}
