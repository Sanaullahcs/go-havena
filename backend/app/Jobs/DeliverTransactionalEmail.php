<?php

namespace App\Jobs;

use App\Mail\HavenaTransactionalMail;
use App\Services\LifecycleMailService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class DeliverTransactionalEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    /**
     * @param  list<string>  $paragraphs
     * @param  list<array{label: string, value: string}>  $details
     */
    public function __construct(
        public string $type,
        public string $contextKey,
        public string $email,
        public string $subjectLine,
        public string $preheader,
        public string $eyebrow,
        public string $heading,
        public string $intro,
        public array $paragraphs,
        public array $details,
        public ?string $ctaLabel,
        public ?string $ctaUrl,
        public ?string $footerNote,
    ) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120, 300];
    }

    public function handle(LifecycleMailService $mail): void
    {
        $mail->sendOnce(
            $this->type,
            $this->contextKey,
            $this->email,
            new HavenaTransactionalMail(
                subjectLine: $this->subjectLine,
                preheader: $this->preheader,
                eyebrow: $this->eyebrow,
                heading: $this->heading,
                intro: $this->intro,
                paragraphs: $this->paragraphs,
                details: $this->details,
                ctaLabel: $this->ctaLabel,
                ctaUrl: $this->ctaUrl,
                footerNote: $this->footerNote,
            ),
            true,
        );
    }

    public function failed(Throwable $exception): void
    {
        Log::error('Transactional email failed after retries', [
            'type' => $this->type,
            'context_key' => $this->contextKey,
            'email' => $this->email,
            'error' => $exception->getMessage(),
        ]);
    }
}
