<?php

namespace App\Support;

class NotificationText
{
    public const TITLE_MAX = 255;

    public const BODY_MAX = 500;

    public static function clip(?string $value, int $max): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }

        if (mb_strlen($value) <= $max) {
            return $value;
        }

        return rtrim(mb_substr($value, 0, $max - 1)).'…';
    }

    public static function title(?string $value): string
    {
        return self::clip($value, self::TITLE_MAX);
    }

    public static function body(?string $value): string
    {
        return self::clip($value, self::BODY_MAX);
    }
}
