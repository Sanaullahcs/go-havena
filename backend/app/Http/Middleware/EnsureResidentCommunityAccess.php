<?php

namespace App\Http\Middleware;

use App\Services\Landlord\LandlordAccessService;
use App\Services\UserActingContextService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks resident social routes only when approved ownership exists and the
 * resident app is not open yet (live-here ownership with no residency).
 * Rented and vacant owners keep the resident app; do not treat them as owner-only.
 */
class EnsureResidentCommunityAccess
{
    /** @var list<string> */
    private array $ownerOnlyAllow = [
        'api/v1/me',
        'api/v1/landlord',
        'api/v1/units',
        'api/v1/communities',
        'api/v1/property-services',
        'api/v1/service-bills',
        'api/v1/payments',
        'api/v1/billing',
        'api/v1/geo',
        'api/v1/locations',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $path = $request->path();
        $allowed = false;
        foreach ($this->ownerOnlyAllow as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix.'/')) {
                $allowed = true;
                break;
            }
        }
        if ($allowed) {
            return $next($request);
        }

        $communityId = UserActingContextService::currentCommunityId($user);
        if (! $communityId && $request->filled('community_id')) {
            $communityId = (int) $request->query('community_id');
        }
        if (! $communityId) {
            return $next($request);
        }

        $access = app(LandlordAccessService::class)->resolve((int) $user->id, (int) $communityId);
        if ($access['owner_only']) {
            return response()->json([
                'message' => 'This community is available in the landlord portfolio until a residency is approved.',
                'code' => 'owner_only',
            ], 403);
        }

        return $next($request);
    }
}
