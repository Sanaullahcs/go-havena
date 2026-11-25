<?php

namespace App\Support;

/**
 * User-facing nouns for maintenance vs technical support tickets.
 * Internal identifiers (DB, routes, kinds) stay "complaint".
 */
final class ComplaintUserLabels
{
    public static function isMaintenance(object $complaint): bool
    {
        return ($complaint->type ?? '') === 'maintenance';
    }

  public static function isMaintenanceType(?string $type): bool
    {
        return $type === 'maintenance';
    }

    /** Singular: "service request" or "complaint". */
    public static function singular(object $complaint, bool $capitalized = false): string
    {
        $word = self::isMaintenance($complaint) ? 'service request' : 'complaint';

        return $capitalized ? ucfirst($word) : $word;
    }

    /** Plural: "service requests" or "complaints". */
    public static function plural(object $complaint, bool $capitalized = false): string
    {
        $word = self::isMaintenance($complaint) ? 'service requests' : 'complaints';

        return $capitalized ? ucfirst($word) : $word;
    }

    public static function singularForType(?string $type, bool $capitalized = false): string
    {
        $word = self::isMaintenanceType($type) ? 'service request' : 'complaint';

        return $capitalized ? ucfirst($word) : $word;
    }

    /** Title prefix for notifications, e.g. "Service request" vs "Complaint". */
    public static function titled(object $complaint): string
    {
        return self::singular($complaint, true);
    }
}