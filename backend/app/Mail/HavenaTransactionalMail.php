<?php

namespace App\Mail;

use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

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
        public ?string $ctaLabel = null,
        public ?string $ctaUrl = null,
        public ?string $footerNote = null,
        public bool $includeAppStoreLinks = false,
    ) {
        EmailBrand::attachInlineImages($this);
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
                'ctaLabel' => $this->ctaLabel,
                'ctaUrl' => $this->ctaUrl,
                'footerNote' => $this->footerNote,
                'includeAppStoreLinks' => $this->includeAppStoreLinks,
            ]),
        );
    }
}
