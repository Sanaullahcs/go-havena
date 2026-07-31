<?php

namespace App\Http\Controllers\Concerns;

use App\Services\GuestAccessService;
use Illuminate\Http\Request;

trait BlocksGuestReads
{
    protected function assertGuestCanRead(Request $request, string $feature): void
    {
        GuestAccessService::assertCanAccessFeature($request->user(), $feature);
    }
}
