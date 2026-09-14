<?php

namespace Tests\Unit;

use App\Support\AmenitySlots;
use Tests\TestCase;

class AmenitySlotsTest extends TestCase
{
    public function test_same_day_window_is_not_overnight(): void
    {
        $this->assertFalse(AmenitySlots::isOvernight('08:00', '18:00'));
        $this->assertFalse(AmenitySlots::isOvernight('12:00', '22:00'));
        $this->assertFalse(AmenitySlots::isOvernight('00:00', '04:00'));

        $window = AmenitySlots::resolvedWindow('08:00', '18:00');
        $this->assertSame(8 * 60, $window['start']);
        $this->assertSame(18 * 60, $window['end']);
        $this->assertFalse($window['overnight']);
    }

    public function test_close_at_or_before_open_is_overnight(): void
    {
        $this->assertTrue(AmenitySlots::isOvernight('12:00', '00:00'));
        $this->assertTrue(AmenitySlots::isOvernight('20:00', '00:00'));
        $this->assertTrue(AmenitySlots::isOvernight('22:00', '02:00'));

        $noonToMidnight = AmenitySlots::resolvedWindow('12:00', '00:00');
        $this->assertTrue($noonToMidnight['overnight']);
        $this->assertSame(12 * 60, $noonToMidnight['start']);
        $this->assertSame(24 * 60, $noonToMidnight['end']);

        $eveningToTwo = AmenitySlots::resolvedWindow('22:00', '02:00');
        $this->assertTrue($eveningToTwo['overnight']);
        $this->assertSame(22 * 60, $eveningToTwo['start']);
        $this->assertSame(26 * 60, $eveningToTwo['end']);
    }

    public function test_same_day_slots_keep_existing_labels(): void
    {
        $slots = AmenitySlots::generate('08:00', '10:00', 60, null, '2026-09-15');

        $this->assertSame([
            '8:00 AM - 9:00 AM',
            '9:00 AM - 10:00 AM',
        ], array_column($slots, 'value'));
        $this->assertSame(0, $slots[0]['start_day_offset']);
        $this->assertSame(0, $slots[0]['end_day_offset']);
        $this->assertSame('2026-09-15 08:00:00', $slots[0]['starts_at']);
        $this->assertSame('2026-09-15 09:00:00', $slots[0]['ends_at']);
    }

    public function test_midnight_morning_hours_stay_same_day(): void
    {
        $slots = AmenitySlots::generate('00:00', '04:00', 60, null, '2026-09-15');

        $this->assertSame([
            '12:00 AM - 1:00 AM',
            '1:00 AM - 2:00 AM',
            '2:00 AM - 3:00 AM',
            '3:00 AM - 4:00 AM',
        ], array_column($slots, 'value'));
        $this->assertSame('2026-09-15 00:00:00', $slots[0]['starts_at']);
        $this->assertSame('2026-09-15 04:00:00', $slots[3]['ends_at']);
        $this->assertFalse(AmenitySlots::isOvernight('00:00', '04:00'));
    }

    public function test_noon_to_midnight_generates_through_end_of_day(): void
    {
        $slots = AmenitySlots::generate('12:00', '00:00', 60);

        $this->assertCount(12, $slots);
        $this->assertSame('12:00 PM - 1:00 PM', $slots[0]['value']);
        $this->assertSame('11:00 PM - 12:00 AM', $slots[11]['value']);
        $this->assertSame(0, $slots[11]['start_day_offset']);
        $this->assertSame(1, $slots[11]['end_day_offset']);
    }

    public function test_overnight_slots_cross_midnight_with_next_day_datetimes(): void
    {
        $slots = AmenitySlots::generate('22:00', '02:00', 60, null, '2026-09-15');

        $this->assertSame([
            '10:00 PM - 11:00 PM',
            '11:00 PM - 12:00 AM',
            '12:00 AM - 1:00 AM',
            '1:00 AM - 2:00 AM',
        ], array_column($slots, 'value'));

        $this->assertSame(0, $slots[0]['start_day_offset']);
        $this->assertSame(0, $slots[0]['end_day_offset']);
        $this->assertSame('2026-09-15 22:00:00', $slots[0]['starts_at']);
        $this->assertSame('2026-09-15 23:00:00', $slots[0]['ends_at']);

        $this->assertSame(0, $slots[1]['start_day_offset']);
        $this->assertSame(1, $slots[1]['end_day_offset']);
        $this->assertSame('2026-09-15 23:00:00', $slots[1]['starts_at']);
        $this->assertSame('2026-09-16 00:00:00', $slots[1]['ends_at']);

        $this->assertSame(1, $slots[2]['start_day_offset']);
        $this->assertSame(1, $slots[2]['end_day_offset']);
        $this->assertSame('2026-09-16 00:00:00', $slots[2]['starts_at']);
        $this->assertSame('2026-09-16 01:00:00', $slots[2]['ends_at']);

        $this->assertSame('2026-09-16 01:00:00', $slots[3]['starts_at']);
        $this->assertSame('2026-09-16 02:00:00', $slots[3]['ends_at']);
    }

    public function test_hours_display_keeps_twelve_hour_labels_for_overnight(): void
    {
        $this->assertSame('12:00 PM - 12:00 AM', AmenitySlots::formatHoursDisplay('12:00', '00:00'));
        $this->assertSame('8:00 PM - 12:00 AM', AmenitySlots::formatHoursDisplay('20:00', '00:00'));
        $this->assertSame('10:00 PM - 2:00 AM', AmenitySlots::formatHoursDisplay('22:00', '02:00'));
        $this->assertSame('8:00 AM - 6:00 PM', AmenitySlots::formatHoursDisplay('08:00', '18:00'));
    }

    public function test_slot_labels_match_hyphen_and_en_dash(): void
    {
        $this->assertTrue(AmenitySlots::slotLabelsMatch('12:00 AM - 1:00 AM', '12:00 AM – 1:00 AM'));
        $this->assertSame('12:00 AM - 1:00 AM', AmenitySlots::normalizeSlotLabel('12:00 AM – 1:00 AM'));
    }
}
