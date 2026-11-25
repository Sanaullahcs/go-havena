<?php

namespace App\Jobs;

use App\Services\AgreementService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class FinalizeAgreementSignaturePdf implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public int $signatureId,
    ) {}

    public function handle(AgreementService $agreements): void
    {
        $agreements->finalizeSignedAgreementPdf($this->signatureId);
    }

    public function failed(Throwable $exception): void
    {
        Log::warning('FinalizeAgreementSignaturePdf failed', [
            'signature_id' => $this->signatureId,
            'message' => $exception->getMessage(),
        ]);
    }
}