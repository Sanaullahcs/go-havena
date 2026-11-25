<?php

namespace App\Http\Middleware;

use App\Exceptions\CommunityFeatureException;
use App\Services\AdminRoleService;
use App\Services\CommunityFeatureService;
use App\Support\CommunityFeatureCatalog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureResidentFeature
{
    public function handle(Request $request, Closure $next, string ...$features): Response
    {
        $keys = [];
        foreach ($features as $feature) {
            foreach (explode(',', $feature) as $part) {
                $part = trim($part);
                if ($part !== '') {
                    $keys[] = $part;
                }
            }
        }

        if ($keys === []) {
            return $next($request);
        }

        $user = $request->user();
        if (! $user || AdminRoleService::isSystemAdmin($user)) {
            return $next($request);
        }

        if (AdminRoleService::isCommunityAdminRole($user) && ! AdminRoleService::isResidentMode($user)) {
            return $next($request);
        }

        $service = app(CommunityFeatureService::class);
        $communityId = $service->communityIdForUser($user);

        foreach ($keys as $key) {
            if ($service->isEnabled($communityId, $key)) {
                return $next($request);
            }
        }

        $first = $keys[0];
        $label = CommunityFeatureCatalog::definition($first)['label'] ?? $first;

        throw CommunityFeatureException::disabled($first, $label);
    }
}
