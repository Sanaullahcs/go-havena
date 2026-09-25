<?php

namespace Tests\Unit;

use App\Support\PhoneNormalizer;
use Tests\TestCase;

class PhoneNormalizerTest extends TestCase
{
    public function test_accept_follows_country_numbering_rules(): void
    {
        $this->assertNull(PhoneNormalizer::accept('+92435437875843'));
        $this->assertNull(PhoneNormalizer::accept('+92300123456'));
        $this->assertSame('+923001234567', PhoneNormalizer::accept('+923001234567'));
        $this->assertSame('+14155552671', PhoneNormalizer::accept('+14155552671'));
        $this->assertSame('+15555550100', PhoneNormalizer::normalize('+15555550100'));
        $this->assertNull(PhoneNormalizer::accept('+15555550100'));
    }

    public function test_format_for_display_uses_us_national_style(): void
    {
        $this->assertSame('(555) 555-0100', PhoneNormalizer::formatForDisplay('+15555550100'));
        $this->assertSame('(555) 555-0200', PhoneNormalizer::formatForDisplay('5555550200'));
        $this->assertSame('(555) 555-0200', PhoneNormalizer::displayContact('+15555550200', 'admin@example.com'));
    }

    public function test_display_contact_falls_back_to_email(): void
    {
        $this->assertSame('admin@example.com', PhoneNormalizer::displayContact(null, 'admin@example.com'));
    }

    public function test_display_contact_formats_placeholder_email(): void
    {
        $this->assertSame('(555) 555-0200', PhoneNormalizer::displayContact(null, '15555550200@phone.havena.local'));
        $this->assertSame('(555) 555-0100', PhoneNormalizer::displayName('', '+15555550100', '15555550100@phone.havena.local'));
        $this->assertSame('Jane Doe', PhoneNormalizer::displayName('Jane Doe', '+15555550100'));
    }
}
