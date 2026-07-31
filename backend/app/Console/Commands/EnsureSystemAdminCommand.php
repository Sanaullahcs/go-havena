<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Auth;

class EnsureSystemAdminCommand extends Command
{
    protected $signature = 'neighborlink:ensure-system-admin
                            {--email=admin@neighborlink.app : System admin email}
                            {--password=password : Plain-text password (hashed once by the model)}';

    protected $description = 'Create or reset the platform system admin (fixes login after bad seed hashes)';

    public function handle(): int
    {
        $email = (string) $this->option('email');
        $password = (string) $this->option('password');

        $user = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name'     => 'Admin User',
                'password' => $password,
                'status'   => 'active',
                'role'     => 'system_admin',
            ],
        );

        if (! Auth::attempt(['email' => $email, 'password' => $password])) {
            $this->error("System admin was saved but login verification failed for {$email}.");

            return self::FAILURE;
        }

        Auth::logout();

        $this->info("System admin ready: {$email} / {$password} (role: {$user->role}, id: {$user->id})");

        return self::SUCCESS;
    }
}
