<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_unique(array_merge(
        [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'https://havena.tabsgi.com',
            'https://www.havena.tabsgi.com',
        ],
        array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')))),
        array_filter([
            env('FRONTEND_URL'),
            env('APP_FRONTEND_URL'),
        ]),
    )))),

    'allowed_origins_patterns' => array_values(array_filter(array_merge(
        env('APP_ENV') === 'local' ? [
            '#^http://192\.168\.\d+\.\d+:\d+$#',
            '#^http://10\.\d+\.\d+\.\d+:\d+$#',
            '#^http://172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$#',
        ] : [],
        array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGIN_PATTERNS', '')))),
    ))),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
