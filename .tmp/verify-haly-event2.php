<?php
require '/home/gohvena/public_html/prod_apis/vendor/autoload.php';
$app = require '/home/gohvena/public_html/prod_apis/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$n = DB::table('notices')->where('id', 82)->first();
$public = public_path('storage/notices/haly-ninjahr.jpg');
$storage = storage_path('app/public/notices/haly-ninjahr.jpg');
echo json_encode([
    'audience_type' => $n->audience_type ?? null,
    'requires_rsvp' => $n->requires_rsvp ?? null,
    'event_capacity' => $n->event_capacity ?? null,
    'is_global' => $n->is_global ?? null,
    'author_id' => $n->author_id ?? null,
    'published_at' => $n->published_at ?? null,
    'deleted_at' => $n->deleted_at ?? null,
    'storage_size' => is_file($storage) ? filesize($storage) : 0,
    'public_size' => is_file($public) ? filesize($public) : 0,
], JSON_UNESCAPED_SLASHES) . "\n";
