<?php

namespace Tests\Feature;

use App\Contracts\UtilityBillOcrEngine;
use App\Models\User;
use App\Support\UtilityBillDocumentVerdict;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UtilityBillUploadWithOcrTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['utility_bill.ocr_enabled' => true]);
    }

    public function test_rejects_unrelated_photo_when_ocr_returns_no_text(): void
    {
        $this->bindOcr(null);

        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->lightDecorativeImage(),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $this->assertNull($user->fresh()->profile?->utility_bill_url);
    }

    public function test_rejects_logo_when_ocr_reads_the_brand_name(): void
    {
        $this->bindOcr('HAVENA');

        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->simpleLogoImage(),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $this->assertNull($user->fresh()->profile?->utility_bill_url);
    }

    public function test_rejects_unrelated_photo_when_ocr_reads_non_bill_text(): void
    {
        $this->bindOcr('Beautiful sunset at the beach vacation with friends and family fun day');

        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => UploadedFile::fake()->image('photo.jpg', 800, 600),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.utility_bill.0', UtilityBillDocumentVerdict::REJECT_MESSAGE);

        $this->assertNull($user->fresh()->profile?->utility_bill_url);
    }

    public function test_ambiguous_scan_accepted_when_ocr_finds_bill_terms(): void
    {
        $this->bindOcr(
            'Electric utility bill account number amount due service address billing period meter usage',
        );

        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->ambiguousScannedDocument(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false);

        $this->assertNotEmpty($user->fresh()->profile?->utility_bill_url);
    }

    public function test_accepts_bill_image_when_ocr_finds_document_terms(): void
    {
        $this->bindOcr(
            'City Power Electric utility bill account number amount due service address billing period meter usage kwh',
        );

        $user = $this->actingResident();

        $this->post('/api/v1/me/utility-bill', [
            'utility_bill' => $this->utilityBillImage(),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.utility_bill_verified', false);

        $this->assertNotEmpty($user->fresh()->profile?->utility_bill_url);
    }

    private function bindOcr(?string $text): void
    {
        $this->app->bind(UtilityBillOcrEngine::class, fn () => new class($text) implements UtilityBillOcrEngine
        {
            public function __construct(private readonly ?string $text) {}

            public function extractText(UploadedFile $file): ?string
            {
                return $this->text;
            }
        });
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

    private function utilityBillImage(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'doc').'.jpg';
        $image = imagecreatetruecolor(800, 1100);
        $paper = imagecolorallocate($image, 250, 250, 248);
        $ink = imagecolorallocate($image, 24, 24, 24);
        $rule = imagecolorallocate($image, 210, 210, 210);
        imagefilledrectangle($image, 0, 0, 799, 1099, $paper);
        imagerectangle($image, 28, 28, 771, 1071, $rule);

        $lines = [
            'CITY POWER ELECTRIC UTILITY BILL',
            'Account Number 4588219    Statement Date 09/01/2026',
            'Service Address 14 Maple Street Unit 8B',
            'Billing Period 08/01/2026 to 08/31/2026',
            'Meter reading  12044 kWh     Usage 642 kWh',
            'Electricity charges                         86.40',
            'Amount Due                                 105.65',
            'Due Date September 18 2026',
            'Provider City Power Energy',
            'Please pay the amount due by the due date',
            'Rate schedule residential RS-1',
            'Return this stub with your payment',
        ];
        $y = 56;
        foreach ($lines as $line) {
            imagestring($image, 5, 48, $y, $line, $ink);
            $extra = $line.' '.$line;
            for ($x = 48, $i = 0; $x < 740 && $i < strlen($extra); $x += 11, $i++) {
                if ($extra[$i] !== ' ') {
                    imagefilledrectangle($image, $x, $y + 13, $x + 6, $y + 16, $ink);
                }
            }
            $y += 42;
        }

        imagejpeg($image, $path, 92);
        imagedestroy($image);

        return new UploadedFile($path, 'utility-bill.jpg', 'image/jpeg', null, true);
    }
}
