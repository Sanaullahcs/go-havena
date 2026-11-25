<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$users = User::query()
    ->withTrashed()
    ->where(function ($q) {
        $q->where('email', 'like', '%mahnoor%')
            ->orWhere('name', 'like', '%mahnoor%')
            ->orWhere('name', 'like', '%Mahnoor%');
    })
    ->get();

echo "users=".$users->count()."\n";
foreach ($users as $user) {
    echo "user {$user->id} email={$user->email} name={$user->name} role={$user->role} admin=".($user->community_admin_status ?? 'null')." status={$user->status} deleted=".($user->deleted_at ?? 'null')."\n";
}

$tables = [
    'users',
    'community_memberships',
    'communities',
    'invite_codes',
    'activity_logs',
    'notifications',
    'demo_email_codes',
    'otp_codes',
];

foreach (['users', 'community_memberships'] as $table) {
    if (! Schema::hasTable($table)) {
        continue;
    }
}

$emailHits = [];
foreach (['users', 'profiles', 'invite_codes', 'community_subscriptions', 'activity_logs'] as $table) {
    if (! Schema::hasTable($table)) {
        continue;
    }
    $cols = Schema::getColumnListing($table);
    $emailCols = array_values(array_filter($cols, fn ($c) => str_contains($c, 'email') || $c === 'invited_email'));
    foreach ($emailCols as $col) {
        $count = DB::table($table)->where($col, 'like', '%mahnoor%')->count();
        if ($count > 0) {
            echo "table {$table}.{$col} count={$count}\n";
            $rows = DB::table($table)->where($col, 'like', '%mahnoor%')->limit(20)->get();
            foreach ($rows as $row) {
                $id = $row->id ?? '?';
                $val = $row->{$col} ?? '';
                echo "  {$table} id={$id} {$col}={$val}\n";
            }
        }
    }
}

foreach ($users as $user) {
    $mems = DB::table('community_memberships')->where('user_id', $user->id)->get();
    echo "memberships_user_{$user->id}=".$mems->count()."\n";
    foreach ($mems as $m) {
        $cname = DB::table('communities')->where('id', $m->community_id)->value('name');
        echo "  membership {$m->id} community={$m->community_id} {$cname} role={$m->role} status={$m->status}\n";
    }
    $requested = DB::table('communities')->where('requested_by_user_id', $user->id)->get(['id', 'name', 'status']);
    echo "requested_communities_user_{$user->id}=".$requested->count()."\n";
    foreach ($requested as $c) {
        echo "  community {$c->id} {$c->name} status={$c->status}\n";
    }
}
