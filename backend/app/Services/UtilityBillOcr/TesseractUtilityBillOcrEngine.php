<?php

namespace App\Services\UtilityBillOcr;

use App\Contracts\UtilityBillOcrEngine;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class TesseractUtilityBillOcrEngine implements UtilityBillOcrEngine
{
    public function __construct(
        private readonly string $tesseractBinary,
        private readonly string $language,
        private readonly string $pdftoppmBinary,
        private readonly int $timeoutSeconds,
    ) {}

    public function extractText(UploadedFile $file): ?string
    {
        if (! $this->commandExists($this->tesseractBinary)) {
            Log::debug('utility_bill.ocr_skipped', ['reason' => 'tesseract_missing']);

            return null;
        }

        $path = $file->getRealPath() ?: $file->getPathname();
        if (! is_string($path) || $path === '' || ! is_readable($path)) {
            return null;
        }

        $mime = strtolower((string) ($file->getMimeType() ?: $file->getClientMimeType()));
        $isPdf = str_contains($mime, 'pdf') || str_ends_with(strtolower((string) $file->getClientOriginalName()), '.pdf');

        if ($isPdf) {
            return $this->ocrPdf($path);
        }

        return $this->runTesseract($path);
    }

    private function ocrPdf(string $pdfPath): ?string
    {
        if ($this->commandExists($this->pdftoppmBinary)) {
            $tmpBase = tempnam(sys_get_temp_dir(), 'havena_bill_');
            if ($tmpBase === false) {
                return $this->runTesseract($pdfPath);
            }

            @unlink($tmpBase);
            $prefix = $tmpBase.'_page';

            try {
                $convert = new Process([
                    $this->pdftoppmBinary,
                    '-f', '1',
                    '-l', '1',
                    '-png',
                    $pdfPath,
                    $prefix,
                ]);
                $convert->setTimeout($this->timeoutSeconds);
                $convert->run();

                if (! $convert->isSuccessful()) {
                    return $this->runTesseract($pdfPath);
                }

                $candidates = glob($prefix.'*.png') ?: [];
                if ($candidates === []) {
                    return $this->runTesseract($pdfPath);
                }

                return $this->runTesseract($candidates[0]);
            } finally {
                foreach (glob($prefix.'*') ?: [] as $artifact) {
                    @unlink($artifact);
                }
            }
        }

        return $this->runTesseract($pdfPath);
    }

    private function runTesseract(string $inputPath): ?string
    {
        try {
            $process = new Process([
                $this->tesseractBinary,
                $inputPath,
                'stdout',
                '-l', $this->language,
                '--psm', '3',
            ]);
            $process->setTimeout($this->timeoutSeconds);
            $process->run();

            if (! $process->isSuccessful()) {
                return null;
            }

            $text = trim($process->getOutput());

            return $text !== '' ? $text : null;
        } catch (ProcessFailedException) {
            return null;
        }
    }

    private function commandExists(string $command): bool
    {
        if ($command === '') {
            return false;
        }

        if (str_contains($command, DIRECTORY_SEPARATOR) || str_contains($command, '/')) {
            return is_executable($command);
        }

        $finder = PHP_OS_FAMILY === 'Windows'
            ? new Process(['where', $command])
            : new Process(['which', $command]);
        $finder->run();

        return $finder->isSuccessful();
    }
}
