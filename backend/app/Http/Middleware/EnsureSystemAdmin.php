<?php

namespace App\Http\Middleware;

use App\Services\AdminRoleService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSystemAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! AdminRoleService::isSystemAdmin($request->user())) {
            abort(403, 'System admin access required');
        }

        return $next($request);
    }
}
