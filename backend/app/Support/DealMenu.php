<?php

namespace App\Support;

use Illuminate\Http\Request;

class DealMenu
{
    public const MAX_ITEMS = 50;

    public const NAME_MAX = 120;

    public const DESCRIPTION_MAX = 500;

    public const PRICE_MAX = 40;

    public const IMAGE_MAX = 512;

    /** @return list<array{name: string, description: ?string, price: ?string, image_url: ?string}> */
    public static function sanitizeItems(mixed $items): array
    {
        if (! is_array($items)) {
            return [];
        }

        $out = [];
        foreach (array_slice(array_values($items), 0, self::MAX_ITEMS) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $name = trim((string) ($item['name'] ?? ''));
            if ($name === '') {
                continue;
            }

            $out[] = [
                'name'        => mb_substr($name, 0, self::NAME_MAX),
                'description' => self::nullableString($item['description'] ?? null, self::DESCRIPTION_MAX),
                'price'       => self::nullableString($item['price'] ?? null, self::PRICE_MAX),
                'image_url'   => MediaUrl::normalize(
                    is_string($item['image_url'] ?? null) ? $item['image_url'] : null
                ),
            ];
        }

        return $out;
    }

    /** @return list<array{name: string, description: ?string, price: ?string, image_url: ?string}> */
    public static function decode(mixed $raw): array
    {
        if (is_array($raw)) {
            return self::sanitizeItems($raw);
        }

        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);

            return is_array($decoded) ? self::sanitizeItems($decoded) : [];
        }

        return [];
    }

    /** @return list<array{name: string, description: ?string, price: ?string, image_url: ?string}> */
    public static function format(mixed $raw, ?Request $request = null): array
    {
        return array_map(static function (array $item) use ($request) {
            return [
                'name'        => $item['name'],
                'description' => $item['description'],
                'price'       => $item['price'],
                'image_url'   => MediaUrl::toPublic($item['image_url'] ?? null, $request),
            ];
        }, self::decode($raw));
    }

    public static function encode(mixed $items): string
    {
        return json_encode(self::sanitizeItems($items), JSON_UNESCAPED_UNICODE);
    }

    private static function nullableString(mixed $value, int $max): ?string
    {
        $trimmed = trim((string) ($value ?? ''));
        if ($trimmed === '') {
            return null;
        }

        return mb_substr($trimmed, 0, $max);
    }
}
