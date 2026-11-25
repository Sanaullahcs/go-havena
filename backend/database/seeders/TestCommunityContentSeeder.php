<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Dummy content for the existing "Test" community only (community admin:
 * testcommunity@gmail.com). Does not rename the community or touch other
 * communities' rows.
 *
 * Run: php artisan db:seed --class=Database\\Seeders\\TestCommunityContentSeeder
 */
class TestCommunityContentSeeder extends Seeder
{
    public const ADMIN_EMAIL = 'testcommunity@gmail.com';

    public const RESIDENT_EMAIL = 'jordan.testcommunity@havena.app';

    public function run(): void
    {
        $community = $this->resolveTestCommunity();
        if (! $community) {
            $this->command?->error('TestCommunityContentSeeder: community named "Test" was not found.');

            return;
        }

        $cid = (int) $community->id;

        $demo = new DemoContentSeeder;
        $demo->targetCommunityId = $cid;
        $demo->preserveCommunityIdentity = true;
        $demo->seedSystemScope = false;
        $demo->seedFoundationalCatalogs = false;
        $demo->customResidents = $this->residents();
        $demo->emailAliases = $this->emailAliases();
        if ($this->command) {
            $demo->setCommand($this->command);
        }
        $demo->run();

        $this->assignPhones();
        $this->seedInviteCode($cid);
        $this->seedFamily($cid);
        $this->seedGuests($cid);
        $this->seedWellnessProgress();

        $this->command?->info('');
        $this->command?->info("Test community dummy data ready for community #{$cid} ({$community->name}).");
        $this->command?->info('  Community admin: '.self::ADMIN_EMAIL.'  (email OTP 123456 in local)');
        $this->command?->info('  Resident:        '.self::RESIDENT_EMAIL.'  (password: password, OTP 123456 in local)');
    }

    private function resolveTestCommunity(): ?object
    {
        $adminId = DB::table('users')->where('email', self::ADMIN_EMAIL)->value('id');

        if ($adminId) {
            $owned = DB::table('communities')
                ->where('requested_by_user_id', $adminId)
                ->where('name', 'Test')
                ->orderByDesc('id')
                ->first();
            if ($owned) {
                return $owned;
            }

            $viaMembership = DB::table('communities as c')
                ->join('community_memberships as cm', 'cm.community_id', '=', 'c.id')
                ->where('cm.user_id', $adminId)
                ->where('cm.role', 'admin')
                ->where('cm.status', 'approved')
                ->where('c.name', 'Test')
                ->orderByDesc('c.id')
                ->select('c.*')
                ->first();
            if ($viaMembership) {
                return $viaMembership;
            }
        }

        return DB::table('communities')
            ->where('name', 'Test')
            ->where('status', 'active')
            ->orderByDesc('id')
            ->first();
    }

    /** @return array<string, string> */
    private function emailAliases(): array
    {
        return [
            'sarah@havena.app' => 'sarah.testcommunity@havena.app',
            'david@havena.app' => 'david.testcommunity@havena.app',
            'lisa@havena.app' => 'lisa.testcommunity@havena.app',
            'james@havena.app' => 'james.testcommunity@havena.app',
            'emily@havena.app' => 'emily.testcommunity@havena.app',
            'michael@havena.app' => 'michael.testcommunity@havena.app',
            'priya@havena.app' => 'priya.testcommunity@havena.app',
            'carlos@havena.app' => 'carlos.testcommunity@havena.app',
            'aisha@havena.app' => 'aisha.testcommunity@havena.app',
            'tom@havena.app' => 'tom.testcommunity@havena.app',
            'nina@havena.app' => 'nina.testcommunity@havena.app',
            'diego@havena.app' => 'diego.testcommunity@havena.app',
            'grace@havena.app' => 'grace.testcommunity@havena.app',
            'robert@havena.app' => 'robert.testcommunity@havena.app',
            'test.resident@havena.app' => self::RESIDENT_EMAIL,
            'test.community.admin@havena.app' => self::ADMIN_EMAIL,
        ];
    }

