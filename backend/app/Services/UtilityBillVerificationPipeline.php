<?php

namespace App\Services;

use App\Contracts\UtilityBillOcrEngine;
use App\Support\UtilityBillDocumentVerdict;
use Illuminate\Http\UploadedFile;

/**
 * Middleware-style pipeline: heuristic document validation, then OCR text validation.
 */
class UtilityBillVerificationPipeline
{
    public function __construct(
        private readonly UtilityBillDocumentValidator $documentValidator,
        private readonly UtilityBillTextExtractor $textExtractor,
        private readonly UtilityBillOcrEngine $ocrEngine,
        private readonly UtilityBillOcrTextValidator $ocrTextValidator,
    ) {}

    public function verify(UploadedFile $file): UtilityBillDocumentVerdict
    {
        $middleware = $this->documentValidator->validate($file);
        if ($this->isTerminalReject($middleware)) {
            return $middleware;
        }

        $embedded = $this->textExtractor->embeddedTextFromFile($file);
        $ocrText = $this->ocrEngine->extractText($file);

        $combined = trim(implode("\n", array_filter([$embedded, $ocrText ?? ''])));
        if ($combined === '') {
            return $this->whenOcrUnavailable($middleware);
        }

        $ocrVerdict = $this->ocrTextValidator->validate($combined);
        if ($ocrVerdict->shouldReject()) {
            return $this->resolveOcrReject($middleware, $ocrVerdict);
        }

        return $this->mergeVerdicts($middleware, $ocrVerdict);
    }

    private function resolveOcrReject(
        UtilityBillDocumentVerdict $middleware,
        UtilityBillDocumentVerdict $ocr,
    ): UtilityBillDocumentVerdict {
        if ($ocr->reason === 'ocr_no_document_terms'
            && ! $middleware->shouldReject()
            && $middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::review('ocr_text_inconclusive');
        }

        return $ocr;
    }

    private function whenOcrUnavailable(UtilityBillDocumentVerdict $middleware): UtilityBillDocumentVerdict
    {
        if ($middleware->shouldReject()) {
            return $middleware;
        }

        if ($middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::review('ocr_unavailable_confirm');
        }

        return $middleware;
    }

    private function isTerminalReject(UtilityBillDocumentVerdict $verdict): bool
    {
        if (! $verdict->shouldReject()) {
            return false;
        }

        return in_array($verdict->reason, [
            'unreadable_file',
            'corrupted_file',
            'pdf_unrelated_text',
            'image_unrelated_metadata',
        ], true);
    }

    private function mergeVerdicts(
        UtilityBillDocumentVerdict $middleware,
        UtilityBillDocumentVerdict $ocr,
    ): UtilityBillDocumentVerdict {
        if ($middleware->shouldReject()) {
            if ($ocr->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
                return UtilityBillDocumentVerdict::likely('ocr_confirmed');
            }

            return $middleware;
        }

        if ($middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY
            && $ocr->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::likely('middleware_and_ocr');
        }

        if ($ocr->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::likely('ocr_confirmed');
        }

        if ($middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::review('ocr_did_not_confirm');
        }

        return UtilityBillDocumentVerdict::review('ocr_review');
    }
}
