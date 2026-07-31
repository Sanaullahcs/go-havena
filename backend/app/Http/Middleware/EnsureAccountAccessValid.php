<?php

namespace App\Http\Middleware;

use App\Services\CommunityLifecycleService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountAccessValid
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $this->isExempt($request)) {
            return $next($request);
        }

        $block = app(CommunityLifecycleService::class)->authenticationBlock(
            $user,
            portal: null,
            includeRejections: true,
        );

        if ($block) {
            $user->currentAccessToken()?->delete();

            return response()->json(
                app(CommunityLifecycleService::class)->enrichBlockResponse($block, $user),
                403,
            );
        }

        return $next($request);
    }

    private function isExempt(Request $request): bool
    {
        if ($request->isMethod('POST') && $request->is('*auth/logout*')) {
            return true;
        }

        if ($request->isMethod('GET') && $request->is('*guest-access/status*')) {
            return true;
        }

        $path = trim($request->path(), '/');

        if ($request->isMethod('GET') && (str_ends_with($path, 'v1/me') || $path === 'me')) {
            return true;
        }

        if ($request->isMethod('PUT') && (str_ends_with($path, 'v1/me') || $path === 'me')) {
            return true;
        }

        if ($request->isMethod('GET') && str_ends_with($path, 'v1/me/membership-review')) {
            return true;
        }

        return false;
    }
}
