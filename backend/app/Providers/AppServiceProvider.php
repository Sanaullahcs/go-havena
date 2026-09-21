<?php

namespace App\Providers;

use App\Services\AuditEventLogger;
use App\Support\EmailBrand;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
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

        Event::listen(JobFailed::class, [AuditEventLogger::class, 'jobFailed']);

        View::composer('emails.*', function ($view) {
            foreach (EmailBrand::viewData() as $key => $value) {
                if (! array_key_exists($key, $view->getData())) {
                    $view->with($key, $value);
                }
            }
        });
    }
}
