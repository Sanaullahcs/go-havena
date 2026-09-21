<?php

namespace App\Http\Middleware;

use App\Services\GuestAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureGuestAccessValid
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && GuestAccessService::isGuest($user)) {
            if ($this->isExemptForPendingGuest($request)) {
                return $next($request);
            }

            GuestAccessService::assertGuestAccessValid($user);
        }

        return $next($request);
    }

    private function isExemptForPendingGuest(Request $request): bool
    {
        if ($request->isMethod('GET') && $request->is('*guest-access/status*')) {
            return true;
        }

        $path = trim($request->path(), '/');
        if ($request->isMethod('GET') && (str_ends_with($path, 'v1/me') || $path === 'me')) {
            return true;
        }

        return false;
    }
}
