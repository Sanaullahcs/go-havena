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
        EmailBrand::attachInlineImages($this);
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
                'preheader' => 'Your Havena verification code expires in 5 minutes.',
                'eyebrow' => 'Verification',
                'heading' => 'Your verification code',
                'intro' => 'Use this code to continue in Havena.',
                'paragraphs' => [
                    'This code expires in 5 minutes. If you did not request it, you can ignore this email.',
                ],
                'details' => [],
                'highlightCode' => $this->code,
                'highlightLabel' => 'Verification code',
                'ctaLabel' => null,
                'ctaUrl' => null,
                'footerNote' => 'Never share this code with anyone. Havena will never ask for it.',
                'includeAppStoreLinks' => false,
            ]),
        );
    }
}
