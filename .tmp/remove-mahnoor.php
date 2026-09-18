<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$needle = '%mahnoor%';

$users = User::withTrashed()
    ->where('email', 'like', $needle)
    ->orderBy('id')
    ->get();

echo "users_to_remove=".$users->count()."\n";

DB::transaction(function () use ($users, $needle) {
    foreach ($users as $user) {
        echo "removing user {$user->id} {$user->email}\n";

        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('role', 'admin')
            ->whereIn('status', ['approved', 'pending'])
            ->update(['status' => 'banned']);

        Community::query()
            ->where('requested_by_user_id', $user->id)
            ->update(['requested_by_user_id' => null]);

        if (Schema::hasTable('invite_codes')) {
            $inviteQuery = DB::table('invite_codes')->where('invited_user_id', $user->id);
            if (Schema::hasColumn('invite_codes', 'deleted_at')) {
                $inviteQuery->update(['deleted_at' => now()]);
            } else {
                $inviteQuery->delete();
            }
        }

        if (Schema::hasTable('guest_invitations') && Schema::hasColumn('guest_invitations', 'guest_email')) {
            DB::table('guest_invitations')
                ->where('guest_email', $user->email)
                ->update(['guest_email' => 'deleted-guest-'.$user->id.'@deleted.havena.local']);
        }

        $stamp = now()->format('ymdHis');
        $user->forceFill([
            'status' => 'deleted',
            'name' => 'Deleted User',
            'email' => "deleted-{$user->id}-{$stamp}@deleted.havena.local",
            'phone' => substr('+1999'.$user->id.$stamp, 0, 20),
            'phone_verified_at' => null,
            'email_verified_at' => null,
            'google_id' => null,
            'apple_id' => null,
        ])->save();

        if (method_exists($user, 'tokens')) {
            $user->tokens()->delete();
        }

        if (method_exists($user, 'profile') && $user->profile) {
            $user->profile->update([
                'display_name' => 'Deleted User',
            ]);
        }

        if (! $user->trashed()) {
            $user->delete();
        }
    }

    if (Schema::hasTable('email_otps')) {
        $deletedOtps = DB::table('email_otps')->where('email', 'like', $needle)->delete();
        echo "deleted_email_otps={$deletedOtps}\n";
    }

    if (Schema::hasTable('guest_invitations') && Schema::hasColumn('guest_invitations', 'guest_email')) {
        $guestHits = DB::table('guest_invitations')->where('guest_email', 'like', $needle)->get();
        foreach ($guestHits as $row) {
            DB::table('guest_invitations')->where('id', $row->id)->update([
                'guest_email' => 'deleted-guest-'.$row->id.'@deleted.havena.local',
            ]);
        }
        echo "scrubbed_guest_invitations=".$guestHits->count()."\n";
    }

    if (Schema::hasTable('transactional_email_sends') && Schema::hasColumn('transactional_email_sends', 'recipient_email')) {
        $sends = DB::table('transactional_email_sends')->where('recipient_email', 'like', $needle)->get();
        foreach ($sends as $row) {
            DB::table('transactional_email_sends')->where('id', $row->id)->update([
                'recipient_email' => 'deleted-send-'.$row->id.'@deleted.havena.local',
            ]);
        }
        echo "scrubbed_transactional_sends=".$sends->count()."\n";
    }

    if (Schema::hasTable('activity_logs') && Schema::hasColumn('activity_logs', 'description')) {
        $logs = DB::table('activity_logs')->where('description', 'like', $needle)->get();
        foreach ($logs as $row) {
            $clean = preg_replace('/[A-Z0-9._%+\-]*mahnoor[A-Z0-9._%+\-]*@[A-Z0-9.\-]+\.[A-Z]{2,}/i', '[redacted]', (string) $row->description);
            DB::table('activity_logs')->where('id', $row->id)->update(['description' => $clean]);
        }
        echo "scrubbed_activity_logs=".$logs->count()."\n";
    }

    $emailTables = [
        'users' => ['email'],
        'email_otps' => ['email'],
        'guest_invitations' => ['guest_email'],
        'transactional_email_sends' => ['recipient_email'],
        'invite_codes' => ['email', 'invited_email'],
        'password_reset_tokens' => ['email'],
    ];
    foreach ($emailTables as $table => $cols) {
        if (! Schema::hasTable($table)) {
            continue;
        }
        foreach ($cols as $col) {
            if (! Schema::hasColumn($table, $col)) {
                continue;
            }
            $left = DB::table($table)->where($col, 'like', $needle)->count();
            echo "remaining {$table}.{$col}={$left}\n";
        }
    }
});

$leftUsers = User::withTrashed()->where('email', 'like', $needle)->count();
echo "remaining_users_with_mahnoor_email={$leftUsers}\n";

$valensia = Community::query()->find(51);
echo "valensia status={$valensia?->status} requested_by=".($valensia?->requested_by_user_id ?? 'null')."\n";
$admins = CommunityMembership::query()
    ->where('community_id', 51)
    ->where('role', 'admin')
    ->where('status', 'approved')
    ->count();
echo "valensia_approved_admins={$admins}\n";
