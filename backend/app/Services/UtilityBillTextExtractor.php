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
        $inflated = $this->inflatedFlateBodies($raw);
        $sources = $inflated === [] ? [$raw] : $inflated;
        if ($inflated !== []) {
            $sources[] = $this->stripPdfStreams($raw);
        }

        $chunks = [];
        foreach ($sources as $source) {
            foreach ($this->chunksFromPdfContent($source) as $chunk) {
                if ($chunk !== '') {
                    $chunks[] = $chunk;
                }
            }
        }

        $text = trim(preg_replace('/\s+/', ' ', implode(' ', $chunks)) ?? '');

        return $text;
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

    /**
     * @return list<string>
     */
    private function inflatedFlateBodies(string $raw): array
    {
        $bodies = [];
        if (! preg_match_all('/\/FlateDecode\b.*?stream\r?\n(.*?)endstream/s', $raw, $matches)) {
            return [];
        }

        foreach ($matches[1] as $stream) {
            $stream = rtrim($stream, "\r\n");
            $inflated = @gzuncompress($stream);
            if (! is_string($inflated) || $inflated === '') {
                $inflated = @gzinflate($stream);
            }
            if (! is_string($inflated) || $inflated === '') {
                continue;
            }
            if (! preg_match('/\bTJ\b|\bTj\b/', $inflated)) {
                continue;
            }
            $printable = preg_match_all('/[\x09\x0A\x0D\x20-\x7E]/', $inflated);
            if ($printable / max(1, strlen($inflated)) < 0.6) {
                continue;
            }
            $bodies[] = $inflated;
        }

        return $bodies;
    }

    private function stripPdfStreams(string $raw): string
    {
        $stripped = preg_replace('/stream\r?\n.*?endstream/s', ' ', $raw);

        return is_string($stripped) ? $stripped : $raw;
    }

    /**
     * @return list<string>
     */
    private function chunksFromPdfContent(string $content): array
    {
        $chunks = [];

        if (preg_match_all('/\[(.*?)\]\s*TJ\b/s', $content, $arrayMatches)) {
            foreach ($arrayMatches[1] as $block) {
                $text = $this->textFromShowArray($block);
                if ($text !== '') {
                    $chunks[] = $text;
                }
            }
        }

        if (preg_match_all('/(\((?:\\\\.|[^\\\\)])*\)|<[0-9A-Fa-f\s]*>)\s*Tj\b/', $content, $showMatches)) {
            foreach ($showMatches[1] as $operand) {
                $text = trim($this->decodePdfString($operand));
                if ($text !== '') {
                    $chunks[] = $text;
                }
            }
        }

        return $chunks;
    }

    private function textFromShowArray(string $block): string
    {
        if (! preg_match_all('/(\((?:\\\\.|[^\\\\)])*\)|<[0-9A-Fa-f\s]*>)|(-?\d+(?:\.\d+)?)/', $block, $tokens, PREG_SET_ORDER)) {
            return '';
        }

        $text = '';
        foreach ($tokens as $token) {
            if (($token[1] ?? '') !== '') {
                $text .= $this->decodePdfString($token[1]);

                continue;
            }

            $adjust = (float) ($token[2] ?? $token[0]);
            if ($adjust <= -180) {
                $text .= ' ';
            }
        }

        return trim($text);
    }

    private function decodePdfString(string $token): string
    {
        if (str_starts_with($token, '<')) {
            $hex = preg_replace('/[^0-9A-Fa-f]/', '', $token) ?? '';
            if ($hex === '') {
                return '';
            }
            if (strlen($hex) % 2 === 1) {
                $hex .= '0';
            }
            $binary = @hex2bin($hex);
            if (! is_string($binary) || $binary === '') {
                return '';
            }

            return $this->decodeUtf16($binary);
        }

        $inner = substr($token, 1, -1);
        $out = '';
        $length = strlen($inner);
        for ($i = 0; $i < $length; $i++) {
            $char = $inner[$i];
            if ($char !== '\\' || $i + 1 >= $length) {
                $out .= $char;

                continue;
            }
            $next = $inner[++$i];
            $out .= match ($next) {
                'n' => "\n",
                'r' => "\r",
                't' => "\t",
                'b' => "\x08",
                'f' => "\f",
                '(', ')', '\\' => $next,
                "\n" => '',
                "\r" => '',
                default => $this->decodeOctalOrLiteral($inner, $i, $next),
            };
        }

        return $this->decodeUtf16($out);
    }

    private function decodeOctalOrLiteral(string $inner, int &$index, string $first): string
    {
        if ($first < '0' || $first > '7') {
            return $first;
        }

        $octal = $first;
        $length = strlen($inner);
        for ($extra = 0; $extra < 2 && $index + 1 < $length; $extra++) {
            $peek = $inner[$index + 1];
            if ($peek < '0' || $peek > '7') {
                break;
            }
            $octal .= $peek;
            $index++;
        }

        return chr(octdec($octal));
    }

    private function decodeUtf16(string $binary): string
    {
        if (! str_starts_with($binary, "\xFE\xFF") || strlen($binary) < 4) {
            return $binary;
        }

        $decoded = @mb_convert_encoding(substr($binary, 2), 'UTF-8', 'UTF-16BE');

        return is_string($decoded) ? $decoded : '';
    }
}
