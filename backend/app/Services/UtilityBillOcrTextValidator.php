<?php

namespace App\Services;

use App\Support\UtilityBillDocumentVerdict;
use App\Support\UtilityBillTextScorer;

/** Second-pass validation on OCR / embedded document text. */
class UtilityBillOcrTextValidator
{
    public function validate(string $text): UtilityBillDocumentVerdict
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return UtilityBillDocumentVerdict::review('ocr_empty');
        }

        $signals = UtilityBillTextScorer::score($trimmed);

        if ($signals['unrelated'] >= 1 && $signals['document'] === 0) {
            return UtilityBillDocumentVerdict::reject('ocr_unrelated_terms');
        }

        if ($signals['document'] >= 2) {
            return UtilityBillDocumentVerdict::likely('ocr_document_terms');
        }

        if ($signals['document'] === 1) {
            return UtilityBillDocumentVerdict::review('ocr_weak_document_terms');
        }

        if ($signals['words'] >= 8) {
            return UtilityBillDocumentVerdict::reject('ocr_no_document_terms');
        }

        return UtilityBillDocumentVerdict::review('ocr_weak_document_terms');
    }
}
