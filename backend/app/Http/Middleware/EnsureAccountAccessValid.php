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
            // Keep the token for re-application flows. Killing it makes the next
            // "add community" submit return 401 Unauthenticated.
            if (! in_array($block['code'] ?? null, [
                'COMMUNITY_REQUEST_REJECTED',
                'MEMBERSHIP_REJECTED',
            ], true)) {
                $user->currentAccessToken()?->delete();
            }

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

        if (
            in_array($request->getMethod(), ['PUT', 'POST'], true)
            && (str_ends_with($path, 'v1/me') || $path === 'me')
        ) {
            return true;
        }

        if ($request->isMethod('POST') && (
            str_ends_with($path, 'v1/me/avatar')
            || str_ends_with($path, 'v1/me/utility-bill')
        )) {
            return true;
        }

        if (
            in_array($request->getMethod(), ['GET', 'POST'], true)
            && (
                str_ends_with($path, 'v1/families/mine')
                || str_ends_with($path, 'v1/families/suggest-number')
                || str_ends_with($path, 'v1/families/check-number')
                || str_ends_with($path, 'v1/families/ensure')
                || $path === 'api/v1/families'
                || str_ends_with($path, 'v1/families')
                || str_ends_with($path, 'v1/families/join')
            )
        ) {
            return true;
        }

        if ($request->isMethod('GET') && str_ends_with($path, 'v1/me/membership-review')) {
            return true;
        }

        if ($request->isMethod('GET') && (
            str_ends_with($path, 'v1/geo/address-suggest')
            || str_ends_with($path, 'v1/geo/address-geocode')
            || str_ends_with($path, 'v1/geo/address-reverse')
        )) {
            return true;
        }

        if ($request->isMethod('POST') && (
            str_ends_with($path, 'v1/communities/request')
            || str_ends_with($path, 'v1/communities/self-serve')
            || str_ends_with($path, 'v1/communities/join-by-invite')
            || (bool) preg_match('#(?:^|/)v1/communities/\d+/join$#', $path)
        )) {
            return true;
        }

        if (in_array($request->getMethod(), ['GET', 'POST'], true)
            && (bool) preg_match('#(?:^|/)v1/communities/\d+/units$#', $path)) {
            return true;
        }

        return false;
    }
}
