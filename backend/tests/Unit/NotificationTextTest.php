<?php

namespace Tests\Unit;

use App\Support\NotificationText;
use PHPUnit\Framework\TestCase;

class NotificationTextTest extends TestCase
{
    public function test_clips_long_body_to_500_characters(): void
    {
        $body = str_repeat('Community BBQ details. ', 80);

        $clipped = NotificationText::body($body);

        $this->assertSame(500, mb_strlen($clipped));
        $this->assertStringEndsWith('…', $clipped);
    }

    public function test_keeps_short_body_unchanged(): void
    {
        $this->assertSame('Bring a dish.', NotificationText::body('Bring a dish.'));
    }
}
