<?php

namespace Tests\Unit;

use App\Services\Saas\PricingCalculator;
use PHPUnit\Framework\TestCase;

class SaasPricingCalculatorTest extends TestCase
{
    private PricingCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new PricingCalculator;
    }

    public function test_graduated_boundaries(): void
    {
        $tiers = [
            ['min' => 1, 'max' => 500, 'unit_cents' => 100],
            ['min' => 501, 'max' => 2500, 'unit_cents' => 80],
            ['min' => 2501, 'max' => 10000, 'unit_cents' => 50],
            ['min' => 10001, 'max' => null, 'unit_cents' => 25],
        ];

        $this->assertSame(100, $this->calculator->graduated(1, $tiers));
        $this->assertSame(100 * 100, $this->calculator->graduated(100, $tiers));
        $this->assertSame(500 * 100, $this->calculator->graduated(500, $tiers));
        $this->assertSame(500 * 100 + 80, $this->calculator->graduated(501, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80, $this->calculator->graduated(2500, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80 + 7500 * 50, $this->calculator->graduated(10000, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80 + 7500 * 50 + 25, $this->calculator->graduated(10001, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80 + 7500 * 50 + 15000 * 25, $this->calculator->graduated(25000, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80 + 7500 * 50 + 40000 * 25, $this->calculator->graduated(50000, $tiers));
        $this->assertSame(500 * 100 + 2000 * 80 + 7500 * 50 + 90000 * 25, $this->calculator->graduated(100000, $tiers));
    }

    public function test_minimum_charge_and_annual_discount(): void
    {
        $quote = $this->calculator->quote([
            'residents' => 1,
            'billing_model' => 'per_resident',
            'interval' => 'year',
            'minimum_monthly_cents' => 5000,
            'annual_discount_bps' => 2000,
            'currency' => 'usd',
            'tiers' => [
                ['min' => 1, 'max' => null, 'unit_cents' => 100],
            ],
        ]);

        $this->assertTrue($quote['available']);
        $this->assertSame(5000, $quote['monthly_cents']);
        $this->assertSame(60000, $quote['annual_before_discount_cents']);
        $this->assertSame(12000, $quote['discount_cents']);
        $this->assertSame(48000, $quote['amount_due_cents']);
        $this->assertTrue($quote['minimum_applied']);
    }

    public function test_community_band_does_not_invent_a_price_past_the_last_band(): void
    {
        $quote = $this->calculator->quote([
            'residents' => 50001,
            'billing_model' => 'per_community',
            'interval' => 'month',
            'tiers' => [
                ['min' => 1, 'max' => 500, 'fixed_cents' => 10000],
                ['min' => 501, 'max' => 50000, 'fixed_cents' => 20000],
            ],
        ]);

        $this->assertFalse($quote['available']);
        $this->assertTrue($quote['quote_required']);
        $this->assertNull($quote['amount_due_cents']);
    }

    public function test_rejects_negative_paths_and_gaps(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->calculator->graduated(10, [
            ['min' => 1, 'max' => 5, 'unit_cents' => 10],
            ['min' => 8, 'max' => null, 'unit_cents' => 5],
        ]);
    }

    public function test_rejects_zero_residents(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->calculator->quote([
            'residents' => 0,
            'billing_model' => 'per_resident',
            'interval' => 'month',
            'tiers' => [['min' => 1, 'max' => null, 'unit_cents' => 1]],
        ]);
    }
}
