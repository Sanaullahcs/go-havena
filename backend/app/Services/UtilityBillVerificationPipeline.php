<?php

namespace App\Services;

use App\Contracts\UtilityBillOcrEngine;
use App\Support\UtilityBillDocumentVerdict;
use App\Support\UtilityBillTextScorer;
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
        if ($middleware->shouldReject()) {
            return $middleware;
        }

        $embedded = $this->textExtractor->embeddedTextFromFile($file);
        $ocrText = $this->ocrEngine->extractText($file);

        $combined = trim(implode("\n", array_filter([$embedded, $ocrText ?? ''])));
        if ($combined === '') {
            return $this->whenOcrUnavailable($middleware, $file);
        }

        $ocrVerdict = $this->ocrTextValidator->validate($combined);
        if ($ocrVerdict->shouldReject()) {
            return $this->resolveOcrReject($middleware, $ocrVerdict, $file);
        }

        return $this->mergeVerdicts($middleware, $ocrVerdict, $file, $combined);
    }

    private function resolveOcrReject(
        UtilityBillDocumentVerdict $middleware,
        UtilityBillDocumentVerdict $ocr,
        UploadedFile $file,
    ): UtilityBillDocumentVerdict {
        if ($ocr->reason === 'ocr_no_document_terms'
            && $middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY
            && ! $this->ocrStrictForImages($file)) {
            return UtilityBillDocumentVerdict::review('ocr_text_inconclusive');
        }

        return $ocr;
    }

    private function whenOcrUnavailable(
        UtilityBillDocumentVerdict $middleware,
        UploadedFile $file,
    ): UtilityBillDocumentVerdict {
        if (! $this->ocrStrictForImages($file)) {
            if ($middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
                return UtilityBillDocumentVerdict::review('ocr_unavailable_confirm');
            }

            return $middleware;
        }

        if ($middleware->reviewStatus === UtilityBillDocumentVerdict::LIKELY) {
            return UtilityBillDocumentVerdict::review('ocr_unavailable_confirm');
        }

        // Heuristic already passed (review = ambiguous scan / phone photo of a bill).
        return $middleware;
    }

    private function mergeVerdicts(
        UtilityBillDocumentVerdict $middleware,
        UtilityBillDocumentVerdict $ocr,
        UploadedFile $file,
        string $combined,
    ): UtilityBillDocumentVerdict {
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

    private function ocrStrictForImages(UploadedFile $file): bool
    {
        return config('utility_bill.ocr_enabled', true) && $this->isRasterImageUpload($file);
    }

    private function isRasterImageUpload(UploadedFile $file): bool
    {
        $mime = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
        $name = strtolower((string) $file->getClientOriginalName());

        if (str_contains($mime, 'pdf') || str_ends_with($name, '.pdf')) {
            return false;
        }

        return str_starts_with($mime, 'image/')
            || preg_match('/\.(jpe?g|jfif|png|gif|webp|bmp|heic|heif)$/i', $name) === 1;
    }
}
