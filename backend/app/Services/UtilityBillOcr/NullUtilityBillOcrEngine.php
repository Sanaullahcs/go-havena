<?php

namespace App\Services\UtilityBillOcr;

use App\Contracts\UtilityBillOcrEngine;
use Illuminate\Http\UploadedFile;

class NullUtilityBillOcrEngine implements UtilityBillOcrEngine
{
    public function extractText(UploadedFile $file): ?string
    {
        return null;
    }
}
