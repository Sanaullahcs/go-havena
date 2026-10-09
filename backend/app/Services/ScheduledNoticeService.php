<?php

namespace App\Services;

use App\Support\NoticeSchedule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ScheduledNoticeService
{
    /** Publish notices/events whose scheduled_at has passed. Returns count published. */
    public static function publishDue(): int
    {
        return (int) Cache::remember('notices:publish-due', 60, fn () => self::publishDueNow());
    }

    private static function publishDueNow(): int
    {
        $candidates = DB::table('notices')
            ->whereNull('deleted_at')
            ->whereNotNull('scheduled_at')
            ->where('status', 'draft')
            ->where('review_status', 'approved')
            ->get();

        if ($candidates->isEmpty()) {
            return 0;
        }

        $now   = now();
        $count = 0;

        foreach ($candidates as $notice) {
            if (! NoticeSchedule::isStoredDue($notice->scheduled_at, (int) $notice->community_id)) {
                continue;
            }

            DB::table('notices')->where('id', $notice->id)->update([
                'status'       => 'published',
                'published_at' => $now,
                'updated_at'   => $now,
            ]);

            $fresh = DB::table('notices')->where('id', $notice->id)->first();
            if ($fresh) {
                NoticeAudienceService::notifyForNotice($fresh, null, (int) $fresh->author_id);
            }

            $count++;
        }

        return $count;
    }
}
