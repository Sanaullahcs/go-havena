<?php

namespace App\Support;

class CountriesData
{
    /** @return list<array{code: string, name: string}> */
    public static function all(): array
    {
        /** @var list<array{code: string, name: string}> $countries */
        $countries = require database_path('data/countries.php');

        usort($countries, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $countries;
    }

    /** @return list<string> ISO codes with billing exempt policy */
    public static function exemptCodes(): array
    {
        return array_values(array_filter(array_map(
            'strtoupper',
            (array) config('billing.exempt_country_codes', ['PK']),
        )));
    }

    /**
     * Subdivisions grouped by ISO country code.
     *
     * @return array<string, list<array{name: string, code: ?string}>>
     */
    public static function statesByCountry(): array
    {
        $path = database_path('data/states.php');
        if (! is_file($path)) {
            return [];
        }

        /** @var array<string, list<array{name: string, code: ?string}>> $states */
        $states = require $path;

        return is_array($states) ? $states : [];
    }
}
