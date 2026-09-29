<?php

namespace App\Providers;

use App\Services\LocalLoginAccountRestorer;
use App\Support\EmailBrand;
use App\Support\TlsCaBundle;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    private static bool $restoringLoginAccounts = false;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // WAMP ships MariaDB; utf8mb4 needs a shorter default index length.
        Schema::defaultStringLength(191);
        TlsCaBundle::apply();

        View::composer('emails.*', function ($view) {
            foreach (EmailBrand::viewData() as $key => $value) {
                if (! array_key_exists($key, $view->getData())) {
                    $view->with($key, $value);
                }
            }
        });

        Event::listen(MigrationsEnded::class, function () {
            $this->restoreLocalLoginAccountsIfMissing(force: true);
        });

        $this->app->booted(function () {
            $this->restoreLocalLoginAccountsIfMissing();
        });
    }

    private function restoreLocalLoginAccountsIfMissing(bool $force = false): void
    {
        if (! $this->app->environment('local') || $this->app->runningUnitTests()) {
            return;
        }

        if (! $force && $this->app->runningInConsole() && PHP_SAPI !== 'cli-server') {
            return;
        }

        if (self::$restoringLoginAccounts) {
            return;
        }

        try {
            $restorer = $this->app->make(LocalLoginAccountRestorer::class);
            if (! $restorer->usersAreMissing()) {
                return;
            }

            self::$restoringLoginAccounts = true;
            // Users only — full TGI demo data is too slow/unsafe to seed during HTTP boot.
            $restorer->restoreUsers();
        } catch (\Throwable $e) {
            report($e);
        } finally {
            self::$restoringLoginAccounts = false;
        }
    }
}
