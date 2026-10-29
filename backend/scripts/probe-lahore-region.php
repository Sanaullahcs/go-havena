<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

echo "=== regions matching lahore/punjab/pakistan ===\n";
$rows = DB::table('regions')
    ->leftJoin('states', 'states.id', '=', 'regions.state_id')
    ->leftJoin('countries', 'countries.id', '=', 'states.country_id')
    ->where(function ($q) {
        $q->where('regions.title', 'like', '%ahore%')
            ->orWhere('regions.title', 'like', '%unjab%')
            ->orWhere('regions.title', 'like', '%akistan%')
            ->orWhere('regions.area', 'like', '%ahore%');
    })
    ->orderBy('regions.id')
    ->get([
        'regions.id', 'regions.title', 'regions.area', 'regions.state', 'regions.state_id',
        'regions.users_label', 'regions.status', 'regions.sort_order',
        'states.name as state_name', 'countries.code as country_code', 'countries.name as country_name',
    ]);

foreach ($rows as $r) {
    printf(
        "#%-4d %-28s area=%-18s state=%-12s state_id=%-5s country=%-3s status=%s users=%s\n",
        $r->id, $r->title, (string) $r->area, (string) $r->state, (string) $r->state_id,
        (string) $r->country_code, $r->status, (string) $r->users_label
    );
}

echo "\n=== communities in those regions ===\n";
foreach (DB::table('communities')->whereIn('region_id', $rows->pluck('id'))->get(['id', 'name', 'region_id', 'currency', 'status']) as $c) {
    printf("#%-3d %-34s region=%-4d %-4s %s\n", $c->id, $c->name, $c->region_id, (string) $c->currency, $c->status);
}

echo "\n=== any existing haly rows ===\n";
foreach (DB::table('communities')->where('name', 'like', '%aly%')->get(['id', 'name', 'region', 'currency']) as $c) {
    printf("#%-3d %-34s %-24s %s\n", $c->id, $c->name, (string) $c->region, (string) $c->currency);
}
foreach (DB::table('users')->whereIn('email', ['haly@gohavena.com', 'haly.resident@gohavena.com'])->get(['id', 'email', 'role', 'status']) as $u) {
    printf("user #%-3d %-30s %-16s %s\n", $u->id, $u->email, $u->role, $u->status);
}

echo "\n=== wellness categories / courses ===\n";
foreach (DB::table('wellness_categories')->orderBy('sort_order')->get(['id', 'key', 'title']) as $w) {
    $courses = DB::table('wellness_courses')->where('category_id', $w->id)->count();
    $lessons = DB::table('wellness_lessons')
        ->whereIn('course_id', DB::table('wellness_courses')->where('category_id', $w->id)->pluck('id'))
        ->count();
    printf("#%-3d %-12s %-30s courses=%-3d lessons=%d\n", $w->id, $w->key, $w->title, $courses, $lessons);
}

echo "\n=== community feature flag keys in use ===\n";
print_r(DB::table('community_feature_flags')->distinct()->pluck('feature_key')->all());
