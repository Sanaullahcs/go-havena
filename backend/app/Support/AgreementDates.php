<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * Agreement due, effective, and expiration values are calendar dates.
 * Compare them as dates in the community timezone, not as clock instants.
 */
class AgreementDates
{
    /**
     * @return array{year: int, month: int, day: int}|null
     */
    public static function parse(?string $value): ?array
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/', $value, $match)) {
            return self::realDate((int) $match[1], (int) $match[2], (int) $match[3]);
        }

        if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $value, $match)) {
            return self::realDate((int) $match[3], (int) $match[1], (int) $match[2]);
        }

        return null;
    }

    public static function key(?string $value): ?string
    {
        $date = self::parse($value);
        if (! $date) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $date['year'], $date['month'], $date['day']);
    }

    public static function today(int $communityId): string
    {
        return now()->timezone(NoticeSchedule::communityTimezone($communityId))->toDateString();
    }

    /**
     * Store calendar dates as Y-m-d so MySQL does not see MM/DD/YYYY text.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function normalize(array $input): array
    {
        foreach (['due_at', 'effective_at', 'expires_at'] as $field) {
            if (! array_key_exists($field, $input) || $input[$field] === null || $input[$field] === '') {
                continue;
            }
            $key = is_string($input[$field]) ? self::key($input[$field]) : null;
            if ($key !== null) {
                $input[$field] = $key;
            }
        }

        return $input;
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public static function assertSchedule(array $input, int $communityId): void
    {
        $today = self::today($communityId);
        $errors = [];
        $keys = [];

        foreach ([
            'due_at' => 'Due date',
            'effective_at' => 'Effective date',
            'expires_at' => 'Expiration date',
        ] as $field => $label) {
            if (! array_key_exists($field, $input) || $input[$field] === null || $input[$field] === '') {
                continue;
            }

            $key = is_string($input[$field]) ? self::key($input[$field]) : null;
            if ($key === null) {
                $errors[$field] = "Enter a valid {$label}.";
                continue;
            }
            if ($key < $today) {
                $errors[$field] = "{$label} cannot be in the past.";
                continue;
            }
            $keys[$field] = $key;
        }

        if (isset($keys['expires_at'], $keys['effective_at']) && $keys['expires_at'] < $keys['effective_at']) {
            $errors['expires_at'] = 'Expiration date must be on or after the effective date.';
        } elseif (isset($keys['expires_at'], $keys['due_at']) && $keys['expires_at'] < $keys['due_at']) {
            $errors['expires_at'] = 'Expiration date must be on or after the due date.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * @return array{year: int, month: int, day: int}|null
     */
    private static function realDate(int $year, int $month, int $day): ?array
    {
        if (! checkdate($month, $day, $year)) {
            return null;
        }

        return ['year' => $year, 'month' => $month, 'day' => $day];
    }
}
