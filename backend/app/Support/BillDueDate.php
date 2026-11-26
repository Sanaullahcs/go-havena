<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Bill due dates are calendar days on the resident invoice timeline.
 * The due date must fall on or after the issue date (when the bill is created/published).
 */
class BillDueDate
{
    public static function issueAt(?Carbon $at = null): Carbon
    {
        return ($at ?? now())->copy()->startOfDay();
    }

    public static function parse(string $value): Carbon
    {
        $value = trim($value);
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $value, $match)) {
            return Carbon::parse($match[1])->startOfDay();
        }

        return Carbon::parse($value)->startOfDay();
    }

    public static function toDateString(string $value): string
    {
        return self::parse($value)->toDateString();
    }

    /** Clamp a computed due date so it is not before the issue date. */
    public static function notBeforeIssue(string $dueDate, ?Carbon $issueAt = null): string
    {
        $issue = self::issueAt($issueAt);
        $due = self::parse($dueDate);
        if ($due->lt($issue)) {
            return $issue->toDateString();
        }

        return $due->toDateString();
    }

    /** Reject explicitly chosen due dates that precede the issue date. */
    public static function assertOnOrAfterIssue(string $dueDate, ?Carbon $issueAt = null, string $field = 'due_date'): void
    {
        $issue = self::issueAt($issueAt);
        $due = self::parse($dueDate);
        if ($due->lt($issue)) {
            throw ValidationException::withMessages([
                $field => 'Due date cannot be earlier than the issue date.',
            ]);
        }
    }
}