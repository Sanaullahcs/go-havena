<?php

namespace App\Support;

use App\Models\Community;
use Illuminate\Validation\ValidationException;

class CommunityNameUniqueness
{
    public const DUPLICATE_MESSAGE = 'A community with this name already exists in the selected region. Choose a different name.';

    public static function normalize(string $name): string
    {
        return mb_strtolower(trim($name));
    }

    public static function existsInRegion(string $name, int $regionId, ?int $exceptCommunityId = null): bool
    {
        $normalized = self::normalize($name);
        if ($normalized === '') {
            return false;
        }

        $query = Community::query()
            ->where('region_id', $regionId)
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

    /** @throws ValidationException */
    public static function assertUniqueInRegion(
        string $name,
        int $regionId,
        string $field = 'community_name',
        ?int $exceptCommunityId = null,
        ?string $message = null,
    ): void {
        if (self::existsInRegion($name, $regionId, $exceptCommunityId)) {
            throw ValidationException::withMessages([
                $field => [$message ?? self::DUPLICATE_MESSAGE],
            ]);
        }
    }
}
