<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

class UtilityBillTextExtractor
{
    public function embeddedTextFromFile(UploadedFile $file): string
    {
        $mime = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
        $path = $file->getRealPath() ?: $file->getPathname();

        if (! is_string($path) || $path === '' || ! is_readable($path)) {
            return '';
        }

        if (str_contains($mime, 'pdf') || str_ends_with(strtolower((string) $file->getClientOriginalName()), '.pdf')) {
            $raw = @file_get_contents($path);

            return is_string($raw) ? $this->extractPdfText($raw) : '';
        }

        return $this->extractImageMetadataText($path);
    }

    public function extractPdfText(string $raw): string
    {
        $chunks = [];

        if (preg_match_all('/\((?:\\\\.|[^\\\\)])*\)/', $raw, $matches)) {
            foreach ($matches[0] as $match) {
                $chunks[] = stripcslashes(trim($match, '()'));
            }
        }

        if (preg_match_all('/\[(.*?)\]\s*TJ/s', $raw, $arrayMatches)) {
            foreach ($arrayMatches[1] as $block) {
                if (preg_match_all('/\((?:\\\\.|[^\\\\)])*\)/', $block, $inner)) {
                    foreach ($inner[0] as $match) {
                        $chunks[] = stripcslashes(trim($match, '()'));
                    }
                }
            }
        }

        return trim(implode(' ', $chunks));
    }

    public function extractImageMetadataText(string $path): string
    {
        $chunks = [];

        if (function_exists('exif_read_data')) {
            $exif = @exif_read_data($path, null, true);
            if (is_array($exif)) {
                foreach (['IFD0', 'EXIF', 'COMMENT', 'WINXP'] as $section) {
                    if (! isset($exif[$section]) || ! is_array($exif[$section])) {
                        continue;
                    }
                    foreach ($exif[$section] as $value) {
                        if (is_string($value) && trim($value) !== '') {
                            $chunks[] = $value;
                        }
                    }
                }
            }
        }

        return trim(implode(' ', $chunks));
    }
}
