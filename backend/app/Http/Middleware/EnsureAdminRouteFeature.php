<?php

namespace App\Http\Middleware;

use App\Services\AdminRoleService;
use App\Services\CommunityFeatureService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        $service = app(CommunityFeatureService::class);
        $featureKey = $this->featureKey($request);
        if ($featureKey) {
            $service->assertResidentCanAccess($user, $featureKey);
        } elseif ($this->adminSegment($request) === 'notices') {
            $this->assertAnyContentFeature($service, $user);
        }

        return $next($request);
    }

    private function assertAnyContentFeature(CommunityFeatureService $service, $user): void
    {
        $communityId = $service->communityIdForUser($user);
        foreach (['notices', 'events', 'alerts'] as $key) {
            if ($service->isEnabled($communityId, $key)) {
                return;
            }
        }

        $service->assertResidentCanAccess($user, 'notices');
    }

    private function adminSegment(Request $request): string
    {
        return $this->adminParts($request)[0] ?? '';
    }

    /**
     * @return list<string>
     */
    private function adminParts(Request $request): array
    {
        $path = $request->path();
        $marker = '/admin/';
        $pos = strpos($path, $marker);
        if ($pos === false) {
            return [];
        }

        return explode('/', substr($path, $pos + strlen($marker)));
    }

    private function featureKey(Request $request): ?string
    {
        $parts = $this->adminParts($request);
        $segment = $parts[0] ?? '';

        if ($segment === 'notices') {
            return $this->featureForNoticeRoute($request, $parts);
        }

        return match ($segment) {
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

    /**
     * Notices, events, and alerts share /admin/notices. Gate the request by the
     * item being read or changed so a disabled Notices feature does not block Events.
     *
     * @param  list<string>  $parts
     */
    private function featureForNoticeRoute(Request $request, array $parts): ?string
    {
        $recordId = $parts[1] ?? '';
        if ($recordId !== '' && ctype_digit($recordId)) {
            $category = DB::table('notices')->where('id', (int) $recordId)->value('category');

            return CommunityFeatureService::featureKeyForNoticeCategory(
                $category ? (string) $category : null,
            );
        }

        $group = strtolower((string) $request->input('category_group', ''));
        if ($group === 'events') {
            return 'events';
        }
        if ($group === 'alerts') {
            return 'alerts';
        }
        if ($group === 'notices') {
            return 'notices';
        }

        $category = strtolower((string) $request->input('category', ''));
        if ($category !== '' && $category !== 'all') {
            return CommunityFeatureService::featureKeyForNoticeCategory($category);
        }

        return null;
    }
}
