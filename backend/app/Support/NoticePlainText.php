<?php

namespace App\Support;

class NoticePlainText
{
    public const PATTERN = '/^[\p{L}\p{N}\s.,\'\-&()#\/:]+$/u';

    public const INVALID_CHARS_MESSAGE = 'Use only letters, numbers, spaces, and . , \' - & ( ) # / :';

    public const NEEDS_ALNUM_MESSAGE = 'Include at least one letter or number.';

    public static function validateField(?string $value, bool $required = false): ?string
    {
        $trimmed = trim((string) $value);
        if ($trimmed === '') {
            return $required ? 'This field is required.' : null;
        }
        if (! preg_match(self::PATTERN, $trimmed)) {
            return self::INVALID_CHARS_MESSAGE;
        }
        if (! preg_match('/[\p{L}\p{N}]/u', $trimmed)) {
            return self::NEEDS_ALNUM_MESSAGE;
        }

        return null;
    }
}