    /** @return list<array{0: string, 1: string, 2: string, 3: string, 4: string, 5: int, 6: string, 7: string}> */
    private function residents(): array
    {
        return [
            ['Jordan Cole', self::RESIDENT_EMAIL, 'Apt 12', 'Two-bedroom', 'Test resident for the Test community. Weekend runner and farmers-market regular.', 1, 'approved', 'member'],
            ['Sarah Mitchell', 'sarah.testcommunity@havena.app', 'Apt 4B', 'Two-bedroom', 'Book club host and weekend gardener. Always happy to lend a hand.', 5, 'approved', 'member'],
            ['David Chen', 'david.testcommunity@havena.app', 'Apt 6D', 'Studio', 'Software engineer, coffee enthusiast, and casual cyclist.', 12, 'approved', 'member'],
            ['Lisa Wang', 'lisa.testcommunity@havena.app', 'Apt 2A', 'One-bedroom', 'Yoga instructor and plant collector. Ask me about houseplants.', 20, 'approved', 'member'],
            ['James Okafor', 'james.testcommunity@havena.app', 'Apt 7A', 'Two-bedroom', 'New to the neighborhood and excited to get involved.', 33, 'pending', 'member'],
            ['Emily Rodriguez', 'emily.testcommunity@havena.app', 'Apt 1C', 'One-bedroom', 'Freelance designer who loves farmers markets and long walks.', 45, 'approved', 'member'],
            ['Michael Torres', 'michael.testcommunity@havena.app', 'Apt 5F', 'Three-bedroom', 'Dad of two, grill master, and community volunteer.', 15, 'approved', 'moderator'],
            ['Priya Patel', 'priya.testcommunity@havena.app', 'Apt 3B', 'Two-bedroom', 'Physician and runner. Organizing the morning run group.', 26, 'approved', 'member'],
            ['Carlos Mendez', 'carlos.testcommunity@havena.app', 'Apt 8C', 'One-bedroom', 'Photographer capturing everyday moments around the community.', 51, 'approved', 'member'],
            ['Aisha Johnson', 'aisha.testcommunity@havena.app', 'Apt 2D', 'Studio', 'Teacher, baker, and proud dog mom to a golden retriever.', 47, 'approved', 'member'],
            ['Tom Becker', 'tom.testcommunity@havena.app', 'Apt 6A', 'Two-bedroom', 'Retired contractor. Handy with just about anything.', 60, 'approved', 'member'],
            ['Nina Kowalski', 'nina.testcommunity@havena.app', 'Apt 4C', 'One-bedroom', 'Marketing lead who loves community events and trivia nights.', 31, 'approved', 'member'],
            ['Diego Alvarez', 'diego.testcommunity@havena.app', 'Apt 9B', 'Three-bedroom', 'Chef exploring the local food scene one dish at a time.', 13, 'pending', 'member'],
            ['Grace Lee', 'grace.testcommunity@havena.app', 'Apt 1A', 'One-bedroom', 'Nurse and volunteer who enjoys quiet evenings by the pool.', 44, 'approved', 'member'],
            ['Robert Hayes', 'robert.testcommunity@havena.app', 'Apt 7D', 'Two-bedroom', 'Musician and night owl.', 68, 'banned', 'member'],
        ];
    }

