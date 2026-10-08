<?php

namespace App\Services;

use App\Support\UtilityBillDocumentVerdict;
use App\Support\UtilityBillTextScorer;
use Illuminate\Http\UploadedFile;

/** Heuristic middleware validation (layout + embedded PDF/metadata text). */
class UtilityBillDocumentValidator
{
    public function __construct(
        private readonly UtilityBillTextExtractor $textExtractor,
    ) {}

    public function validate(UploadedFile $file): UtilityBillDocumentVerdict
    {
        $mime = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
        $path = $file->getRealPath() ?: $file->getPathname();

        if (! is_string($path) || $path === '' || ! is_readable($path)) {
            return UtilityBillDocumentVerdict::reject('unreadable_file');
        }

        if (str_contains($mime, 'pdf') || str_ends_with(strtolower((string) $file->getClientOriginalName()), '.pdf')) {
            return $this->validatePdf($path);
        }

        return $this->validateImage($path, $mime);
    }

    private function validatePdf(string $path): UtilityBillDocumentVerdict
    {
        $raw = @file_get_contents($path);
        if (! is_string($raw) || $raw === '' || ! str_starts_with($raw, '%PDF')) {
            return UtilityBillDocumentVerdict::reject('corrupted_file');
        }

        $text = $this->textExtractor->extractPdfText($raw);
        $signals = UtilityBillTextScorer::score($text);

        if ($signals['document'] >= 2) {
            return UtilityBillDocumentVerdict::likely('pdf_document_terms');
        }

        if ($signals['unrelated'] >= 1 && $signals['document'] === 0) {
            return UtilityBillDocumentVerdict::reject('pdf_unrelated_text');
        }

        if ($signals['document'] === 1) {
            return UtilityBillDocumentVerdict::review('pdf_weak_document_terms');
        }

        if ($signals['words'] >= 8) {
            return UtilityBillDocumentVerdict::reject('pdf_text_without_document_terms');
        }

        if ($this->pdfLooksScanned($raw)) {
            return UtilityBillDocumentVerdict::review('pdf_scanned_no_ocr');
        }

        return UtilityBillDocumentVerdict::reject('pdf_empty_or_unrelated');
    }

    private function validateImage(string $path, string $mime): UtilityBillDocumentVerdict
    {
        $binary = @file_get_contents($path);
        if (! is_string($binary) || $binary === '') {
            return UtilityBillDocumentVerdict::reject('unreadable_file');
        }

        $image = @imagecreatefromstring($binary);
        if ($image === false) {
            if (str_contains($mime, 'heic') || str_contains($mime, 'heif')) {
                return UtilityBillDocumentVerdict::review('heic_unanalyzed');
            }

            return UtilityBillDocumentVerdict::reject('corrupted_file');
        }

        $features = $this->analyzeImage($image);
        imagedestroy($image);

        $embedded = UtilityBillTextScorer::score($this->textExtractor->extractImageMetadataText($path));

        if ($embedded['unrelated'] >= 1 && $embedded['document'] === 0) {
            return UtilityBillDocumentVerdict::reject('image_unrelated_metadata');
        }

        if ($features['looksUnrelated']) {
            return UtilityBillDocumentVerdict::reject($features['unrelatedReason']);
        }

        if ($embedded['document'] >= 2 && $features['hasDocumentStructure']) {
            return UtilityBillDocumentVerdict::likely('image_embedded_document_terms');
        }

        if ($features['looksLikeDocument']) {
            return UtilityBillDocumentVerdict::likely('document_like_image');
        }

        if ($features['looksLikeAmbiguousDocument']) {
            return UtilityBillDocumentVerdict::review('ambiguous_document_image');
        }

        if ($features['hasDocumentStructure'] && $features['documentScore'] >= 0.38) {
            return UtilityBillDocumentVerdict::review('document_structure_review');
        }

        return UtilityBillDocumentVerdict::reject('unrelated_or_no_document_structure');
    }

