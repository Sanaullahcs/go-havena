<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

trait ResolvesPaymentCommunity
{
    /** The resident's approved community; an explicit community_id must be one they belong to. */
    protected function paymentCommunityId(Request $request): int
    {
        $user = $request->user();
        $query = DB::table('community_memberships')
            ->where('user_id', (int) $user->id)
            ->where('status', 'approved');

        if ($request->filled('community_id')) {
            $query->where('community_id', (int) $request->community_id);
        } else {
            $query->orderByRaw('community_id = ? DESC', [(int) ($user->active_context_community_id ?? 0)])
                ->orderByDesc('created_at');
        }

        $membership = $query->first();
        abort_if(! $membership, 422, 'No approved community membership found.');

        return (int) $membership->community_id;
    }
}
