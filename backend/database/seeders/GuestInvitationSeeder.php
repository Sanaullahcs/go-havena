<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo guest invitations for the primary community (idempotent).
 */
class GuestInvitationSeeder extends Seeder
{
    public function run(): void
    {
        $community = DB::table('communities')
            ->where('status', 'active')
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('GuestInvitationSeeder: no active community found.');

            return;
        }

        $communityId = (int) $community->id;

        $hostId = DB::table('users')->where('phone', '+15555550100')->value('id')
            ?? DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->where('role', 'member')
                ->orderBy('user_id')
                ->value('user_id');

        $adminId = DB::table('users')->where('phone', '+15555550200')->value('id')
            ?? DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->whereIn('role', ['admin', 'moderator'])
                ->orderBy('user_id')
                ->value('user_id');

        if (! $hostId) {
            $this->command?->warn('GuestInvitationSeeder: no host resident found.');

            return;
        }

        $now = now();
        $rows = [
            [
                'guest_name' => 'Michael Torres',
                'guest_email' => 'michael.torres@example.com',
                'guest_phone' => '+15555550301',
                'invite_code' => 'GUEST-TORRES',
                'invitation_type' => 'resident',
                'status' => 'active',
                'starts_at' => $now->copy()->subDay(),
                'ends_at' => $now->copy()->addDays(3),
                'invited_by_user_id' => $hostId,
                'approved_by_user_id' => $adminId,
                'approved_at' => $now->copy()->subHours(6),
            ],
            [
                'guest_name' => 'Lisa Wong',
                'guest_email' => 'lisa.wong@example.com',
                'guest_phone' => '+15555550302',
                'invite_code' => 'GUEST-WONG',
                'invitation_type' => 'resident',
                'status' => 'pending_approval',
                'starts_at' => $now->copy()->addDay(),
                'ends_at' => $now->copy()->addDays(4),
                'invited_by_user_id' => $hostId,
                'approved_by_user_id' => null,
                'approved_at' => null,
            ],
            [
                'guest_name' => 'Omar Haddad',
                'guest_email' => 'omar.haddad@example.com',
                'guest_phone' => '+15555550303',
                'invite_code' => 'GUEST-HADDAD',
                'invitation_type' => 'admin',
                'status' => 'active',
                'starts_at' => $now->copy()->subHours(8),
                'ends_at' => $now->copy()->addDays(2),
                'invited_by_user_id' => $adminId ?? $hostId,
                'approved_by_user_id' => $adminId,
                'approved_at' => $now->copy()->subHours(7),
            ],
        ];

        $added = 0;
        foreach ($rows as $row) {
            $existing = DB::table('guest_invitations')
                ->where('invite_code', $row['invite_code'])
                ->value('id');

            $payload = [
                'community_id' => $communityId,
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
                'community_id' => $communityId,
                'action' => 'invited',
                'description' => "{$row['guest_name']} was invited to visit Florida Main Street.",
                'meta' => json_encode(['invite_code' => $row['invite_code']]),
                'created_at' => $now,
            ]);
            $added++;
        }

        $this->command?->info("GuestInvitationSeeder: community #{$communityId} — {$added} new invitations.");
    }
}