    /**
     * @return array{
     *     paperRatio: float,
     *     meanSaturation: float,
     *     skinRatio: float,
     *     inkRatio: float,
     *     textLikeRows: int,
     *     textBandCount: int,
     *     meanGlyphTransitions: float,
     *     documentScore: float,
     *     looksLikeDocument: bool,
     *     looksLikeAmbiguousDocument: bool,
     *     hasDocumentStructure: bool,
     *     looksUnrelated: bool,
     *     unrelatedReason: string
     * }
     */
    private function analyzeImage(\GdImage $source): array
    {
        $srcW = imagesx($source);
        $srcH = imagesy($source);
        $width = 360;
        $height = max(1, (int) round($srcH * ($width / max(1, $srcW))));
        $image = imagecreatetruecolor($width, $height);
        imagecopyresampled($image, $source, 0, 0, 0, 0, $width, $height, $srcW, $srcH);

        $paper = 0;
        $skin = 0;
        $ink = 0;
        $satSum = 0.0;
        $pixels = $width * $height;
        $gray = [];
        $colorBuckets = [];
        $solidRows = 0;

        for ($y = 0; $y < $height; $y++) {
            $gray[$y] = [];
            $rowColors = [];
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 255;
                $g = ($rgb >> 8) & 255;
                $b = $rgb & 255;
                $hsv = $this->rgbToHsv($r, $g, $b);
                $satSum += $hsv['s'];
                $luma = (0.299 * $r) + (0.587 * $g) + (0.114 * $b);
                $gray[$y][$x] = $luma;

                $bucket = (($r >> 5) << 6) | (($g >> 5) << 3) | ($b >> 5);
                $colorBuckets[$bucket] = true;
                $rowColors[$bucket] = true;

                if ($luma >= 205 && $hsv['s'] <= 0.16) {
                    $paper++;
                }
                if ($luma <= 165) {
                    $ink++;
                }
                if ($this->isSkinTone($hsv, $r, $g, $b)) {
                    $skin++;
                }
            }
            if (count($rowColors) <= 3) {
                $solidRows++;
            }
        }

        imagedestroy($image);

        $textLikeRows = 0;
        $glyphTransitions = 0;
        $centerInk = 0;
        $xCenterStart = (int) floor($width * 0.25);
        $xCenterEnd = (int) ceil($width * 0.75);

        for ($y = 0; $y < $height; $y++) {
            $transitions = 0;
            $inkPixels = 0;
            $paperPixels = 0;
            for ($x = 0; $x < $width; $x++) {
                $curr = $gray[$y][$x];
                if ($curr <= 165) {
                    $inkPixels++;
                    if ($x >= $xCenterStart && $x <= $xCenterEnd) {
                        $centerInk++;
                    }
                }
                if ($curr >= 200) {
                    $paperPixels++;
                }
                if ($x === 0) {
                    continue;
                }
                $prev = $gray[$y][$x - 1];
                if (($prev >= 200 && $curr <= 165) || ($prev <= 165 && $curr >= 200)) {
                    $transitions++;
                }
            }

            // Real text has many character edges, not one object silhouette.
            if ($transitions >= 6 && $paperPixels >= (int) ($width * 0.20) && $inkPixels >= (int) ($width * 0.04)) {
                $textLikeRows++;
                $glyphTransitions += $transitions;
            }
        }

        $textBandCount = $this->countTextBands($gray, $width, $height);
        $paperRatio = $paper / max(1, $pixels);
        $skinRatio = $skin / max(1, $pixels);
        $inkRatio = $ink / max(1, $pixels);
        $meanSaturation = $satSum / max(1, $pixels);
        $meanGlyphTransitions = $textLikeRows > 0 ? $glyphTransitions / $textLikeRows : 0.0;
        $textRowRatio = $textLikeRows / max(1, $height);
        $centerInkShare = $ink > 0 ? $centerInk / $ink : 0.0;
        $uniqueColors = count($colorBuckets);
        $solidRowRatio = $solidRows / max(1, $height);

        $looksLikeScreenshot = $solidRowRatio >= 0.28 && $uniqueColors <= 48 && $textLikeRows < 16;
        $looksLikeProduct = $paperRatio >= 0.40 && $textLikeRows < 10 && $centerInkShare >= 0.58 && $textBandCount <= 1;
        $looksLikePortrait = $skinRatio >= 0.10 && $textLikeRows < 14;
        $looksLikeScenery = $meanSaturation >= 0.20 && $paperRatio < 0.30 && $textLikeRows < 12;

        $documentScore = $this->documentScore(
            $paperRatio,
            $textRowRatio,
            $textBandCount,
            $meanSaturation,
            $meanGlyphTransitions,
            $inkRatio,
        );

        $hasDocumentStructure = $textLikeRows >= 10
            && $textBandCount >= 2
            && $paperRatio >= 0.28
            && $meanGlyphTransitions >= 6
            && $inkRatio >= 0.015
            && $inkRatio <= 0.48;

        $looksLikeDocument = $hasDocumentStructure
            && $documentScore >= 0.62
            && $textLikeRows >= 18
            && $textBandCount >= 3
            && $meanSaturation <= 0.30
            && ! $looksLikeScreenshot
            && ! $looksLikeProduct
            && ! $looksLikePortrait;

        $looksLikeAmbiguousDocument = ! $looksLikeDocument
            && $hasDocumentStructure
            && $documentScore >= 0.48
            && $textLikeRows >= 10
            && $textBandCount >= 3
            && $meanSaturation <= 0.35
            && ! $looksLikeScreenshot
            && ! $looksLikeProduct
            && ! $looksLikePortrait
            && ! $looksLikeScenery;

        $looksUnrelated = $looksLikeScreenshot
            || $looksLikeProduct
            || $looksLikePortrait
            || $looksLikeScenery
            || ($paperRatio < 0.22 && $textLikeRows < 10)
            || ($meanSaturation >= 0.32 && $textBandCount < 2);

