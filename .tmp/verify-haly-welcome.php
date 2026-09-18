<?php

$paths = [
    storage_path('app/public/notices/haly-welcome.jpg'),
    public_path('storage/notices/haly-welcome.jpg'),
    public_path('storage'),
];
foreach ($paths as $path) {
    echo $path.' exists='.(file_exists($path) ? '1' : '0').' file='.(is_file($path) ? '1' : '0').' dir='.(is_dir($path) ? '1' : '0').' link='.(is_link($path) ? '1' : '0').' size='.(is_file($path) ? filesize($path) : 0)."\n";
}

$link = public_path('storage');
if (is_link($link)) {
    echo 'storage_link='.readlink($link)."\n";
}

$biz = public_path('storage/businesses/haly/haly-chaaye-khana.jpg');
echo 'biz_img exists='.(is_file($biz) ? '1' : '0').' size='.(is_file($biz) ? filesize($biz) : 0)."\n";
