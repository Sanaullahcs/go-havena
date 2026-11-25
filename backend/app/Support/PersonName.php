<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

final class PersonName
{
    /** @return array{0: string, 1: string} */
    public static function split(?string $displayName): array
    {
        $trimmed = trim((string) $displayName);
        if ($trimmed === '') {
            return ['', ''];
        }

        $space = strpos($trimmed, ' ');
        if ($space === false) {
            return [$trimmed, ''];
        }

        return [
            trim(substr($trimmed, 0, $space)),
            trim(substr($trimmed, $space + 1)),
        ];
    }

    public static function compose(string $firstName, string $lastName): string
    {
        return trim(trim($firstName).' '.trim($lastName));
    }

    /**
     * @return array{first_name: string, last_name: string, display_name: string}
     */
    public static function fromParts(string $firstName, string $lastName, int $maxCombined = 100): array
    {
        $first = trim($firstName);
        $last = trim($lastName);

        if ($first === '' || $last === '') {
            throw ValidationException::withMessages([
                'first_name' => $first === '' ? ['First name is required.'] : [],
                'last_name' => $last === '' ? ['Last name is required.'] : [],
            ]);
        }

        $display = self::compose($first, $last);
        if (mb_strlen($display) > $maxCombined) {
            throw ValidationException::withMessages([
                'first_name' => ["Combined name cannot exceed {$maxCombined} characters."],
                'last_name' => ["Combined name cannot exceed {$maxCombined} characters."],
            ]);
        }

        return [
            'first_name' => $first,
            'last_name' => $last,
            'display_name' => mb_substr($display, 0, 50),
        ];
    }
}