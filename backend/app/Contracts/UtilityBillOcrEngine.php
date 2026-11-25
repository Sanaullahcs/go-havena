<?php

namespace App\Contracts;

use Illuminate\Http\UploadedFile;

interface UtilityBillOcrEngine
{
    /** Extract plain text from a bill image or scanned PDF, or null when OCR is unavailable. */
    public function extractText(UploadedFile $file): ?string;
}
