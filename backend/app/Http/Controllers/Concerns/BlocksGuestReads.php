<?php

namespace App\Http\Controllers\Concerns;

use App\Services\GuestAccessService;
use App\Services\GuestActivityService;
use Illuminate\Http\Request;

trait BlocksGuestReads
{
    protected function assertGuestCanRead(Request $request, string $feature): void
    {
        $user = $request->user();
        GuestAccessService::assertCanAccessFeature($user, $feature);
        GuestActivityService::logView($user, $feature);
    }
}
