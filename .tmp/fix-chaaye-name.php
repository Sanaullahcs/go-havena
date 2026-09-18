<?php

use Illuminate\Support\Facades\DB;

DB::table('businesses')->where('id', 44)->update(['name' => 'Chaaye Khana']);
DB::table('deals')->where('business_id', 44)->update([
    'vendor' => 'Chaaye Khana',
    'title' => 'Chaaye Khana — Haly Tower',
]);

foreach (DB::table('businesses')->where('community_id', 52)->orderBy('id')->get(['id', 'name', 'image_url']) as $row) {
    echo $row->id.' '.$row->name.' '.$row->image_url.PHP_EOL;
}
