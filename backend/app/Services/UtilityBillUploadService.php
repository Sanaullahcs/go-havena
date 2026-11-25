<?php

namespace App\Services;

use App\Support\UtilityBillDocumentVerdict;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

class UtilityBillUploadService
{
    public function __construct(
        private readonly UtilityBillVerificationPipeline $pipeline,
        private readonly UtilityBillStorage $storage,
    ) {}

    /**
     * @return array{url: string, utility_bill_review_status: string, utility_bill_verified: bool}
     */
    public function storeVerified(UploadedFile $file): array
    {
        $verdict = $this->pipeline->verify($file);

        if ($verdict->shouldReject()) {
            throw ValidationException::withMessages([
                'utility_bill' => [UtilityBillDocumentVerdict::REJECT_MESSAGE],
            ]);
        }

        $stored = $this->storage->store($file);

        return [
            'url' => $stored,
            'utility_bill_review_status' => $verdict->reviewStatus,
            'utility_bill_verified' => false,
        ];
    }

}
