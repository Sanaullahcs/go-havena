<?php

namespace App\Mail;

use App\Services\InviteCodeService;
use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mime\Email;

class HavenaTransactionalMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  list<string>  $paragraphs
     * @param  list<array{label: string, value: string}>  $details
     */
    public function __construct(
        public string $subjectLine,
        public string $preheader,
        public string $eyebrow,
        public string $heading,
        public string $intro,
        public array $paragraphs = [],
        public array $details = [],
        public ?string $highlightCode = null,
        public ?string $highlightLabel = null,
        public ?string $highlightQrPayload = null,
        public ?string $ctaLabel = null,
        public ?string $ctaUrl = null,
        public ?string $footerNote = null,
        public bool $includeAppStoreLinks = false,
    ) {
        EmailBrand::attachInlineImages($this, EmailBrand::cidsForMail(
            $this->details,
            $this->highlightCode !== null,
            $this->includeAppStoreLinks,
        ));

        if (filled($this->highlightQrPayload)) {
            try {
                $png = InviteCodeService::qrPngBytes($this->highlightQrPayload);
                $this->withSymfonyMessage(function (Email $email) use ($png) {
                    $email->embed($png, 'invite-qr', 'image/png');
                });
            } catch (\Throwable $e) {
                Log::warning('Could not embed invite QR in email', ['error' => $e->getMessage()]);
                $this->highlightQrPayload = null;
            }
        }
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->subjectLine,
        );
    }

    public function content(): Content
    {
        return new Content(
            html: 'emails.transactional-html',
            text: 'emails.transactional-text',
            with: array_merge(EmailBrand::viewData(), [
                'preheader' => $this->preheader,
                'eyebrow' => $this->eyebrow,
                'heading' => $this->heading,
                'intro' => $this->intro,
                'paragraphs' => $this->paragraphs,
                'details' => $this->details,
                'highlightCode' => $this->highlightCode,
                'highlightLabel' => $this->highlightLabel,
                'highlightQrSrc' => filled($this->highlightQrPayload) ? 'cid:invite-qr' : null,
                'ctaLabel' => $this->ctaLabel,
                'ctaUrl' => $this->ctaUrl,
                'footerNote' => $this->footerNote,
                'includeAppStoreLinks' => $this->includeAppStoreLinks,
            ]),
        );
    }
}