    private function assignPhones(): void
    {
        $phones = [
            self::RESIDENT_EMAIL => '+15555701000',
            'sarah.testcommunity@havena.app' => '+15555701001',
            'david.testcommunity@havena.app' => '+15555701002',
            'lisa.testcommunity@havena.app' => '+15555701003',
            'james.testcommunity@havena.app' => '+15555701004',
            'emily.testcommunity@havena.app' => '+15555701005',
            'michael.testcommunity@havena.app' => '+15555701006',
            'priya.testcommunity@havena.app' => '+15555701007',
            'carlos.testcommunity@havena.app' => '+15555701008',
            'aisha.testcommunity@havena.app' => '+15555701009',
            'tom.testcommunity@havena.app' => '+15555701010',
            'nina.testcommunity@havena.app' => '+15555701011',
            'diego.testcommunity@havena.app' => '+15555701012',
            'grace.testcommunity@havena.app' => '+15555701013',
            'robert.testcommunity@havena.app' => '+15555701014',
        ];

        foreach ($phones as $email => $phone) {
            DB::table('users')->where('email', $email)->update([
                'phone' => $phone,
                'phone_verified_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedInviteCode(int $cid): void
    {
        $adminId = DB::table('users')->where('email', self::ADMIN_EMAIL)->value('id');

        DB::table('invite_codes')->updateOrInsert(
            ['code' => 'TEST-COMMUNITY-26'],
            [
                'community_id' => $cid,
                'created_by' => $adminId,
                'max_uses' => null,
                'used_count' => 3,
                'expires_at' => now()->addMonths(6),
                'updated_at' => now(),
                'created_at' => now()->subDays(10),
            ]
        );
    }

    private function seedFamily(int $cid): void
    {
        $headId = DB::table('users')->where('email', self::RESIDENT_EMAIL)->value('id');
        if (! $headId) {
            return;
        }

        $spouseId = DB::table('users')->where('email', 'sarah.testcommunity@havena.app')->value('id');
        $childId = DB::table('users')->where('email', 'emily.testcommunity@havena.app')->value('id');
        $now = now();

        $familyId = DB::table('families')
            ->where('community_id', $cid)
            ->where('head_user_id', $headId)
            ->value('id');

        if (! $familyId) {
            $familyId = DB::table('families')->insertGetId([
                'community_id' => $cid,
                'head_user_id' => $headId,
                'family_number' => 'TEST-'.str_pad((string) $headId, 4, '0', STR_PAD_LEFT),
                'name' => 'Cole Family (Test)',
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('families')->where('id', $familyId)->update([
                'name' => 'Cole Family (Test)',
                'status' => 'active',
                'updated_at' => $now,
            ]);
        }

        $this->upsertFamilyMember((int) $familyId, (int) $headId, 'head', 'Self', (int) $headId, $now);
        if ($spouseId) {
            $this->upsertFamilyMember((int) $familyId, (int) $spouseId, 'member', 'Spouse', (int) $headId, $now);
        }
        if ($childId && Schema::hasTable('family_join_requests')) {
            $exists = DB::table('family_join_requests')
                ->where('family_id', $familyId)
                ->where('requester_user_id', $childId)
                ->exists();
            if (! $exists) {
                DB::table('family_join_requests')->insert([
                    'family_id' => $familyId,
                    'requester_user_id' => $childId,
                    'status' => 'pending',
                    'message' => 'Dummy request — please add me to the Cole family account.',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    private function upsertFamilyMember(int $familyId, int $userId, string $role, string $relationship, int $addedBy, $now): void
    {
        $existing = DB::table('family_members')
            ->where('family_id', $familyId)
            ->where('user_id', $userId)
            ->value('id');

        $payload = [
            'role' => $role,
            'status' => 'active',
            'relationship' => $relationship,
            'added_by_user_id' => $addedBy,
            'joined_at' => $now,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('family_members')->where('id', $existing)->update($payload);

            return;
        }

        DB::table('family_members')->insert([
            'family_id' => $familyId,
            'user_id' => $userId,
            ...$payload,
            'created_at' => $now,
        ]);
    }

    private function seedGuests(int $cid): void
    {
        $hostId = DB::table('users')->where('email', self::RESIDENT_EMAIL)->value('id');
        $adminId = DB::table('users')->where('email', self::ADMIN_EMAIL)->value('id');
        if (! $hostId) {
            return;
        }

        $now = now();
        $rows = [
            [
                'guest_name' => 'Sam Okonkwo',
                'guest_email' => 'sam.guest.testcommunity@example.com',
                'guest_phone' => '+15555701901',
                'invite_code' => 'TEST-GUEST-OKONKWO',
                'invitation_type' => 'resident',
                'status' => 'active',
                'starts_at' => $now->copy()->subDay(),
                'ends_at' => $now->copy()->addDays(3),
                'invited_by_user_id' => $hostId,
                'approved_by_user_id' => $adminId,
                'approved_at' => $now->copy()->subHours(6),
            ],
            [
                'guest_name' => 'Priya Guest',
                'guest_email' => 'priya.guest.testcommunity@example.com',
                'guest_phone' => '+15555701902',
                'invite_code' => 'TEST-GUEST-PRIYA',
                'invitation_type' => 'resident',
                'status' => 'pending_approval',
                'starts_at' => $now->copy()->addDay(),
                'ends_at' => $now->copy()->addDays(4),
                'invited_by_user_id' => $hostId,
                'approved_by_user_id' => null,
                'approved_at' => null,
            ],
        ];

        foreach ($rows as $row) {
            $existing = DB::table('guest_invitations')->where('invite_code', $row['invite_code'])->value('id');
            $payload = [
                'community_id' => $cid,
                'invited_by_user_id' => $row['invited_by_user_id'],
                'invitation_type' => $row['invitation_type'],
                'guest_name' => $row['guest_name'],
                'guest_email' => $row['guest_email'],
                'guest_phone' => $row['guest_phone'],
                'starts_at' => $row['starts_at'],
                'ends_at' => $row['ends_at'],
                'status' => $row['status'],
                'approved_by_user_id' => $row['approved_by_user_id'],
                'approved_at' => $row['approved_at'],
                'updated_at' => $now,
            ];

            if ($existing) {
                DB::table('guest_invitations')->where('id', $existing)->update($payload);

                continue;
            }

            $id = DB::table('guest_invitations')->insertGetId([
                ...$payload,
                'invite_code' => $row['invite_code'],
                'created_at' => $now,
            ]);

            DB::table('guest_activity_logs')->insert([
                'guest_invitation_id' => $id,
                'guest_user_id' => null,
                'community_id' => $cid,
                'action' => 'invited',
                'description' => "{$row['guest_name']} was invited to visit Test community (dummy data).",
                'meta' => json_encode(['invite_code' => $row['invite_code']]),
                'created_at' => $now,
            ]);
        }
    }

    private function seedWellnessProgress(): void
    {
        $userIds = array_filter([
            DB::table('users')->where('email', self::RESIDENT_EMAIL)->value('id'),
            DB::table('users')->where('email', self::ADMIN_EMAIL)->value('id'),
        ]);

        $lessonIds = DB::table('wellness_lessons as l')
            ->join('wellness_courses as c', 'c.id', '=', 'l.course_id')
            ->where('l.status', 'published')
            ->orderBy('c.category_id')
            ->orderBy('l.sort_order')
            ->limit(8)
            ->pluck('l.id');

        foreach ($userIds as $uid) {
            foreach ($lessonIds as $i => $lessonId) {
                if ($i > 4 && (int) $uid === (int) ($userIds[1] ?? 0)) {
                    continue;
                }
                DB::table('wellness_lesson_progress')->updateOrInsert(
                    ['user_id' => $uid, 'lesson_id' => $lessonId],
                    ['completed_at' => now()->subDays(rand(1, 12))]
                );
            }
        }
    }
}
