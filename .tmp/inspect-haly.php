<?php

use App\Models\Community;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$communities = Community::query()
    ->where('name', 'like', '%haly%')
    ->orWhere('name', 'like', '%Haly%')
    ->get(['id', 'name', 'status', 'review_status', 'address']);

echo "communities=".$communities->count()."\n";
foreach ($communities as $c) {
    echo "community {$c->id} {$c->name} status={$c->status} review={$c->review_status} addr=".($c->address ?? '')."\n";
}

$cid = $communities->first()?->id;
if ($cid) {
    $biz = DB::table('businesses')->where('community_id', $cid)->whereNull('deleted_at')->get();
    echo "businesses=".$biz->count()."\n";
    foreach ($biz as $b) {
        echo "biz {$b->id} {$b->name} cat=".($b->category ?? '')." status={$b->status} img=".($b->image_url ?? '')."\n";
    }
    $deals = DB::table('deals')->where('community_id', $cid)->whereNull('deleted_at')->get();
    echo "deals=".$deals->count()."\n";
    foreach ($deals as $d) {
        echo "deal {$d->id} {$d->title} status={$d->status} biz=".($d->business_id ?? 'null')." img=".($d->image_url ?? '')."\n";
    }
}

echo "wellness_cat_cols=".implode(',', Schema::getColumnListing('wellness_categories'))."\n";
echo "wellness_course_cols=".implode(',', Schema::getColumnListing('wellness_courses'))."\n";
echo "wellness_lesson_cols=".implode(',', Schema::getColumnListing('wellness_lessons'))."\n";

$courses = DB::table('wellness_courses')->orderBy('id')->get(['id', 'title', 'image_url', 'status']);
echo "courses=".$courses->count()."\n";
foreach ($courses as $c) {
    echo "course {$c->id} {$c->title} img=".($c->image_url ?? 'null')."\n";
}

$cats = DB::table('wellness_categories')->orderBy('id')->get(['id', 'key', 'title', 'image_url']);
echo "cats=".$cats->count()."\n";
foreach ($cats as $c) {
    echo "cat {$c->id} {$c->key} img=".($c->image_url ?? 'null')."\n";
}

if (Schema::hasTable('wellness_content')) {
    $legacy = DB::table('wellness_content')->limit(20)->get();
    echo "legacy_content=".$legacy->count()."\n";
    foreach ($legacy as $row) {
        $img = $row->image_url ?? $row->image ?? '';
        echo "legacy {$row->id} ".($row->title ?? '')." img={$img}\n";
    }
}

$admin = DB::table('community_memberships as cm')
    ->join('users as u', 'u.id', '=', 'cm.user_id')
    ->where('cm.community_id', $cid)
    ->where('cm.role', 'admin')
    ->where('cm.status', 'approved')
    ->select('u.id', 'u.email', 'u.name')
    ->first();
echo "admin=".($admin ? "{$admin->id} {$admin->email} {$admin->name}" : 'none')."\n";
