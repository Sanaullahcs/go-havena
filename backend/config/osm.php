<?php

return [
    'user_agent' => env('OSM_USER_AGENT', 'Havena/1.0 (https://gohavena.com)'),
    'photon_url' => env('OSM_PHOTON_URL', 'https://photon.komoot.io/api/'),
    'photon_timeout' => (int) env('OSM_PHOTON_TIMEOUT', 3),
    'nominatim_url' => env('OSM_NOMINATIM_URL', 'https://nominatim.openstreetmap.org/search'),
    'nominatim_timeout' => (int) env('OSM_NOMINATIM_TIMEOUT', 12),
    'nominatim_reverse_url' => env('OSM_NOMINATIM_REVERSE_URL', 'https://nominatim.openstreetmap.org/reverse'),
    'overpass_urls' => [
        env('OSM_OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
        'https://overpass.openstreetmap.fr/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ],
    'overpass_timeout' => (int) env('OSM_OVERPASS_TIMEOUT', 25),
    'overpass_max_elements' => (int) env('OSM_OVERPASS_MAX_ELEMENTS', 150),
    'radius_meters' => 3000,
    'cache_seconds' => 3600,
    'geocode_in_tests' => (bool) env('OSM_GEOCODE_IN_TESTS', false),
];
