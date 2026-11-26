<?php

namespace App\Support\Landlord;

final class UnitOwnershipOccupancy
{
    public const LIVE_HERE = 'live_here';

    public const RENTED = 'rented';

    public const VACANT = 'vacant';

    /** @return list<string> */
    public static function all(): array
    {
        return [self::LIVE_HERE, self::RENTED, self::VACANT];
    }

    public static function isValid(?string $value): bool
    {
        return $value !== null && in_array($value, self::all(), true);
    }

    public static function qualifiesForLandlordDashboard(?string $occupancy): bool
    {
        return $occupancy === self::RENTED || $occupancy === self::VACANT;
    }
}