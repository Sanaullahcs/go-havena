<?php

namespace Tests\Unit;

use App\Support\NoticeExpiry;
use Carbon\Carbon;
use Tests\TestCase;

class NoticeExpiryTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_event_is_past_only_after_its_scheduled_end_minute(): void
    {
        config(['app.schedule_timezone' => 'America/New_York']);
        Carbon::setTestNow(Carbon::parse('2026-09-24 15:00:00', 'America/New_York'));

        $laterToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => '16:30',
            'event_time_end' => '17:30',
        ];
        $ongoingToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => '14:00',
            'event_time_end' => '18:00',
        ];
        $endedToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => '10:00',
            'event_time_end' => '14:30',
        ];
        $dateOnlyToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => null,
            'event_time_end' => null,
        ];
        $yesterday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-23',
            'event_time' => '23:00',
            'event_time_end' => '23:30',
        ];

        $this->assertFalse(NoticeExpiry::isEventSchedulePast($laterToday));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast($ongoingToday));
        $this->assertTrue(NoticeExpiry::isEventSchedulePast($endedToday));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast($dateOnlyToday));
        $this->assertTrue(NoticeExpiry::isEventSchedulePast($yesterday));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast((object) [
            'category' => 'general',
            'event_date' => '2026-09-23',
            'event_time' => '09:00',
        ]));
    }

    public function test_multi_day_notice_stays_active_until_end_date(): void
    {
        config(['app.schedule_timezone' => 'America/New_York']);
        Carbon::setTestNow(Carbon::parse('2026-09-24 15:00:00', 'America/New_York'));

        $spanning = (object) [
            'category' => 'general',
            'event_date' => '2026-09-23',
            'event_end_date' => '2026-09-25',
            'event_time' => '09:00',
            'event_time_end' => '17:00',
        ];

        $this->assertFalse(NoticeExpiry::isExpired($spanning));
    }

    public function test_event_start_passed_at_start_time_even_if_end_is_later(): void
    {
        config(['app.schedule_timezone' => 'Asia/Karachi']);
        Carbon::setTestNow(Carbon::parse('2026-10-26 17:42:00', 'Asia/Karachi'));

        $startedButNotEnded = (object) [
            'category' => 'event',
            'event_date' => '2026-10-26',
            'event_time' => '17:00',
            'event_time_end' => '19:00',
        ];
        $stillUpcoming = (object) [
            'category' => 'event',
            'event_date' => '2026-10-26',
            'event_time' => '18:00',
            'event_time_end' => '19:00',
        ];
        $tomorrow = (object) [
            'category' => 'event',
            'event_date' => '2026-10-27',
            'event_time' => '10:00',
            'event_time_end' => '12:00',
        ];

        $this->assertTrue(NoticeExpiry::isEventStartPassed($startedButNotEnded));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast($startedButNotEnded));
        $this->assertFalse(NoticeExpiry::isEventStartPassed($stillUpcoming));
        $this->assertFalse(NoticeExpiry::isEventStartPassed($tomorrow));
    }
}
