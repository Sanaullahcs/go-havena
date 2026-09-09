<?php

namespace Tests\Feature;

use App\Mail\AuthOtpMail;
use App\Mail\HavenaTransactionalMail;
use App\Support\AppUrls;
use Tests\TestCase;

class EmailTemplateTest extends TestCase
{
    public function test_transactional_html_includes_havena_branding(): void
    {
        $mailable = new HavenaTransactionalMail(
            subjectLine: 'Welcome to Havena',
            preheader: 'Thanks for creating your community admin account.',
            eyebrow: 'Welcome',
            heading: 'Thanks for joining Havena',
            intro: 'Your community admin account is ready.',
            paragraphs: ['Sign in with this email address.'],
            details: [['label' => 'Community', 'value' => 'Palm Court']],
            ctaLabel: 'Open dashboard',
            ctaUrl: 'https://gohavena.com/admin',
            includeAppStoreLinks: true,
        );

        $html = $mailable->render();

        $this->assertStringContainsString('alt="Havena"', $html);
        $this->assertStringContainsString('One trusted place for the whole neighborhood.', $html);
        $this->assertStringContainsString('Download on the App Store', $html);
        $this->assertStringContainsString('Get it on Google Play', $html);
        $this->assertStringContainsString('Privacy', $html);
        $this->assertStringContainsString('Terms', $html);
        $this->assertStringContainsString('#0A2A43', $html);
        $this->assertStringContainsString('#14B8A6', $html);
        $this->assertStringContainsString(AppUrls::privacyUrl(), $html);
        $this->assertStringContainsString('href="https://gohavena.com/admin"', $html);
    }

    public function test_otp_html_uses_the_same_branded_layout(): void
    {
        $html = (new AuthOtpMail('221322'))->render();

        $this->assertStringContainsString('alt="Havena"', $html);
        $this->assertStringContainsString('221322', $html);
        $this->assertStringContainsString('Verification', $html);
        $this->assertStringContainsString('One trusted place for the whole neighborhood.', $html);
    }
}
