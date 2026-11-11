<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

final class PollDuration
{
    public const HOUR_PRESETS = [1, 3, 6, 12, 24];

    public const DAY_PRESETS = [1, 3, 7, 14, 30];

    public const MIN_HOURS = 1;

    public const MAX_HOURS = 720;

    public const MIN_DAYS = 1;

    public const MAX_DAYS = 30;

    /**
     * @return array{duration_days: int, duration_hours: ?int, ends_at: Carbon}
     */
    public static function resolve(mixed $hours, mixed $days): array
    {
        $hasHours = is_numeric($hours) && (int) $hours > 0;
        $hasDays = is_numeric($days) && (int) $days > 0;

        if ($hasHours && $hasDays) {
            throw ValidationException::withMessages([
                'poll.duration_hours' => 'Use either poll duration in hours or days, not both.',
            ]);
        }

        if (! $hasHours && ! $hasDays) {
            throw ValidationException::withMessages([
                'poll.duration_days' => 'Choose how long the poll stays open.',
            ]);
        }

        if ($hasHours) {
            $value = (int) $hours;
            if ($value < self::MIN_HOURS || $value > self::MAX_HOURS) {
                throw ValidationException::withMessages([
                    'poll.duration_hours' => 'Poll duration must be between 1 and 720 hours.',
                ]);
            }

            return [
                'duration_hours' => $value,
                'duration_days' => (int) min(255, max(1, (int) ceil($value / 24))),
                'ends_at' => now()->addHours($value),
            ];
        }

        $value = (int) $days;
        if ($value < self::MIN_DAYS || $value > self::MAX_DAYS) {
            throw ValidationException::withMessages([
                'poll.duration_days' => 'Poll duration must be between 1 and 30 days.',
            ]);
        }

        return [
            'duration_hours' => null,
            'duration_days' => $value,
            'ends_at' => now()->addDays($value),
        ];
    }
}
