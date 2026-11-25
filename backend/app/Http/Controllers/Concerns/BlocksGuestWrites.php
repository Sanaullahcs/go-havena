<?php

namespace App\Http\Controllers\Concerns;

use App\Services\GuestAccessService;
use Illuminate\Http\Request;

trait BlocksGuestWrites
{
    protected function assertNotGuestWrite(Request $request, string $action): void
    {
        GuestAccessService::assertCanWrite($request->user(), $action);
    }
}
