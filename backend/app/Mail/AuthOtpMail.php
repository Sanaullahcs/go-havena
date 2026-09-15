<?php

namespace App\Mail;

use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AuthOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $code)
    {
        EmailBrand::attachInlineImages($this, EmailBrand::cidsForMail([], true));
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Havena verification code',
        );
    }

    public function content(): Content
    {
        return new Content(
            html: 'emails.transactional-html',
            text: 'emails.transactional-text',
            with: array_merge(EmailBrand::viewData(), [
                'preheader' => 'Your verification code expires in 5 minutes. Use it to sign in to Havena.',
                'eyebrow' => 'Verification',
                'heading' => 'Your verification code',
                'intro' => 'Use the verification code below to continue signing in to Havena.',
                'paragraphs' => [
                    'This code will expire in 5 minutes. If you did not request this code, please ignore this email.',
                ],
                'details' => [],
                'highlightCode' => $this->code,
                'highlightLabel' => 'Verification code',
                'highlightQrSrc' => null,
                'ctaLabel' => null,
                'ctaUrl' => null,
                'footerNote' => 'Never share this code with anyone. Havena will never ask for it.',
                'includeAppStoreLinks' => false,
            ]),
        );
    }
}
