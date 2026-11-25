<?php

require __DIR__.'/../vendor/autoload.php';

$envPath = __DIR__.'/../.env';
$secret = null;
$lines = file($envPath, FILE_IGNORE_NEW_LINES);
foreach ($lines as $line) {
    $trim = trim($line);
    if ($trim === '' || str_starts_with($trim, '#')) {
        continue;
    }
    if (str_starts_with($trim, 'STRIPE_SECRET=')) {
        $secret = substr($trim, strlen('STRIPE_SECRET='));
        break;
    }
}

if ($secret === null || $secret === '') {
    fwrite(STDERR, "STRIPE_SECRET missing in .env\n");
    exit(1);
}

$stripe = new Stripe\StripeClient($secret);

$plans = [
    'starter' => ['name' => 'Havena Starter', 'seats' => 50, 'month' => 9900, 'year' => 99000],
    'growth' => ['name' => 'Havena Growth', 'seats' => 150, 'month' => 24900, 'year' => 249000],
    'campus' => ['name' => 'Havena Campus', 'seats' => 500, 'month' => 59900, 'year' => 599000],
];

$priceLines = [];

foreach ($plans as $slug => $plan) {
    $product = $stripe->products->create([
        'name' => $plan['name'],
        'description' => $plan['seats'].' resident seats',
        'metadata' => [
            'plan_slug' => $slug,
            'seat_limit' => (string) $plan['seats'],
        ],
    ]);

    $monthly = $stripe->prices->create([
        'product' => $product->id,
        'unit_amount' => $plan['month'],
        'currency' => 'usd',
        'recurring' => ['interval' => 'month'],
        'metadata' => [
            'plan_slug' => $slug,
            'billing_interval' => 'month',
        ],
    ]);

    $yearly = $stripe->prices->create([
        'product' => $product->id,
        'unit_amount' => $plan['year'],
        'currency' => 'usd',
        'recurring' => ['interval' => 'year'],
        'metadata' => [
            'plan_slug' => $slug,
            'billing_interval' => 'year',
        ],
    ]);

    $upper = strtoupper($slug);
    $priceLines[] = "STRIPE_PRICE_{$upper}_MONTHLY={$monthly->id}";
    $priceLines[] = "STRIPE_PRICE_{$upper}_YEARLY={$yearly->id}";

    echo "{$slug}: product={$product->id} month={$monthly->id} year={$yearly->id}\n";
}

$filtered = array_values(array_filter($lines, function ($line) {
    return ! preg_match('/^STRIPE_PRICE_(STARTER|GROWTH|CAMPUS)_(MONTHLY|YEARLY)=/', trim($line));
}));

while ($filtered && trim(end($filtered)) === '') {
    array_pop($filtered);
}

$filtered[] = '';
foreach ($priceLines as $priceLine) {
    $filtered[] = $priceLine;
}

file_put_contents($envPath, implode(PHP_EOL, $filtered).PHP_EOL);
echo "Price IDs written to .env\n";
