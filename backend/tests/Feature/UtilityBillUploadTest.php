<?php

namespace Tests\Feature;

use App\Contracts\UtilityBillOcrEngine;
use App\Models\User;
use App\Services\UtilityBillOcr\NullUtilityBillOcrEngine;
use App\Support\UtilityBillDocumentVerdict;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UtilityBillUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['utility_bill.ocr_enabled' => false]);
        $this->app->bind(UtilityBillOcrEngine::class, fn () => new NullUtilityBillOcrEngine);
    }

    public function test_rejects_selfie(): void
    {
        $this->assertRejected($this->selfieImage());
    }

    public function test_rejects_landscape_scenery(): void
    {
        $this->assertRejected($this->sceneryImage());
    }

    public function test_rejects_product_photo(): void
    {
        $this->assertRejected($this->productImage());
    }

    public function test_rejects_random_screenshot(): void
    {
        $this->assertRejected($this->screenshotImage());
    }

    public function test_rejects_light_decorative_image_without_document_structure(): void
    {
        $this->assertRejected($this->lightDecorativeImage());
    }

    public function test_rejects_simple_logo(): void
    {
        $this->assertRejected($this->simpleLogoImage());
    }

    public function test_accepts_utility_bill_image_without_marking_verified(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->utilityBillImage(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false);

        $status = $user->fresh()->profile?->utility_bill_review_status;
        $this->assertContains($status, [
            UtilityBillDocumentVerdict::LIKELY,
            UtilityBillDocumentVerdict::REVIEW,
        ]);
        $this->assertNotEmpty($user->fresh()->profile?->utility_bill_url);
    }

    public function test_accepts_lease_image_without_marking_verified(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->leaseImage(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false);

        $this->assertContains($user->fresh()->profile?->utility_bill_review_status, [
            UtilityBillDocumentVerdict::LIKELY,
            UtilityBillDocumentVerdict::REVIEW,
        ]);
    }

    public function test_ambiguous_scanned_document_goes_to_review(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->ambiguousScannedDocument(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false)
            ->assertJsonPath('data.utility_bill_review_status', UtilityBillDocumentVerdict::REVIEW);

        $this->assertSame(
            UtilityBillDocumentVerdict::REVIEW,
            $user->fresh()->profile?->utility_bill_review_status,
        );
    }

    public function test_community_admin_upload_accepts_utility_pdf(): void
    {
        $user = $this->actingCommunityAdmin();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->pdfWithText(
                'Electric Utility Bill Account Number 12345 Amount Due Service Address Due Date',
            ),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false)
            ->assertJsonPath('data.utility_bill_review_status', UtilityBillDocumentVerdict::LIKELY);

        $this->assertSame(
            UtilityBillDocumentVerdict::LIKELY,
            $user->fresh()->profile?->utility_bill_review_status,
        );
    }

    public function test_lease_pdf_is_accepted_and_unrelated_pdf_is_rejected(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->pdfWithText(
                'Residential Lease Agreement Tenant Landlord Rent Security Deposit Premises Signature',
            ),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_review_status', UtilityBillDocumentVerdict::LIKELY);

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->pdfWithText('Vacation selfie from Instagram scenery landscape birthday party'),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $this->assertSame(
            UtilityBillDocumentVerdict::LIKELY,
            $user->fresh()->profile?->utility_bill_review_status,
        );
    }

    public function test_scanned_pdf_without_ocr_goes_to_review(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->scannedPdf(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false)
            ->assertJsonPath('data.utility_bill_review_status', UtilityBillDocumentVerdict::REVIEW);

        $this->assertSame(
            UtilityBillDocumentVerdict::REVIEW,
            $user->fresh()->profile?->utility_bill_review_status,
        );
    }

    public function test_empty_pdf_is_rejected(): void
    {
        $this->assertRejected($this->pdfWithText(''));
    }

    public function test_compressed_utility_pdf_is_accepted(): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->compressedPdf(
                'BT [(Elec) 10 (tric ) -240 (utility ) -240 (bill ) -240 (account ) -220 (number ) -220 (amount ) -200 (due)] TJ ET',
            ),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false);

        $this->assertNotEmpty($user->fresh()->profile?->utility_bill_url);
        $this->assertContains($user->fresh()->profile?->utility_bill_review_status, [
            UtilityBillDocumentVerdict::LIKELY,
            UtilityBillDocumentVerdict::REVIEW,
        ]);
    }

    public function test_compressed_non_bill_pdf_is_rejected(): void
    {
        $this->assertRejected($this->compressedPdf(
            'BT (The quick brown fox jumps over the lazy dog near the river bank today) Tj ET',
        ));
    }

    private function assertRejected(UploadedFile $file): void
    {
        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $file,
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['utility_bill'])
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $this->assertNull($user->fresh()->profile?->utility_bill_url);
    }

    private function actingResident(): User
    {
        $user = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
        ]);
        $user->profile()->create(['display_name' => 'Resident']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function actingCommunityAdmin(): User
    {
        $user = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'pending',
            'status' => 'active',
        ]);
        $user->profile()->create(['display_name' => 'Community Admin']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function utilityBillImage(): UploadedFile
    {
        return $this->documentImage([
            'CITY POWER ELECTRIC UTILITY BILL',
            'Account Number 4588219    Statement Date 09/01/2026',
            'Service Address 14 Maple Street Unit 8B',
            'Billing Period 08/01/2026 to 08/31/2026',
            'Meter reading  12044 kWh     Usage 642 kWh',
            'Electricity charges                         86.40',
            'Delivery and taxes                          19.25',
            'Amount Due                                 105.65',
            'Due Date September 18 2026',
            'Previous balance 0.00   Payments thank you',
            'Customer name Jane Resident',
            'Provider City Power Energy',
            'Please pay the amount due by the due date',
            'Questions call 1-800-555-0199',
            'Late fee applies after the due date',
            'Keep this statement for your records',
            'Rate schedule residential RS-1',
            'Service from pole 44 feeder 12',
            'Next scheduled read October 1 2026',
            'Autopay is not enabled on this account',
            'Return this stub with your payment',
            'Mailing address PO Box 100 City Power',
        ], 'utility-bill.jpg');
    }

    private function leaseImage(): UploadedFile
    {
        return $this->documentImage([
            'RESIDENTIAL LEASE AGREEMENT',
            'This lease is between the Landlord and the Tenant',
            'Property address 14 Maple Street Unit 8B',
            'Tenant Jane Resident     Landlord Maple Property Management',
            'Lease term commencement September 1 2026',
            'Expiration date August 31 2027',
            'Monthly rent 1850.00 due on the first',
            'Security deposit 1850.00 held by landlord',
            'Premises shall be used as a private residence',
            'Occupancy limited to listed residents only',
            'Tenant shall maintain the premises in good order',
            'Landlord will provide habitable conditions',
            'Signatures below confirm this rental agreement',
            'Tenant signature ________________ date ______',
            'Landlord signature ______________ date ______',
            'Addendum A community rules and utilities',
            'Late rent fee after the fifth day of the month',
            'Notice of termination requires thirty days',
            'Keys and access devices remain landlord property',
            'Governing law of the state of residence',
            'Entire agreement of the parties',
            'Witness and notary block if required',
        ], 'lease.jpg');
    }

    private function ambiguousScannedDocument(): UploadedFile
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
        $this->drawTextLines($image, $lines, $ink, 120, 3);

        imagefilter($image, IMG_FILTER_SMOOTH, 2);
        imagejpeg($image, $path, 68);
        imagedestroy($image);

        return new UploadedFile($path, 'scanned-bill.jpg', 'image/jpeg', null, true);
    }

    /**
     * @param  list<string>  $lines
     */
    private function documentImage(array $lines, string $filename): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'doc').'.jpg';
        $image = imagecreatetruecolor(800, 1100);
        $paper = imagecolorallocate($image, 250, 250, 248);
        $ink = imagecolorallocate($image, 24, 24, 24);
        $rule = imagecolorallocate($image, 210, 210, 210);
        imagefilledrectangle($image, 0, 0, 799, 1099, $paper);
        imagerectangle($image, 28, 28, 771, 1071, $rule);
        $this->drawTextLines($image, $lines, $ink, 56, 5);
        imagejpeg($image, $path, 92);
        imagedestroy($image);

        return new UploadedFile($path, $filename, 'image/jpeg', null, true);
    }

    /**
     * @param  list<string>  $lines
     */
    private function drawTextLines(\GdImage $image, array $lines, int $ink, int $startY, int $font): void
    {
        $y = $startY;
        foreach ($lines as $line) {
            imagestring($image, $font, 48, $y, $line, $ink);
            $extra = $line.' '.$line;
            for ($x = 48, $i = 0; $x < 740 && $i < strlen($extra); $x += 11, $i++) {
                if ($extra[$i] !== ' ') {
                    imagefilledrectangle($image, $x, $y + 13, $x + 6, $y + 16, $ink);
                }
            }
            $y += $font >= 5 ? 42 : 36;
        }
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

    private function lightDecorativeImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'deco').'.jpg';
        $image = imagecreatetruecolor(800, 800);
        $cream = imagecolorallocate($image, 242, 236, 226);
        $blush = imagecolorallocate($image, 230, 200, 190);
        imagefilledrectangle($image, 0, 0, 799, 799, $cream);
        imagefilledellipse($image, 400, 400, 260, 180, $blush);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'decor.jpg', 'image/jpeg', null, true);
    }

    private function selfieImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'selfie').'.jpg';
        $image = imagecreatetruecolor(640, 860);
        $wall = imagecolorallocate($image, 186, 168, 148);
        $skin = imagecolorallocate($image, 214, 162, 128);
        $hair = imagecolorallocate($image, 62, 42, 30);
        $shirt = imagecolorallocate($image, 48, 92, 168);
        imagefilledrectangle($image, 0, 0, 639, 859, $wall);
        imagefilledellipse($image, 320, 250, 260, 320, $skin);
        imagefilledellipse($image, 320, 150, 280, 160, $hair);
        imagefilledrectangle($image, 170, 430, 470, 859, $shirt);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'selfie.jpg', 'image/jpeg', null, true);
    }

    private function sceneryImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'scene').'.jpg';
        $image = imagecreatetruecolor(800, 600);
        $sky = imagecolorallocate($image, 78, 162, 228);
        $sun = imagecolorallocate($image, 255, 210, 70);
        $grass = imagecolorallocate($image, 52, 164, 74);
        $tree = imagecolorallocate($image, 28, 110, 48);
        imagefilledrectangle($image, 0, 0, 799, 299, $sky);
        imagefilledellipse($image, 640, 90, 110, 110, $sun);
        imagefilledrectangle($image, 0, 300, 799, 599, $grass);
        imagefilledellipse($image, 180, 320, 220, 180, $tree);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'landscape.jpg', 'image/jpeg', null, true);
    }

    private function productImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'product').'.jpg';
        $image = imagecreatetruecolor(800, 800);
        $studio = imagecolorallocate($image, 245, 245, 245);
        $shadow = imagecolorallocate($image, 210, 210, 210);
        $box = imagecolorallocate($image, 220, 64, 48);
        $accent = imagecolorallocate($image, 36, 36, 36);
        imagefilledrectangle($image, 0, 0, 799, 799, $studio);
        imagefilledellipse($image, 400, 560, 340, 70, $shadow);
        imagefilledrectangle($image, 250, 260, 550, 540, $box);
        imagefilledrectangle($image, 250, 260, 550, 310, $accent);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'sneakers.jpg', 'image/jpeg', null, true);
    }

    private function screenshotImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'shot').'.jpg';
        $image = imagecreatetruecolor(390, 844);
        $status = imagecolorallocate($image, 20, 24, 38);
        $chrome = imagecolorallocate($image, 248, 248, 250);
        $card = imagecolorallocate($image, 88, 99, 246);
        $photo = imagecolorallocate($image, 255, 140, 90);
        $text = imagecolorallocate($image, 30, 30, 30);
        imagefilledrectangle($image, 0, 0, 389, 54, $status);
        imagefilledrectangle($image, 0, 55, 389, 843, $chrome);
        imagefilledrectangle($image, 24, 90, 366, 360, $photo);
        imagefilledrectangle($image, 24, 390, 180, 450, $card);
        imagefilledrectangle($image, 200, 390, 366, 450, $card);
        imagestring($image, 3, 30, 470, 'Messages', $text);
        imagestring($image, 2, 30, 500, 'Liked your photo', $text);
        imagejpeg($image, $path, 90);
        imagedestroy($image);

        return new UploadedFile($path, 'screenshot.jpg', 'image/jpeg', null, true);
    }

    private function pdfWithText(string $text): UploadedFile
    {
        $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
        $stream = "BT /F1 12 Tf 72 700 Td ({$escaped}) Tj ET";
        $pdf = "%PDF-1.4\n1 0 obj<< /Length ".strlen($stream)." >>stream\n{$stream}\nendstream\nendobj\ntrailer<<>>\n%%EOF";
        $path = tempnam(sys_get_temp_dir(), 'pdf').'.pdf';
        file_put_contents($path, $pdf);

        return new UploadedFile($path, 'document.pdf', 'application/pdf', null, true);
    }

    private function compressedPdf(string $content): UploadedFile
    {
        $compressed = gzcompress($content);
        $pdf = "%PDF-1.4\n1 0 obj\n<< /Length ".strlen($compressed)." /Filter /FlateDecode >>\nstream\n{$compressed}\nendstream\nendobj\ntrailer<<>>\n%%EOF\n";
        $path = tempnam(sys_get_temp_dir(), 'flate').'.pdf';
        file_put_contents($path, $pdf);

        return new UploadedFile($path, 'utility-bill.pdf', 'application/pdf', null, true);
    }

    private function scannedPdf(): UploadedFile
    {
        $payload = str_repeat('BIN', 800);
        $pdf = "%PDF-1.4\n1 0 obj<< /Type /XObject /Subtype /Image /Filter /DCTDecode /Length ".strlen($payload)." >>stream\n{$payload}\nendstream\nendobj\ntrailer<<>>\n%%EOF";
        $path = tempnam(sys_get_temp_dir(), 'scanpdf').'.pdf';
        file_put_contents($path, $pdf);

        return new UploadedFile($path, 'scanned-bill.pdf', 'application/pdf', null, true);
    }
}
