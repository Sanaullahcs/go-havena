<?php

namespace App\Http\Middleware;

use App\Services\AdminRoleService;
use App\Services\CommunityAdminAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCommunityAdmin
{
    /**
     * Paths that pending (onboarding) community admins may call before full access.
     * Everything else requires platform approval + billing complete.
     *
     * @var list<string>
     */
    private array $onboardingAllowPrefixes = [
        'api/v1/admin/billing',
        'api/v1/admin/referrals',
        'api/v1/admin/resident-features',
        'api/v1/plaid',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (AdminRoleService::isResidentMode($user)) {
            return response()->json([
                'message' => 'Switch back to Admin Mode to use community admin tools.',
                'code' => 'RESIDENT_MODE_ACTIVE',
            ], 403);
        }

        if (AdminRoleService::isSystemAdmin($user)) {
            return $next($request);
        }

        if (AdminRoleService::isActiveCommunityAdmin($user)) {
            $access = app(CommunityAdminAccessService::class)->accessPayload($user);
            if ($access['can_use_dashboard'] || $this->isOnboardingBillingPath($request)) {
                return $next($request);
            }

            return response()->json([
                'message' => 'Complete billing and wait for system approval before using the dashboard.',
                'code' => 'COMMUNITY_ADMIN_ACCESS_REQUIRED',
                'access' => $access,
            ], 403);
        }

        // Pending community admins: billing/setup only.
        if (AdminRoleService::isOnboardingCommunityAdmin($user) && $this->isOnboardingBillingPath($request)) {
            return $next($request);
        }

        abort(403, 'Community admin access required');
    }

    private function isOnboardingBillingPath(Request $request): bool
    {
        $path = trim($request->path(), '/');

        foreach ($this->onboardingAllowPrefixes as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix.'/')) {
                return true;
            }
        }

        return false;
    }
}
