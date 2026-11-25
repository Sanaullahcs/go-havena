<?php

namespace App\Console\Commands;

use App\Services\LocalLoginAccountRestorer;
use Illuminate\Console\Command;

class EnsureSystemAdminCommand extends Command
{
    protected $signature = 'havena:ensure-system-admin
                            {--email=admin@havena.app : System admin email}
                            {--password=password : Plain-text password (hashed once by the model)}';

    protected $description = 'Create or reset the platform system admin (fixes login after bad seed hashes)';

    public function handle(LocalLoginAccountRestorer $restorer): int
    {
        $email = (string) $this->option('email');
        $password = (string) $this->option('password');

        try {
            $user = $restorer->ensureSystemAdmin($email, $password);
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("System admin ready: {$email} / {$password} (role: {$user->role}, id: {$user->id})");

        return self::SUCCESS;
    }
}
