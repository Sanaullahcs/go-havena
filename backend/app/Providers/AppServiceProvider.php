<?php

namespace App\Providers;

use App\Support\EmailBrand;
use App\Support\TlsCaBundle;
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
        TlsCaBundle::apply();

        View::composer('emails.*', function ($view) {
            foreach (EmailBrand::viewData() as $key => $value) {
                if (! array_key_exists($key, $view->getData())) {
                    $view->with($key, $value);
                }
            }
        });
    }
}
