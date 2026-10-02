<?php

namespace App\Http\Middleware;

use App\Services\AdminRoleService;
use App\Services\CommunityFeatureService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks community-admin API routes when that feature is off for their community.
 * System admins are unchanged.
 */
class EnsureAdminRouteFeature
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || AdminRoleService::isSystemAdmin($user)) {
            return $next($request);
        }

        $featureKey = $this->featureKey($request->path());
        if ($featureKey) {
            app(CommunityFeatureService::class)->assertResidentCanAccess($user, $featureKey);
        }

        return $next($request);
    }

    private function featureKey(string $path): ?string
    {
        $marker = '/admin/';
        $pos = strpos($path, $marker);
        if ($pos === false) {
            return null;
        }

        $segment = explode('/', substr($path, $pos + strlen($marker)))[0] ?? '';

        return match ($segment) {
            'notices' => 'notices',
            'events' => 'events',
            'alerts' => 'alerts',
            'posts' => 'feed',
            'community-rules' => 'community_rules',
            'documents' => 'documents',
            'amenities', 'amenity-bills' => 'amenities',
            'bookings' => 'bookings',
            'listings', 'deals', 'businesses' => 'marketplace',
            'referrals' => 'refer_and_earn',
            'family-add-member-requests' => 'family',
            default => null,
        };
    }
}
