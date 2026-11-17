<?php

namespace App\Services;

use RuntimeException;
use setasign\Fpdi\Fpdi;

class AgreementPdf
{
    /**
     * Append a signature record to a copy of the original PDF.
     * The original file is never modified.
     *
     * @param  list<string>  $lines
     * @param  list<list<array{x: float, y: float}>>  $strokes
     * @param  array{page?: int, x: float, y: float, width: float, height: float}|null  $placement
     */
    public static function stamp(string $sourcePath, array $lines, array $strokes, ?string $typedName, ?array $placement = null, ?string $signedStamp = null): string
    {
        if (! is_file($sourcePath)) {
            throw new RuntimeException('The agreement file is missing.');
        }

        $pdf = new Fpdi();
        $pdf->SetAutoPageBreak(false);
        $pdf->SetCompression(false);

        try {
            $pageCount = $pdf->setSourceFile($sourcePath);
        } catch (\Throwable $e) {
            throw new RuntimeException(
                'This PDF cannot be signed in place. Re-export it as a standard PDF and upload a new version.',
                0,
                $e,
            );
        }

        if ($pageCount < 1) {
            throw new RuntimeException('The agreement PDF has no pages.');
        }

        $placedOn = null;
        if (is_array($placement) && isset($placement['x'], $placement['y'], $placement['width'], $placement['height'])) {
            $placedOn = max(1, min($pageCount, (int) ($placement['page'] ?? 1)));
        }

        for ($pageNo = 1; $pageNo <= $pageCount; $pageNo++) {
            $template = $pdf->importPage($pageNo);
            $size = $pdf->getTemplateSize($template);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($template);
            if ($placedOn === $pageNo) {
                self::paintOnPage($pdf, (float) $size['width'], (float) $size['height'], $placement, $strokes, $typedName, $signedStamp);
            }
        }

        $pdf->AddPage();
        $pdf->SetFont('Helvetica', 'B', 16);
        $pdf->SetTextColor(16, 24, 40);
        $pdf->SetXY(18, 16);
        $pdf->Cell(174, 10, self::ascii('Electronic signature record'), 0, 1);

        $pdf->SetFont('Helvetica', '', 11);
        $pdf->SetTextColor(54, 65, 83);
        foreach ($lines as $line) {
            $pdf->SetX(18);
            $pdf->MultiCell(174, 6, self::ascii($line));
        }

        if ($placedOn === null) {
            self::paintFixedRecord($pdf, $strokes, $typedName, $signedStamp);
        } else {
            $pdf->SetX(18);
            $pdf->MultiCell(174, 6, 'Signature placed on page '.$placedOn.'.');
        }

        return $pdf->Output('S');
    }

    /**
     * @param  array{x: float, y: float, width: float, height: float}  $placement
     * @param  list<list<array{x: float, y: float}>>  $strokes
     */
    private static function paintOnPage(Fpdi $pdf, float $pageWidth, float $pageHeight, array $placement, array $strokes, ?string $typedName, ?string $signedStamp = null): void
    {
        $width = max(8.0, self::unit($placement['width']) * $pageWidth);
        $height = max(6.0, self::unit($placement['height']) * $pageHeight);
        $x = self::unit($placement['x']) * $pageWidth;
        $y = self::unit($placement['y']) * $pageHeight;
        if ($x + $width > $pageWidth) {
            $x = max(0, $pageWidth - $width);
        }
        if ($y + $height > $pageHeight) {
            $y = max(0, $pageHeight - $height);
        }

        self::paintMark($pdf, $x, $y, $width, $height, $strokes, $typedName, $signedStamp);
    }

    /**
     * @param  list<list<array{x: float, y: float}>>  $strokes
     */
    private static function paintFixedRecord(Fpdi $pdf, array $strokes, ?string $typedName, ?string $signedStamp = null): void
    {
        $boxTop = max(120, $pdf->GetY() + 8);
        $pdf->SetDrawColor(27, 79, 138);
        $pdf->SetLineWidth(0.3);
        $pdf->Rect(18, $boxTop, 130, 42);
        $pdf->SetFont('Helvetica', '', 9);
        $pdf->SetTextColor(27, 79, 138);
        $pdf->SetXY(22, $boxTop + 2);
        $pdf->Cell(80, 5, 'Signature', 0, 1);
        self::paintMark($pdf, 24, $boxTop + 10, 116, 28, $strokes, $typedName, $signedStamp);
    }

    /**
     * @param  list<list<array{x: float, y: float}>>  $strokes
     */
    private static function paintMark(Fpdi $pdf, float $x, float $y, float $width, float $height, array $strokes, ?string $typedName, ?string $signedStamp = null): void
    {
        $caption = $signedStamp ? min(5.5, max(3.6, $height * 0.22)) : 0.0;
        $markHeight = max(4.0, $height - $caption);

        if ($typedName !== null && trim($typedName) !== '') {
            $name = self::ascii($typedName);
            $font = max(10, min(36, (int) round(($markHeight / 0.3528) * 0.62)));
            $pdf->SetFont('Times', 'I', $font);
            $pdf->SetTextColor(16, 24, 40);
            while ($font > 8 && $pdf->GetStringWidth($name) > $width * 0.92) {
                $font--;
                $pdf->SetFont('Times', 'I', $font);
            }
            $textHeight = $font * 0.3528;
            $pdf->SetXY($x, $y + max(0, ($markHeight - $textHeight) / 2));
            $pdf->Cell($width, $textHeight, $name, 0, 0, 'C');
        }

        if ($signedStamp) {
            $pdf->SetDrawColor(148, 163, 184);
            $pdf->SetLineWidth(0.15);
            $ruleY = $y + $markHeight + 0.4;
            $pdf->Line($x + 1.5, $ruleY, $x + $width - 1.5, $ruleY);
            $pdf->SetFont('Helvetica', '', max(5.5, min(8, $width / 24)));
            $pdf->SetTextColor(100, 116, 139);
            $pdf->SetXY($x, $ruleY + 0.5);
            $pdf->Cell($width, max(2.6, $caption - 1.2), self::ascii($signedStamp), 0, 0, 'C');
        }

        if ($strokes === []) {
            return;
        }

        $pdf->SetDrawColor(17, 24, 39);
        $pdf->SetLineWidth(max(0.2, min(1.1, $markHeight * 0.018)));
        foreach ($strokes as $path) {
            $previous = null;
            foreach ($path as $point) {
                $px = $x + self::unit($point['x'] ?? 0) * $width;
                $py = $y + self::unit($point['y'] ?? 0) * $markHeight;
                if ($previous !== null) {
                    $pdf->Line($previous[0], $previous[1], $px, $py);
                }
                $previous = [$px, $py];
            }
        }
    }

    public static function pageCount(string $absolutePath): ?int
    {
        $raw = @file_get_contents($absolutePath, false, null, 0, 2_000_000);
        if (! is_string($raw) || $raw === '') {
            return null;
        }
        if (! preg_match_all('/\/Type\s*\/Page(?!s)/', $raw, $matches)) {
            return null;
        }

        $count = count($matches[0]);

        return $count > 0 ? $count : null;
    }

    private static function unit(mixed $value): float
    {
        $number = (float) $value;
        if ($number < 0) {
            return 0;
        }
        if ($number > 1) {
            return 1;
        }

        return $number;
    }

    private static function ascii(string $text): string
    {
        $clean = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if (! is_string($clean) || $clean === '') {
            $clean = preg_replace('/[^\x20-\x7E]/', '?', $text) ?? '';
        }

        return str_replace(["\r", "\n"], ' ', $clean);
    }
};
