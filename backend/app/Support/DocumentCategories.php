<?php

namespace App\Support;

class DocumentCategories
{
    public const PRESETS = [
        'Rules & Policies',
        'Maintenance',
        'Financial',
        'Property',
    ];

    public static function isPreset(string $name): bool
    {
        $key = mb_strtolower(trim($name));

        foreach (self::PRESETS as $preset) {
            if (mb_strtolower($preset) === $key) {
                return true;
            }
        }

        return false;
    }

    public static function isOther(string $name): bool
    {
        $key = mb_strtolower(trim($name));

        return $key === 'other' || $key === 'others';
    }
}
