<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;

/**
 * Groups inbox notifications into module tabs (events, notices, amenities, others).
 */
class NotificationModule
{
    public const EVENTS = 'events';

    public const NOTICES = 'notices';

    public const AMENITIES = 'amenities';

    public const OTHERS = 'others';

    /** @return list<string> */
    public static function keys(): array
    {
        return [self::EVENTS, self::NOTICES, self::AMENITIES, self::OTHERS];
    }

    public static function applyFilter(Builder $query, string $module): void
    {
        if (! in_array($module, self::keys(), true)) {
            return;
        }

        $query->where(function (Builder $group) use ($module) {
            match ($module) {
                self::EVENTS    => self::applyEventsConstraints($group),
                self::NOTICES   => self::applyNoticesConstraints($group),
                self::AMENITIES => self::applyAmenitiesConstraints($group),
                self::OTHERS    => self::applyOthersConstraints($group),
            };
        });
    }

    public static function countForModule(Builder $base, string $module): int
    {
        if (! in_array($module, self::keys(), true)) {
            return 0;
        }

        $query = clone $base;
        self::applyFilter($query, $module);

        return (int) $query->count();
    }

    /** @return array<string, int> */
    public static function countAllModules(Builder $base): array
    {
        $counts = [];
        foreach (self::keys() as $key) {
            $counts[$key] = self::countForModule($base, $key);
        }

        return $counts;
    }

    private static function applyEventsConstraints(Builder $query): void
    {
        $query
            ->whereIn('title', ['New Event', 'Event Update', 'Event Cancelled'])
            ->orWhere('body', 'like', '%your event%')
            ->orWhere('body', 'like', '%joined the waiting list%')
            ->orWhere('action_url', 'like', '%/admin/events%')
            ->orWhere(function (Builder $sub) {
                self::whereLinkedNoticeCategory($sub, 'event');
            });
    }

    private static function applyNoticesConstraints(Builder $query): void
    {
        $query
            ->where('title', 'New Notice')
            ->orWhere(function (Builder $sub) {
                self::whereLinkedNoticeCategory($sub, null, ['event', 'emergency']);
            });
    }

    private static function applyAmenitiesConstraints(Builder $query): void
    {
        $query
            ->where('action_url', 'like', '%amenit%')
            ->orWhere('action_url', 'like', '%booking%')
            ->orWhere('action_url', 'like', '%/admin/bookings%')
            ->orWhere('title', 'like', '%Amenity%')
            ->orWhere('title', 'like', '%Reservation%')
            ->orWhere('title', 'like', '%booking%')
            ->orWhere('title', 'like', '%Pay for your booking%')
            ->orWhere('body', 'like', '%booking for %')
            ->orWhere('body', 'like', '%Your booking for %');
    }

    private static function applyOthersConstraints(Builder $query): void
    {
        $query
            ->where('action_url', 'like', '%/admin/members%')
            ->orWhere('action_url', 'like', '%/admin/guests%')
            ->orWhere('action_url', 'like', '%/admin/residents%')
            ->orWhere('action_url', 'like', '%/admin/community-admins%')
            ->orWhere('title', 'like', '%Membership%')
            ->orWhere('title', 'like', '%Community membership%')
            ->orWhere('title', 'like', '%Community invitation%')
            ->orWhere('title', 'like', '%Community admin%')
            ->orWhere('title', 'like', '%Guest %')
            ->orWhere('title', 'like', '%Guest access%')
            ->orWhere('title', 'like', '%Member%')
            ->orWhere('title', 'like', '%Account suspended%')
            ->orWhere('title', 'like', '%Provisioned%')
            ->orWhere('body', 'like', '%guest access%')
            ->orWhere('body', 'like', '%membership%');
    }

    /**
     * @param  list<string>|null  $excludeCategories  When set, match notices whose category is NOT in this list.
     */
    private static function whereLinkedNoticeCategory(
        Builder $query,
        ?string $category = null,
        ?array $excludeCategories = null,
    ): void {
        $query->where('action_url', 'like', '/notices/%')
            ->whereExists(function (Builder $sub) use ($category, $excludeCategories) {
                $sub->selectRaw('1')
                    ->from('notices')
                    ->whereNull('notices.deleted_at')
                    ->whereColumn('notices.id', self::noticeIdExpression());

                if ($category !== null) {
                    $sub->where('notices.category', $category);
                }

                if ($excludeCategories !== null && $excludeCategories !== []) {
                    $sub->whereNotIn('notices.category', $excludeCategories);
                }
            });
    }

    private static function noticeIdExpression(): \Illuminate\Contracts\Database\Query\Expression
    {
        return \Illuminate\Support\Facades\DB::raw(
            "CAST(SUBSTRING(app_notifications.action_url FROM 10) AS UNSIGNED)"
        );
    }
}
