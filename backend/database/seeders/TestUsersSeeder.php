<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TestUsersSeeder extends Seeder
{
    public function run(): void
    {
        $now         = now();
        $communityId = DB::table('communities')->value('id') ?? 1;
        $password    = Hash::make('password');

        $users = [
            // Residents — active
            ['Aisha Malik',      'aisha@havena.app',   'resident',  'active',    'Apt 8A',  'One-bedroom'],
            ['Carlos Mendez',    'carlos@havena.app',  'resident',  'active',    'Apt 3C',  'Two-bedroom'],
            ['Priya Sharma',     'priya@havena.app',   'resident',  'active',    'Apt 5B',  'Studio'],
            ['Noah Williams',    'noah@havena.app',    'resident',  'active',    'Apt 2D',  'Three-bedroom'],
            ['Fatima Hassan',    'fatima@havena.app',  'resident',  'active',    'Apt 9E',  'One-bedroom'],
            ['Lucas Petrov',     'lucas@havena.app',   'resident',  'active',    'Apt 11C', 'Two-bedroom'],
            ['Amara Osei',       'amara@havena.app',   'resident',  'active',    'Apt 6F',  'Studio'],
            ['Ryan Kim',         'ryan@havena.app',    'resident',  'active',    'Apt 4A',  'One-bedroom'],

            // Residents — pending approval
            ['Zara Ahmed',       'zara@havena.app',    'resident',  'active',    'Apt 12B', 'One-bedroom'],
            ['Tom Bradley',      'tom@havena.app',     'resident',  'active',    'Apt 10A', 'Two-bedroom'],

            // Residents — suspended
            ['Jake Turner',      'jake@havena.app',    'resident',  'suspended', 'Apt 1D',  'Studio'],

            // Second moderator
            ['Nina Patel',       'nina@havena.app',    'moderator', 'active',    null,      null],

            // Second admin
            ['Alex Johnson',     'alex@havena.app',    'admin',     'active',    null,      null],
        ];

        $membershipStatuses = [
            'aisha@havena.app'  => 'approved',
            'carlos@havena.app' => 'approved',
            'priya@havena.app'  => 'approved',
            'noah@havena.app'   => 'approved',
            'fatima@havena.app' => 'approved',
            'lucas@havena.app'  => 'approved',
            'amara@havena.app'  => 'approved',
            'ryan@havena.app'   => 'approved',
            'zara@havena.app'   => 'pending',
            'tom@havena.app'    => 'pending',
            'jake@havena.app'   => 'banned',
            'nina@havena.app'   => 'approved',
            'alex@havena.app'   => 'approved',
        ];

        foreach ($users as [$name, $email, $role, $status, $unit, $resType]) {
            // Skip if already exists
            if (DB::table('users')->where('email', $email)->exists()) {
                $this->command->line("  Skipped (exists): {$email}");
                continue;
            }

            $uid = DB::table('users')->insertGetId([
                'name'       => $name,
                'email'      => $email,
                'password'   => $password,
                'role'       => $role,
                'status'     => $status,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('profiles')->insert([
                'user_id'        => $uid,
                'display_name'   => $name,
                'unit_number'    => $unit,
                'residence_type' => $resType,
                'bio'            => $unit ? "Resident at Sunflower Heights Estate, {$unit}." : "Staff member at Sunflower Heights.",
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);

            DB::table('community_memberships')->insert([
                'user_id'      => $uid,
                'community_id' => $communityId,
                'role'         => $role === 'moderator' ? 'moderator' : ($role === 'admin' ? 'admin' : 'member'),
                'status'       => $membershipStatuses[$email],
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);

            // Send welcome notification
            if ($membershipStatuses[$email] === 'approved') {
                DB::table('app_notifications')->insert([
                    'user_id'    => $uid,
                    'type'       => 'success',
                    'title'      => 'Welcome to Havena!',
                    'body'       => 'Your account is active. Explore your community.',
                    'read_at'    => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $this->command->info("  Added: {$name} ({$email}) — {$role} / {$membershipStatuses[$email]}");
        }

        $this->command->info('TestUsersSeeder: complete.');
    }
}
