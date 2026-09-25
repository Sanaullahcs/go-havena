<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function beforeRefreshingDatabase()
    {
        $configured = (string) config('database.connections.'.config('database.default').'.database');
        $envDatabase = (string) env('DB_DATABASE');
        $live = ['go_havena', 'havena'];
        if (in_array($configured, $live, true) || in_array($envDatabase, $live, true)) {
            throw new \RuntimeException(
                "RefreshDatabase refused to run against live database [{$configured} / {$envDatabase}]. phpunit.xml must force DB_DATABASE=havena_test."
            );
        }
    }
}
