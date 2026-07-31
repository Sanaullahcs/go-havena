<?php

namespace App\Http\Middleware;

use App\Services\AdminRoleService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCommunityAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (AdminRoleService::isSystemAdmin($user) || AdminRoleService::isActiveCommunityAdmin($user)) {
            return $next($request);
        }

        abort(403, 'Community admin access required');
    }
}
