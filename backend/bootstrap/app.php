<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Console\Scheduling\Schedule;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule) {
        $schedule->command('notices:publish-scheduled')->everyMinute();
        $schedule->command('guests:expire-access')->everyMinute();
        $schedule->command('billing:prune-reservations')->hourly();
        $schedule->command('amenity-bills:process-reminders')->hourly();
        $schedule->command('service-bills:process-reminders')->hourly();
    })
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->prepend(\Illuminate\Http\Middleware\HandleCors::class);

        // API-only app — never redirect guests to a missing web login route (causes 500).
        $middleware->redirectGuestsTo(function (Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return null;
            }

            return null;
        });

        $middleware->alias([
            'system.admin'    => \App\Http\Middleware\EnsureSystemAdmin::class,
            'community.admin' => \App\Http\Middleware\EnsureCommunityAdmin::class,
            'guest.access'    => \App\Http\Middleware\EnsureGuestAccessValid::class,
            'account.access'  => \App\Http\Middleware\EnsureAccountAccessValid::class,
            'resident.feature'=> \App\Http\Middleware\EnsureResidentFeature::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->reportable(function (\Throwable $e) {
            \App\Services\AuditEventLogger::fromException($e);
        });

        $exceptions->renderable(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => $e->getMessage() ?: 'Unauthenticated.'], 401);
            }

            return null;
        });

        // Never leak SQLSTATE / PDO details to API clients (even when APP_DEBUG=true locally).
        $exceptions->renderable(function (\Illuminate\Database\QueryException $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }

            report($e);

            return response()->json([
                'message' => 'We could not complete that request. Please try again in a moment.',
            ], 503);
        });
    })->create();
