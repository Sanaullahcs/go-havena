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

    public ?string $highlightQrCidSrc = null;

    public ?string $highlightQrDataUri = null;

    public ?string $highlightQrUrl = null;

    public ?string $highlightQrViewUrl = null;

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
        $inlineCids = EmailBrand::cidsForMail(
            $this->details,
            $this->highlightCode !== null,
            $this->includeAppStoreLinks,
        );
        $inlineMap = array_intersect_key(EmailBrand::inlineImageMap(), array_flip($inlineCids));

        $qrEmbed = null;
        if (filled($this->highlightQrPayload)) {
            try {
                if (filled($this->highlightCode)) {
                    $scope = str_starts_with($this->highlightQrPayload, 'havena://guest') ? 'guest' : 'member';
                    $this->highlightQrUrl = InviteCodeService::qrPublicImageUrl($this->highlightCode, $scope);
                    $this->highlightQrViewUrl = InviteCodeService::qrPublicViewUrl($this->highlightCode, $scope);
                }

                $qr = InviteCodeService::qrEmailImage($this->highlightQrPayload);
                if ($qr) {
                    $this->highlightQrDataUri = $qr['data_uri'];
                    if ($qr['use_cid']) {
                        $this->highlightQrCidSrc = 'cid:invite-qr';
                        $qrEmbed = ['bytes' => $qr['bytes'], 'mime' => $qr['mime']];
                    }
                } elseif (! filled($this->highlightQrUrl)) {
                    Log::warning('Could not generate invite QR for email', [
                        'payload' => $this->highlightQrPayload,
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('Could not embed invite QR in email', ['error' => $e->getMessage()]);
            }
        }

        $this->withSymfonyMessage(function (Email $email) use ($inlineMap, $qrEmbed) {
            foreach ($inlineMap as $cid => $filename) {
                $path = public_path('images/email/'.$filename);
                if (is_file($path)) {
                    $email->embedFromPath($path, $cid);
                }
            }

            if ($qrEmbed) {
                $tmp = tempnam(sys_get_temp_dir(), 'havena-invite-qr-');
                if ($tmp !== false && file_put_contents($tmp, $qrEmbed['bytes']) !== false) {
                    $email->embedFromPath($tmp, 'invite-qr', $qrEmbed['mime']);
                } else {
                    $email->embed($qrEmbed['bytes'], 'invite-qr', $qrEmbed['mime']);
                }
            }
        });
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
                'highlightQrCidSrc' => $this->highlightQrCidSrc,
                'highlightQrDataUri' => $this->highlightQrDataUri,
                'highlightQrUrl' => $this->highlightQrUrl,
                'highlightQrViewUrl' => $this->highlightQrViewUrl,
                'ctaLabel' => $this->ctaLabel,
                'ctaUrl' => $this->ctaUrl,
                'footerNote' => $this->footerNote,
                'includeAppStoreLinks' => $this->includeAppStoreLinks,
            ]),
        );
    }
}