        $unrelatedReason = 'unrelated_image';
        if ($looksLikePortrait) {
            $unrelatedReason = 'portrait_or_selfie';
        } elseif ($looksLikeScenery) {
            $unrelatedReason = 'scenery_or_photo';
        } elseif ($looksLikeProduct) {
            $unrelatedReason = 'product_photo';
        } elseif ($looksLikeScreenshot) {
            $unrelatedReason = 'screenshot';
        }

        return [
            'paperRatio' => $paperRatio,
            'meanSaturation' => $meanSaturation,
            'skinRatio' => $skinRatio,
            'inkRatio' => $inkRatio,
            'textLikeRows' => $textLikeRows,
            'textBandCount' => $textBandCount,
            'meanGlyphTransitions' => $meanGlyphTransitions,
            'documentScore' => $documentScore,
            'looksLikeDocument' => $looksLikeDocument,
            'looksLikeAmbiguousDocument' => $looksLikeAmbiguousDocument,
            'hasDocumentStructure' => $hasDocumentStructure,
            'looksUnrelated' => $looksUnrelated && ! $looksLikeDocument && ! $looksLikeAmbiguousDocument,
            'unrelatedReason' => $unrelatedReason,
        ];
    }

    /**
     * @param  array<int, array<int, float>>  $gray
     */
    private function countTextBands(array $gray, int $width, int $height): int
    {
        $bands = 0;
        $run = 0;

        for ($y = 0; $y < $height; $y++) {
            $transitions = 0;
            for ($x = 1; $x < $width; $x++) {
                $prev = $gray[$y][$x - 1];
                $curr = $gray[$y][$x];
                if (($prev >= 200 && $curr <= 165) || ($prev <= 165 && $curr >= 200)) {
                    $transitions++;
                }
            }

            if ($transitions >= 6) {
                $run++;
                continue;
            }

            if ($run >= 3) {
                $bands++;
            }
            $run = 0;
        }

        if ($run >= 3) {
            $bands++;
        }

        return $bands;
    }

    private function documentScore(
        float $paperRatio,
        float $textRowRatio,
        int $textBandCount,
        float $meanSaturation,
        float $meanGlyphTransitions,
        float $inkRatio,
    ): float {
        $paper = $this->clamp01(($paperRatio - 0.20) / 0.45);
        $text = $this->clamp01($textRowRatio / 0.28);
        $bands = $this->clamp01($textBandCount / 6);
        $lowSat = $this->clamp01((0.35 - $meanSaturation) / 0.35);
        $glyphs = $this->clamp01(($meanGlyphTransitions - 4) / 12);
        $ink = ($inkRatio >= 0.03 && $inkRatio <= 0.45) ? 1.0 : 0.25;

        return (0.22 * $paper)
            + (0.28 * $text)
            + (0.18 * $bands)
            + (0.10 * $lowSat)
            + (0.14 * $glyphs)
            + (0.08 * $ink);
    }

    private function clamp01(float $value): float
    {
        return max(0.0, min(1.0, $value));
    }

    private function pdfLooksScanned(string $raw): bool
    {
        if (strlen($raw) < 1500) {
            return false;
        }

        return (bool) preg_match('/\/(DCTDecode|JPXDecode|FlateDecode|Image|XObject)/', $raw);
    }

    /**
     * @return array{s: float, h: float, v: float}
     */
    private function rgbToHsv(int $r, int $g, int $b): array
    {
        $rf = $r / 255;
        $gf = $g / 255;
        $bf = $b / 255;
        $max = max($rf, $gf, $bf);
        $min = min($rf, $gf, $bf);
        $delta = $max - $min;
        $s = $max <= 0.0 ? 0.0 : $delta / $max;
        $h = 0.0;
        if ($delta > 0.0) {
            if ($max === $rf) {
                $h = 60 * fmod((($gf - $bf) / $delta), 6);
            } elseif ($max === $gf) {
                $h = 60 * ((($bf - $rf) / $delta) + 2);
            } else {
                $h = 60 * ((($rf - $gf) / $delta) + 4);
            }
        }
        if ($h < 0) {
            $h += 360;
        }

        return ['h' => $h, 's' => $s, 'v' => $max];
    }

    /**
     * @param  array{s: float, h: float, v: float}  $hsv
     */
    private function isSkinTone(array $hsv, int $r, int $g, int $b): bool
    {
        $hueOk = ($hsv['h'] >= 0 && $hsv['h'] <= 50) || $hsv['h'] >= 340;
        $satOk = $hsv['s'] >= 0.18 && $hsv['s'] <= 0.68;
        $valOk = $hsv['v'] >= 0.35 && $hsv['v'] <= 0.95;

        return $hueOk && $satOk && $valOk && $r > $g && $g > $b - 15;
    }

}
