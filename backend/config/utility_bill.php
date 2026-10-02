<?php

return [
    /** Run Tesseract after heuristic middleware validation. */
    'ocr_enabled' => env('UTILITY_BILL_OCR_ENABLED', true),

    /** Path to the Tesseract binary (must be on PATH or absolute). */
    'tesseract_binary' => env('TESSERACT_BINARY', 'tesseract'),

    'tesseract_lang' => env('TESSERACT_LANG', 'eng'),

    /** Optional: rasterize PDF pages before OCR (poppler pdftoppm). */
    'pdftoppm_binary' => env('PDFTOPPM_BINARY', 'pdftoppm'),

    /** Max seconds for OCR subprocess. */
    'ocr_timeout' => (int) env('UTILITY_BILL_OCR_TIMEOUT', 45),
];
