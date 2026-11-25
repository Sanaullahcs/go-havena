<?php

namespace Tests\Unit;

use App\Support\DealMenu;
use PHPUnit\Framework\TestCase;

class DealMenuTest extends TestCase
{
    public function test_sanitize_keeps_named_items_and_drops_empty_ones(): void
    {
        $items = DealMenu::sanitizeItems([
            ['name' => '  Soup  ', 'description' => 'Daily', 'price' => '$6', 'image_url' => '/storage/deals/soup.jpg'],
            ['name' => '', 'price' => '$3'],
            ['description' => 'No name'],
        ]);

        $this->assertCount(1, $items);
        $this->assertSame('Soup', $items[0]['name']);
        $this->assertSame('Daily', $items[0]['description']);
        $this->assertSame('$6', $items[0]['price']);
        $this->assertSame('/storage/deals/soup.jpg', $items[0]['image_url']);
    }

    public function test_decode_accepts_json_strings(): void
    {
        $decoded = DealMenu::decode(json_encode([
            ['name' => 'Iced Coffee', 'price' => '4'],
        ]));

        $this->assertSame('Iced Coffee', $decoded[0]['name']);
        $this->assertSame('4', $decoded[0]['price']);
    }
}
