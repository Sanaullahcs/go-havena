<?php

namespace Tests\Unit;

use App\Contracts\UtilityBillOcrEngine;
use App\Services\UtilityBillDocumentValidator;
use App\Services\UtilityBillOcrTextValidator;
use App\Services\UtilityBillTextExtractor;
use App\Services\UtilityBillVerificationPipeline;
use App\Support\UtilityBillDocumentVerdict;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class UtilityBillVerificationPipelineTest extends TestCase
{
    public function test_ocr_can_reject_after_middleware_accepts_ambiguous_image(): void
    {
        $file = UploadedFile::fake()->image('scan.jpg', 900, 1200);

        $pipeline = new UtilityBillVerificationPipeline(
            app(UtilityBillDocumentValidator::class),
            app(UtilityBillTextExtractor::class),
            new class implements UtilityBillOcrEngine
            {
                public function extractText(UploadedFile $file): ?string
                {
                    return 'Vacation selfie from Instagram scenery landscape birthday party';
                }
            },
            app(UtilityBillOcrTextValidator::class),
        );

        $verdict = $pipeline->verify($file);

        $this->assertTrue($verdict->shouldReject());
    }

    public function test_image_rejected_when_ocr_enabled_but_extracts_no_text(): void
    {
        config(['utility_bill.ocr_enabled' => true]);

        $file = UploadedFile::fake()->image('random.jpg', 900, 1200);

        $pipeline = new UtilityBillVerificationPipeline(
            app(UtilityBillDocumentValidator::class),
            app(UtilityBillTextExtractor::class),
            new class implements UtilityBillOcrEngine
            {
                public function extractText(UploadedFile $file): ?string
                {
                    return null;
                }
            },
            app(UtilityBillOcrTextValidator::class),
        );

        $verdict = $pipeline->verify($file);

        if ($verdict->shouldReject()) {
            $this->assertTrue($verdict->shouldReject());

            return;
        }

        $this->fail('Expected reject when OCR is enabled and image has no bill/lease text, got '.$verdict->reason);
    }

    public function test_ambiguous_image_accepted_for_review_when_ocr_finds_bill_terms(): void
    {
        config(['utility_bill.ocr_enabled' => true]);

        $file = $this->ambiguousScanFixture();

        $pipeline = new UtilityBillVerificationPipeline(
            app(UtilityBillDocumentValidator::class),
            app(UtilityBillTextExtractor::class),
            new class implements UtilityBillOcrEngine
            {
                public function extractText(UploadedFile $file): ?string
                {
                    return 'Electric utility bill account number amount due service address billing period';
                }
            },
            app(UtilityBillOcrTextValidator::class),
        );

        $verdict = $pipeline->verify($file);

        $this->assertFalse($verdict->shouldReject());
        $this->assertContains($verdict->reviewStatus, [
            UtilityBillDocumentVerdict::LIKELY,
            UtilityBillDocumentVerdict::REVIEW,
        ]);
    }

    public function test_ocr_confirms_likely_when_both_pass(): void
    {
        $file = $this->pdfWithText(
            'Electric Utility Bill Account Number 12345 Amount Due Service Address Due Date Billing Period',
        );

        $pipeline = new UtilityBillVerificationPipeline(
            app(UtilityBillDocumentValidator::class),
            app(UtilityBillTextExtractor::class),
            new class implements UtilityBillOcrEngine
            {
                public function extractText(UploadedFile $file): ?string
                {
                    return 'Lease agreement tenant landlord rent security deposit premises signature';
                }
            },
            app(UtilityBillOcrTextValidator::class),
        );

        $verdict = $pipeline->verify($file);

        $this->assertSame(UtilityBillDocumentVerdict::LIKELY, $verdict->reviewStatus);
        $this->assertFalse($verdict->shouldReject());
    }

    private function pdfWithText(string $text): UploadedFile
    {
        $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
        $body = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nBT ({$escaped}) Tj ET";

        return UploadedFile::fake()->createWithContent('bill.pdf', $body);
    }

    private function ambiguousScanFixture(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'scan').'.jpg';
        $image = imagecreatetruecolor(800, 1100);
        $paper = imagecolorallocate($image, 236, 232, 220);
        $ink = imagecolorallocate($image, 70, 66, 60);
        imagefilledrectangle($image, 0, 0, 799, 1099, $paper);

        $lines = [
            'Utility statement copy',
            'Account 99120 service address on file',
            'Amount due and billing date faded',
            'Electric usage details below',
            'Provider charges and taxes',
            'Meter and previous reading',
            'Customer copy only',
            'Page 1 of 1',
        ];
        $y = 120;
        foreach ($lines as $line) {
            imagestring($image, 3, 48, $y, $line, $ink);
            $extra = $line.' '.$line;
            for ($x = 48, $i = 0; $x < 740 && $i < strlen($extra); $x += 11, $i++) {
                if ($extra[$i] !== ' ') {
                    imagefilledrectangle($image, $x, $y + 13, $x + 6, $y + 16, $ink);
                }
            }
            $y += 36;
        }

        imagefilter($image, IMG_FILTER_SMOOTH, 2);
        imagejpeg($image, $path, 68);
        imagedestroy($image);

        return new UploadedFile($path, 'scanned-bill.jpg', 'image/jpeg', null, true);
    }
}
