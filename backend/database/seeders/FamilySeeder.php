<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Demo family tree for the primary community (idempotent).
 */
class FamilySeeder extends Seeder
{
    public function run(): void
    {
        $community = DB::table('communities')
            ->where('status', 'active')
            ->orderBy('id')
            ->first();

        if (! $community) {
            $this->command?->warn('FamilySeeder: no active community found.');

            return;
        }

        $communityId = (int) $community->id;

        $headId = DB::table('users')->where('phone', '+15555550100')->value('id')
            ?? DB::table('community_memberships')
                ->where('community_id', $communityId)
                ->where('status', 'approved')
                ->where('role', 'member')
                ->orderBy('user_id')
                ->value('user_id');

        if (! $headId) {
            $this->command?->warn('FamilySeeder: no resident to use as family head.');

            return;
        }

        $memberIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('role', 'member')
            ->where('user_id', '!=', $headId)
            ->orderBy('user_id')
            ->limit(2)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $now = now();
        $familyId = DB::table('families')
            ->where('community_id', $communityId)
            ->where('head_user_id', $headId)
            ->value('id');

        if (! $familyId) {
            $familyId = DB::table('families')->insertGetId([
                'community_id' => $communityId,
                'head_user_id' => $headId,
                'family_number' => 'OV-'.str_pad((string) $headId, 4, '0', STR_PAD_LEFT),
                'name' => 'Mitchell Family',
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('families')->where('id', $familyId)->update([
                'name' => 'Mitchell Family',
                'status' => 'active',
                'updated_at' => $now,
            ]);
        }

        $this->upsertMember((int) $familyId, (int) $headId, 'head', 'Self', (int) $headId, $now);

        $relationships = ['Spouse', 'Child'];
        foreach ($memberIds as $index => $userId) {
            $this->upsertMember(
                (int) $familyId,
                $userId,
                'member',
                $relationships[$index] ?? 'Relative',
                (int) $headId,
                $now,
            );
        }

        $requesterId = $memberIds[1] ?? null;
        if ($requesterId && Schema::hasTable('family_join_requests')) {
            $exists = DB::table('family_join_requests')
                ->where('family_id', $familyId)
                ->where('requester_user_id', $requesterId)
                ->exists();

            if (! $exists) {
                DB::table('family_join_requests')->insert([
                    'family_id' => $familyId,
                    'requester_user_id' => $requesterId,
                    'status' => 'pending',
                    'message' => 'Would like to be added to the Mitchell family account.',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        $this->command?->info("FamilySeeder: family #{$familyId} for community #{$communityId}.");
    }

    private function upsertMember(int $familyId, int $userId, string $role, string $relationship, int $addedBy, $now): void
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
}
