<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        putenv('DB_DATABASE=havena_test');
        $_ENV['DB_DATABASE'] = 'havena_test';
        $_SERVER['DB_DATABASE'] = 'havena_test';

        $app = parent::createApplication();

        $app['config']->set('database.connections.mysql.database', 'havena_test');
        $app['config']->set('database.connections.mariadb.database', 'havena_test');

        $configured = (string) $app['config']->get(
            'database.connections.'.$app['config']->get('database.default').'.database'
        );
        if (in_array($configured, ['go_havena', 'havena'], true)) {
            throw new \RuntimeException(
                "Tests refused to boot against live database [{$configured}]. phpunit.xml must force DB_DATABASE=havena_test."
            );
        }

        return $app;
    }

    protected function beforeRefreshingDatabase()
    {
        $this->assertNotLiveDatabase();
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertNotLiveDatabase();
    }

    protected function assertNotLiveDatabase(): void
    {
        $configured = (string) config('database.connections.'.config('database.default').'.database');
        $envDatabase = (string) env('DB_DATABASE');
        $actual = '';
        try {
            $actual = (string) DB::connection()->getDatabaseName();
        } catch (\Throwable) {
            // Connection may not be open yet; config/env checks still apply.
        }

        $live = ['go_havena', 'havena'];
        if (
            in_array($configured, $live, true)
            || in_array($envDatabase, $live, true)
            || in_array($actual, $live, true)
        ) {
            throw new \RuntimeException(
                "Tests refused to use live database [{$configured} / {$envDatabase} / {$actual}]. phpunit.xml must force DB_DATABASE=havena_test."
            );
        }
    }
}
