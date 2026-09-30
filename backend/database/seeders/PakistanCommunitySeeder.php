<?php

namespace Database\Seeders;

use App\Models\Community;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Presentation-ready demo for Pakistan - Lahore (TGI community).
 *
 * Community admin: tgi.admin@havena.app   OTP 123456
 * Resident:        tgi.resident1@havena.app OTP 123456
 *
 * Run: php artisan havena:seed-pakistan-demo
 */
class PakistanCommunitySeeder extends Seeder
{
    public function run(): void
    {
        $this->call(TgiCommunitySeeder::class);

        $community = Community::query()
            ->where('name', TgiCommunitySeeder::COMMUNITY_NAME)
            ->firstOrFail();

        $this->call(WellnessHubSeeder::class);

        $content = new DemoContentSeeder;
        $content->targetCommunityId = (int) $community->id;
        $content->preserveCommunityIdentity = true;
        $content->seedFoundationalCatalogs = false;
        $content->seedSystemScope = false;
        $content->preferredAdminEmail = TgiCommunitySeeder::ADMIN_EMAIL;
        $content->customResidents = $this->customResidents();
        $content->emailAliases = $this->emailAliases();
        if ($this->command) {
            $content->setCommand($this->command);
        }
        $content->run();

        $this->localizeDemoCopy((int) $community->id, $community->name);

        $this->command?->info('');
        $this->command?->info('Pakistan demo ready (region: Pakistan - Lahore):');
        $this->command?->info('  Community:       '.$community->name.' — '.TgiCommunitySeeder::COMMUNITY_ADDRESS);
        $this->command?->info('  Community admin: '.TgiCommunitySeeder::ADMIN_EMAIL.'  (OTP 123456)');
        $this->command?->info('  Resident:        '.TgiCommunitySeeder::RESIDENTS[0]['email'].'  (OTP 123456)');
        $this->command?->info('  Invite code:     '.TgiCommunitySeeder::INVITE_CODE);
    }

    /** @return list<array<int, mixed>> */
    private function customResidents(): array
    {
        $rows = [];
        $avatars = [5, 12, 20, 33];

        foreach (TgiCommunitySeeder::RESIDENTS as $index => $person) {
            $rows[] = [
                $person['name'],
                $person['email'],
                $person['unit'],
                ucfirst($person['residence']),
                $person['bio'],
                $avatars[$index] ?? 5,
                'approved',
                $index === 0 ? 'moderator' : 'member',
            ];
        }

        return $rows;
    }

    /** @return array<string, string> */
    private function emailAliases(): array
    {
        $residents = array_column(TgiCommunitySeeder::RESIDENTS, 'email');
        $cycle = static function (string $email) use ($residents): string {
            static $i = 0;

            return $residents[$i++ % count($residents)];
        };

        $demoEmails = [
            'resident@gohavena.com',
            'community@gohavena.com',
            'sarah@havena.app',
            'david@havena.app',
            'lisa@havena.app',
            'james@havena.app',
            'emily@havena.app',
            'michael@havena.app',
            'priya@havena.app',
            'carlos@havena.app',
            'aisha@havena.app',
            'tom@havena.app',
            'nina@havena.app',
            'diego@havena.app',
            'grace@havena.app',
            'robert@havena.app',
        ];

        $aliases = [
            'community@gohavena.com' => TgiCommunitySeeder::ADMIN_EMAIL,
            'admin@gohavena.com' => TgiCommunitySeeder::ADMIN_EMAIL,
        ];

        foreach ($demoEmails as $email) {
            if (isset($aliases[$email])) {
                continue;
            }
            $aliases[$email] = $cycle($email);
        }

        return $aliases;
    }

    private function localizeDemoCopy(int $communityId, string $communityName): void
    {
        $replacements = [
            'Harbor Point Residences' => $communityName,
            'Harbor Point' => $communityName,
            '50 Liberty Drive' => TgiCommunitySeeder::COMMUNITY_ADDRESS,
            'Liberty Drive' => 'Main Boulevard',
            'Boston Public Market' => 'Packages Mall',
            'Legal Harborside' => 'Cocochan',
            'Boston Seaport' => 'DHA Lahore',
            'the Seaport' => 'DHA Lahore',
            'Seaport' => 'DHA',
            'Harborwalk' => 'community walkways',
            'Fan Pier' => 'the park',
            'Boston history' => 'Lahore history',
            'Boston' => 'Lahore',
        ];

        $apply = static function (?string $text) use ($replacements): ?string {
            if ($text === null || $text === '') {
                return $text;
            }

            return str_replace(array_keys($replacements), array_values($replacements), $text);
        };

        $tables = [
            'notices' => ['title', 'body'],
            'posts' => ['body'],
            'events' => ['title', 'description', 'location'],
            'businesses' => ['name', 'description', 'address'],
            'deals' => ['title', 'description'],
            'community_rules' => ['title', 'body'],
            'documents' => ['title', 'description'],
        ];

        foreach ($tables as $table => $columns) {
            if (! DB::getSchemaBuilder()->hasTable($table)) {
                continue;
            }

            $query = DB::table($table)->where('community_id', $communityId);
            foreach ($query->get() as $row) {
                $updates = [];
                foreach ($columns as $column) {
                    if (! property_exists($row, $column)) {
                        continue;
                    }
                    $next = $apply($row->{$column});
                    if ($next !== $row->{$column}) {
                        $updates[$column] = $next;
                    }
                }
                if ($updates !== []) {
                    $updates['updated_at'] = now();
                    DB::table($table)->where('id', $row->id)->update($updates);
                }
            }
        }
    }
}
