<?php

namespace Tests\Feature;

use App\Services\InviteCodeService;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class InviteQrImageTest extends TestCase
{
    public function test_signed_invite_qr_endpoint_returns_png(): void
    {
        config(['mail.brand.api_url' => 'https://api.example.test']);

        $url = InviteCodeService::qrPublicImageUrl('NBR-ABCD-2345');
        $this->assertNotNull($url);
        $this->assertStringContainsString('invite-qr.png', $url);

        $response = $this->get($url);

        $response->assertOk();
        $response->assertHeader('Content-Type', 'image/png');
        $this->assertStringStartsWith("\x89PNG\r\n\x1a\n", $response->getContent());
    }

    public function test_invite_qr_endpoint_rejects_invalid_signature(): void
    {
        $response = $this->get('/api/v1/public/invite-qr.png?scope=member&code=NBR-ABCD-2345');

        $response->assertForbidden();
    }

    public function test_invite_email_prefers_public_qr_url_when_configured(): void
    {
        config(['mail.brand.api_url' => 'https://api.example.test']);

        $code = 'NBR-ABCD-2345';
        $mailable = new \App\Mail\HavenaTransactionalMail(
            subjectLine: 'You are invited',
            preheader: 'Use your invite code.',
            eyebrow: 'Invitation',
            heading: 'You are invited',
            intro: 'Enter or scan your invite code.',
            highlightCode: $code,
            highlightLabel: 'Invite code',
            highlightQrPayload: InviteCodeService::qrPayload($code),
        );

        $html = $mailable->render();

        $this->assertNotNull($mailable->highlightQrUrl);
        $this->assertNotNull($mailable->highlightQrViewUrl);
        $this->assertStringContainsString('invite-qr.png', $html);
        $this->assertStringContainsString('api.example.test', $html);
        $this->assertStringContainsString('View invite QR code', $html);
        $this->assertStringNotContainsString('data:image/', $html);
    }

    public function test_invite_qr_view_page_renders_image(): void
    {
        config(['mail.brand.api_url' => 'https://api.example.test']);

        $code = 'NBR-ABCD-2345';
        $viewUrl = InviteCodeService::qrPublicViewUrl($code);
        $this->assertNotNull($viewUrl);
        $this->assertStringContainsString('/public/invite-qr', $viewUrl);

        $response = $this->get($viewUrl);

        $response->assertOk();
        $response->assertSee('Your invite QR code', false);
        $response->assertSee($code, false);
        $response->assertSee('invite-qr.png', false);
    }

    public function test_production_api_url_derived_when_local_app_url_and_gohavena_mail(): void
    {
        config([
            'app.url' => 'http://192.168.0.134:8000',
            'mail.brand.api_url' => 'http://192.168.0.134:8000',
            'mail.from.address' => 'hello@gohavena.com',
            'mail.mailers' => array_merge((array) config('mail.mailers'), [
                'smtp' => array_merge((array) config('mail.mailers.smtp'), [
                    'host' => 'mail.gohavena.com',
                ]),
            ]),
        ]);

        $this->assertSame('https://api.gohavena.com', InviteCodeService::emailImageBaseUrl());

        $url = InviteCodeService::qrPublicImageUrl('NBR-ABCD-2345');
        $this->assertNotNull($url);
        $this->assertStringStartsWith('https://api.gohavena.com/', $url);
    }
}
