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

    public function test_compressed_utility_pdf_is_accepted_from_its_text(): void
    {
        $file = $this->uploadRawPdf($this->flatePdf(
            'BT /F1 12 Tf 72 700 Td (Electric utility bill account number 4588219 amount due service address due date billing period) Tj ET',
        ));

        $verdict = $this->pipeline(null)->verify($file);

        $this->assertFalse($verdict->shouldReject(), $verdict->reason);
        $this->assertSame(UtilityBillDocumentVerdict::LIKELY, $verdict->reviewStatus);
    }

    public function test_kerning_split_utility_pdf_is_accepted(): void
    {
        $stream = 'BT [(Elec) 8 (tric ) -240 (utility ) -240 (bill ) -260 (account ) -240 (number ) -220 (amount ) -220 (due ) -200 (service ) -200 (address)] TJ ET';
        $file = $this->uploadRawPdf($this->flatePdf($stream));

        $verdict = $this->pipeline(null)->verify($file);

        $this->assertFalse($verdict->shouldReject(), $verdict->reason);
    }

    public function test_compressed_non_bill_pdf_is_rejected(): void
    {
        $file = $this->uploadRawPdf($this->flatePdf(
            'BT (The quick brown fox jumps over the lazy dog near the river bank today) Tj ET',
        ));

        $verdict = $this->pipeline(null)->verify($file);

        $this->assertTrue($verdict->shouldReject(), $verdict->reason);
    }

    public function test_unrelated_pdf_text_is_rejected(): void
    {
        $file = $this->pdfWithText('Vacation selfie from Instagram scenery landscape birthday party');

        $verdict = $this->pipeline(null)->verify($file);

        $this->assertTrue($verdict->shouldReject());
        $this->assertSame('pdf_unrelated_text', $verdict->reason);
    }

    public function test_photo_of_bill_is_accepted_when_ocr_reads_bill_terms(): void
    {
        config(['utility_bill.ocr_enabled' => true]);
        $file = $this->sceneryImage();

        $verdict = $this->pipeline(
            'Eversource electric utility bill account number 883311 amount due 142.18 service address due date kwh',
        )->verify($file);

        $this->assertFalse($verdict->shouldReject(), $verdict->reason);
    }

    public function test_photo_without_bill_text_is_rejected(): void
    {
        config(['utility_bill.ocr_enabled' => true]);
        $file = $this->sceneryImage();

        $verdict = $this->pipeline(
            'Beautiful mountains and a lake with friends hiking all afternoon under the sun',
        )->verify($file);

        $this->assertTrue($verdict->shouldReject(), $verdict->reason);
    }

    public function test_logo_is_rejected_when_ocr_reads_only_the_brand(): void
    {
        config(['utility_bill.ocr_enabled' => true]);
        $file = $this->simpleLogoImage();

        $verdict = $this->pipeline('HAVENA')->verify($file);

        $this->assertTrue($verdict->shouldReject(), $verdict->reason);
    }

    public function test_document_shaped_bill_is_not_rejected_when_ocr_returns_nothing(): void
    {
        config(['utility_bill.ocr_enabled' => true]);
        $file = $this->utilityBillImage();

        $verdict = $this->pipeline(null)->verify($file);

        $this->assertFalse($verdict->shouldReject(), $verdict->reason);
    }

    private function pipeline(?string $ocrText): UtilityBillVerificationPipeline
    {
        return new UtilityBillVerificationPipeline(
            app(UtilityBillDocumentValidator::class),
            app(UtilityBillTextExtractor::class),
            new class($ocrText) implements UtilityBillOcrEngine
            {
                public function __construct(private readonly ?string $text) {}

                public function extractText(UploadedFile $file): ?string
                {
                    return $this->text;
                }
            },
            app(UtilityBillOcrTextValidator::class),
        );
    }

    private function flatePdf(string $content): string
    {
        $compressed = gzcompress($content);
        $length = strlen($compressed);

        return "%PDF-1.4\n1 0 obj\n<< /Length {$length} /Filter /FlateDecode >>\nstream\n{$compressed}\nendstream\nendobj\ntrailer<<>>\n%%EOF\n";
    }

    private function uploadRawPdf(string $raw): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'bill').'.pdf';
        file_put_contents($path, $raw);

        return new UploadedFile($path, 'utility-bill.pdf', 'application/pdf', null, true);
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

    private function simpleLogoImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'logo').'.png';
        $image = imagecreatetruecolor(640, 640);
        $white = imagecolorallocate($image, 255, 255, 255);
        $blue = imagecolorallocate($image, 27, 79, 138);
        $navy = imagecolorallocate($image, 15, 40, 80);
        imagefilledrectangle($image, 0, 0, 639, 639, $white);
        imagefilledellipse($image, 320, 230, 200, 200, $blue);
        imagefilledellipse($image, 320, 230, 110, 110, $white);
        imagestring($image, 5, 255, 400, 'HAVENA', $navy);
        imagefilledrectangle($image, 180, 440, 460, 468, $navy);
        imagepng($image, $path);
        imagedestroy($image);

        return new UploadedFile($path, 'havena-logo.png', 'image/png', null, true);
    }

    private function sceneryImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'scene').'.jpg';
        $image = imagecreatetruecolor(800, 600);
        $sky = imagecolorallocate($image, 78, 162, 228);
        $sun = imagecolorallocate($image, 255, 210, 70);
        $grass = imagecolorallocate($image, 52, 164, 74);
        imagefilledrectangle($image, 0, 0, 799, 299, $sky);
        imagefilledellipse($image, 640, 90, 110, 110, $sun);
        imagefilledrectangle($image, 0, 300, 799, 599, $grass);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'landscape.jpg', 'image/jpeg', null, true);
    }

    private function utilityBillImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'doc').'.jpg';
        $image = imagecreatetruecolor(800, 1100);
        $paper = imagecolorallocate($image, 248, 246, 240);
        $ink = imagecolorallocate($image, 28, 28, 28);
        imagefilledrectangle($image, 0, 0, 799, 1099, $paper);
        $lines = [
            'CITY POWER ELECTRIC UTILITY BILL',
            'Account Number 4588219 Statement Date',
            'Service Address 14 Maple Street',
            'Billing Period August 2026',
            'Meter reading 12044 kWh Usage 642',
            'Amount Due 105.65 Due Date Sept 18',
            'Please pay the amount due by the due date',
            'Provider City Power Energy',
            'Return this stub with your payment',
            'Keep this statement for your records',
        ];
        $y = 56;
        foreach ($lines as $line) {
            imagestring($image, 5, 48, $y, $line, $ink);
            $extra = $line.' '.$line;
            for ($x = 48, $i = 0; $x < 740 && $i < strlen($extra); $x += 11, $i++) {
                if ($extra[$i] !== ' ') {
                    imagefilledrectangle($image, $x, $y + 14, $x + 6, $y + 18, $ink);
                }
            }
            $y += 48;
        }
        imagejpeg($image, $path, 92);
        imagedestroy($image);

        return new UploadedFile($path, 'utility-bill.jpg', 'image/jpeg', null, true);
    }
}
