<?php

namespace App\Support;

use App\Models\Community;
use Illuminate\Validation\ValidationException;

class CommunityNameUniqueness
{
    public const DUPLICATE_MESSAGE = 'A community with this name already exists. Please use a different name.';

    public static function normalize(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    public static function exists(string $name, ?int $exceptCommunityId = null): bool
    {
        $normalized = self::normalize($name);
        if ($normalized === '') {
            return false;
        }

        $query = Community::query()
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhereIn('review_status', ['approved', 'pending']);
            })
            ->whereRaw('LOWER(TRIM(name)) = ?', [$normalized]);

        if ($exceptCommunityId) {
            $query->where('id', '!=', $exceptCommunityId);
        }

        return $query->exists();
    }

    /** @deprecated Use {@see exists()}. Kept for call-site compatibility; region is ignored. */
    public static function existsInRegion(string $name, int $regionId, ?int $exceptCommunityId = null): bool
    {
        return self::exists($name, $exceptCommunityId);
    }

    /** @throws ValidationException */
    public static function assertUnique(
        string $name,
        string $field = 'community_name',
        ?int $exceptCommunityId = null,
        ?string $message = null,
    ): void {
        if (self::exists($name, $exceptCommunityId)) {
            throw ValidationException::withMessages([
                $field => [$message ?? self::DUPLICATE_MESSAGE],
            ]);
        }
    }

    /**
     * @throws ValidationException
     * @param  int  $regionId  Unused; names must be unique platform-wide.
     */
    public static function assertUniqueInRegion(
        string $name,
        int $regionId,
        string $field = 'community_name',
        ?int $exceptCommunityId = null,
        ?string $message = null,
    ): void {
        self::assertUnique($name, $field, $exceptCommunityId, $message);
    }
}
