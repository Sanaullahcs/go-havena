<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send all email
    | messages unless another mailer is explicitly specified when sending
    | the message. All additional mailers can be configured within the
    | "mailers" array. Examples of each type of mailer are provided.
    |
    */

    'default' => env('MAIL_MAILER', 'log'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    | Laravel supports a variety of mail "transport" drivers that can be used
    | when delivering an email. You may specify which one you're using for
    | your mailers below. You may also add additional mailers if needed.
    |
    | Supported: "smtp", "sendmail", "mailgun", "ses", "ses-v2",
    |            "postmark", "log", "array", "failover", "roundrobin"
    |
    */

    'mailers' => [

        'smtp' => [
            'transport' => 'smtp',
            'url' => env('MAIL_URL'),
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 2525),
            'encryption' => env('MAIL_ENCRYPTION', 'tls'),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => (int) env('MAIL_TIMEOUT', 10),
            'local_domain' => env('MAIL_EHLO_DOMAIN'),
        ],

        'ses' => [
            'transport' => 'ses',
        ],

        'postmark' => [
            'transport' => 'postmark',
            // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'sendmail' => [
            'transport' => 'sendmail',
            'path' => env('MAIL_SENDMAIL_PATH', '/usr/sbin/sendmail -bs -i'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'failover' => [
            'transport' => 'failover',
            'mailers' => [
                'smtp',
                'log',
            ],
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all emails sent by your application to be sent from
    | the same address. Here you may specify a name and address that is
    | used globally for all emails that are sent by your application.
    |
    */

    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
        'name' => env('MAIL_FROM_NAME', 'Example'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Contact / demo request inbox
    |--------------------------------------------------------------------------
    */
    'contact_to' => env('MAIL_CONTACT_TO', env('MAIL_FROM_ADDRESS', 'hello@gohavena.com')),

    /*
    |--------------------------------------------------------------------------
    | Brand links used in transactional emails
    |--------------------------------------------------------------------------
    */
    'brand' => [
        'name' => env('MAIL_FROM_NAME', 'Havena'),
        'support' => env('MAIL_FROM_ADDRESS', 'hello@gohavena.com'),
        'tagline' => env('HAVENA_TAGLINE', 'One trusted place for the whole neighborhood.'),
        'logo_url' => env('HAVENA_LOGO_URL'),
        'website_url' => rtrim((string) env('HAVENA_WEBSITE_URL', env('FRONTEND_URL', env('FRONTEND_ADMIN_URL', 'http://localhost:3000'))), '/'),
        'admin_url' => rtrim((string) env('FRONTEND_ADMIN_URL', env('FRONTEND_URL', 'http://localhost:3000')), '/'),
        'app_url' => rtrim((string) env('FRONTEND_USER_URL', env('FRONTEND_URL', 'http://localhost:3000')), '/'),
        'app_store_url' => env('HAVENA_APP_STORE_URL', 'https://apps.apple.com/app/id6800697897'),
        'play_store_url' => env('HAVENA_PLAY_STORE_URL', 'https://play.google.com/store/apps/details?id=com.zsquare.havena'),
        /** Public API base used for hosted email images (invite QR). Falls back to APP_URL. */
        'api_url' => rtrim((string) env('API_PUBLIC_URL', env('APP_URL', 'http://localhost:8000')), '/'),
    ],

];
