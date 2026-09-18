<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

$user = User::query()->whereRaw('LOWER(email) = ?', ['resident@gohavena.com'])->first();
$cid = (int) DB::table('community_memberships')->where('user_id', $user->id)->where('status', 'approved')->orderByDesc('id')->value('community_id');
$rows = DB::table('notices')
    ->where('community_id', $cid)
    ->whereNull('deleted_at')
    ->orderByDesc('is_pinned')
    ->orderByDesc('published_at')
    ->get(['id', 'title', 'category', 'status', 'is_pinned', 'image_url', 'event_date', 'published_at']);

echo "community={$cid} count={$rows->count()}\n";
foreach ($rows as $row) {
    $img = $row->image_url ? basename((string) $row->image_url) : '-';
    echo "{$row->id}\t{$row->status}\t{$row->category}\tpin=".($row->is_pinned ? '1' : '0')."\t{$row->event_date}\t{$img}\t{$row->title}\n";
}
