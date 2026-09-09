<?php

namespace App\Mail;

use App\Models\ContactSubmission;
use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DemoRequestSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @var array{phone: ?string, community_size: ?string, preferred_time: ?string, note: string}|null */
    public ?array $demo;

    public function __construct(public ContactSubmission $submission)
    {
        $this->demo = $this->parseDemoRequest($submission->message);
        EmailBrand::attachInlineImages($this);
    }

    public function envelope(): Envelope
    {
        $community = trim((string) $this->submission->community);
        $subject = $community !== ''
            ? "New demo request - {$this->submission->name} ({$community})"
            : "New demo request - {$this->submission->name}";

        return new Envelope(
            subject: $subject,
            replyTo: [
                new Address($this->submission->email, $this->submission->name),
            ],
        );
    }

    public function content(): Content
    {
        return new Content(
            html: 'emails.demo-request-html',
            text: 'emails.demo-request',
            with: [
                'submission' => $this->submission,
                'demo' => $this->demo,
                'roleLabel' => match ($this->submission->role) {
                    'admin' => 'Community admin',
                    'other' => 'Board / other',
                    'resident' => 'Resident',
                    default => ucfirst((string) $this->submission->role),
                },
                'adminUrl' => rtrim((string) env('FRONTEND_ADMIN_URL', config('app.url')), '/').'/admin/request-demo',
            ],
        );
    }

    /** @return array{phone: ?string, community_size: ?string, preferred_time: ?string, note: string}|null */
    private function parseDemoRequest(?string $message): ?array
    {
        $raw = trim((string) $message);
        if ($raw === '' || ! str_starts_with($raw, '[Demo request]')) {
            return null;
        }

        $phone = null;
        $size = null;
        $time = null;
        $noteLines = [];
        $pastMeta = false;

        foreach (preg_split("/\r\n|\n|\r/", $raw) ?: [] as $index => $line) {
            $trimmed = trim($line);

            if ($index === 0 && str_starts_with($trimmed, '[Demo request]')) {
                continue;
            }

            if (! $pastMeta) {
                if (preg_match('/^Phone:\s*(.+)$/i', $trimmed, $matches) === 1) {
                    $phone = trim($matches[1]);
                    continue;
                }
                if (preg_match('/^Community size:\s*(.+)$/i', $trimmed, $matches) === 1) {
                    $size = trim($matches[1]);
                    continue;
                }
                if (preg_match('/^Preferred time:\s*(.+)$/i', $trimmed, $matches) === 1) {
                    $time = trim($matches[1]);
                    continue;
                }
                if ($trimmed === '') {
                    $pastMeta = true;
                    continue;
                }
            }

            $noteLines[] = $line;
        }

        return [
            'phone' => $phone !== '' ? $phone : null,
            'community_size' => $size !== '' ? $size : null,
            'preferred_time' => $time !== '' ? $time : null,
            'note' => trim(implode("\n", $noteLines)),
        ];
    }
}
