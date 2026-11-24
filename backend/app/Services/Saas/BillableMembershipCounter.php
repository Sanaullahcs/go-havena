<?php

namespace App\Services\Saas;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BillableMembershipCounter
{
    /**
     * Distinct people with an approved resident membership.
     * Staff-only, guest, and admin-only rows are not counted.
     * One person with several units in the same community counts once.
     */
    public function count(int $communityId): int
    {
        if (! Schema::hasTable('community_memberships')) {
            return 0;
        }

        return (int) DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereNotIn('role', ['guest', 'admin', 'staff'])
            ->distinct()
            ->count('user_id');
    }
}
