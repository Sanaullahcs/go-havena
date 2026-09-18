<?php

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$emails = [
    'sanaullah6065cs@gmail.com',
    'sanaullh6065cs@gmail.com',
];

$users = User::withTrashed()
    ->whereIn('email', $emails)
    ->orderBy('id')
    ->get();

echo "users_found=".$users->count()."\n";
foreach ($users as $user) {
    echo "before id={$user->id} email={$user->email} role={$user->role} status={$user->status} trashed=".($user->trashed() ? 'yes' : 'no')."\n";
}

if ($users->isEmpty()) {
    foreach ($emails as $email) {
        $otpCount = Schema::hasTable('email_otps')
            ? DB::table('email_otps')->where('email', $email)->count()
            : 0;
        echo "no_user email={$email} leftover_otps={$otpCount}\n";
        if ($otpCount > 0) {
            DB::table('email_otps')->where('email', $email)->delete();
            echo "cleared_otps email={$email}\n";
        }
    }

    return;
}

DB::transaction(function () use ($users) {
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

        if (method_exists($user, 'tokens')) {
            $user->tokens()->delete();
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

        if (method_exists($user, 'profile') && $user->profile) {
            $user->profile->update([
                'display_name' => 'Deleted User',
            ]);
        }

        if (! $user->trashed()) {
            $user->delete();
        }
    }
});

if (Schema::hasTable('email_otps')) {
    $deletedOtps = DB::table('email_otps')->whereIn('email', $emails)->delete();
    echo "deleted_email_otps={$deletedOtps}\n";
}

$remaining = User::withTrashed()->whereIn('email', $emails)->count();
echo "remaining_with_original_email={$remaining}\n";

foreach ($users as $user) {
    $fresh = User::withTrashed()->find($user->id);
    echo "after id={$fresh?->id} email={$fresh?->email} status={$fresh?->status} trashed=".($fresh?->trashed() ? 'yes' : 'no')."\n";
}