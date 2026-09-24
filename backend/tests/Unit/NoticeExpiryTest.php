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

    public function test_event_is_past_only_after_its_scheduled_start_minute(): void
    {
        config(['app.schedule_timezone' => 'America/New_York']);
        Carbon::setTestNow(Carbon::parse('2026-09-24 15:00:00', 'America/New_York'));

        $laterToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => '16:30',
            'event_time_end' => '17:30',
        ];
        $earlierToday = (object) [
            'category' => 'event',
            'event_date' => '2026-09-24',
            'event_time' => '14:00',
            'event_time_end' => '18:00',
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
        $this->assertTrue(NoticeExpiry::isEventSchedulePast($earlierToday));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast($dateOnlyToday));
        $this->assertTrue(NoticeExpiry::isEventSchedulePast($yesterday));
        $this->assertFalse(NoticeExpiry::isEventSchedulePast((object) [
            'category' => 'general',
            'event_date' => '2026-09-23',
            'event_time' => '09:00',
        ]));
    }
}
