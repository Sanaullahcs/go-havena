<?php

namespace App\Providers;

use App\Contracts\UtilityBillOcrEngine;
use App\Services\LocalLoginAccountRestorer;
use App\Services\UtilityBillOcr\NullUtilityBillOcrEngine;
use App\Services\UtilityBillOcr\TesseractUtilityBillOcrEngine;
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
        $this->app->bind(UtilityBillOcrEngine::class, function () {
            if (! config('utility_bill.ocr_enabled', true)) {
                return new NullUtilityBillOcrEngine;
            }

            return new TesseractUtilityBillOcrEngine(
                (string) config('utility_bill.tesseract_binary', 'tesseract'),
                (string) config('utility_bill.tesseract_lang', 'eng'),
                (string) config('utility_bill.pdftoppm_binary', 'pdftoppm'),
                (int) config('utility_bill.ocr_timeout', 45),
            );
        });
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
