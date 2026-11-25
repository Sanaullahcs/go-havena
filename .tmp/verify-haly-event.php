<?php
require '/home/gohvena/public_html/prod_apis/vendor/autoload.php';
$app = require '/home/gohvena/public_html/prod_apis/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$n = DB::table('notices')->where('id', 82)->first();
echo json_encode([
    'id' => $n->id ?? null,
    'community_id' => $n->community_id ?? null,
    'title' => $n->title ?? null,
    'category' => $n->category ?? null,
    'status' => $n->status ?? null,
    'review_status' => $n->review_status ?? null,
    'is_pinned' => $n->is_pinned ?? null,
    'event_date' => $n->event_date ?? null,
    'event_time' => $n->event_time ?? null,
    'event_time_end' => $n->event_time_end ?? null,
    'location' => $n->location ?? null,
    'rsvp_enabled' => $n->rsvp_enabled ?? null,
    'capacity' => $n->capacity ?? null,
    'image_url' => $n->image_url ?? null,
    'image_exists' => $n && $n->image_url
        ? file_exists('/home/gohvena/public_html/prod_apis/storage/app/public/notices/haly-ninjahr.jpg')
        : false,
], JSON_UNESCAPED_SLASHES) . "\n";
