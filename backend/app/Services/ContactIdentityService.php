<?php

namespace App\Services;

use App\Models\GuestInvitation;
use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Exceptions\HttpResponseException;

class ContactIdentityService
{
    public const DUPLICATE_MESSAGE = 'This phone number and email already exist. Please use a different one.';

    public const DUPLICATE_EMAIL_MESSAGE = 'This email already exists. Please use a different email.';

    public const SIGNUP_EMAIL_EXISTS_MESSAGE = 'An account already exists with this email address. Please log in to continue.';

    public const DUPLICATE_PHONE_MESSAGE = 'This phone number already exists. Please use a different phone number.';

    public const EMAIL_LOCAL_PART_MAX = 64;

    /** Local/dev aliases for the current TGI community admin login. */
    private const EMAIL_ALIASES = [
        'tgiadmin@havena.app' => 'tgi.admin@havena.app',
    ];

    /** @var list<string> */
    private const PLACEHOLDER_EMAIL_SUFFIXES = [
        '@phone.havena.local',
        '@guest.havena.local',
    ];

    public static function isPlaceholderEmail(?string $email): bool
    {
        if (! filled($email)) {
            return true;
        }

        $normalized = strtolower(trim($email));

        if (User::isPhonePlaceholderEmail($normalized)) {
            return true;
        }

        foreach (self::PLACEHOLDER_EMAIL_SUFFIXES as $suffix) {
            if (str_ends_with($normalized, $suffix)) {
                return true;
            }
        }

        return false;
    }

    public static function normalizeEmail(?string $email): ?string
    {
        if (! filled($email)) {
            return null;
        }

        $normalized = strtolower(trim((string) $email));

        return $normalized !== '' ? $normalized : null;
    }

    public static function hasValidLocalPart(?string $email): bool
    {
        $normalized = self::normalizeEmail($email);
        if (! $normalized) {
            return false;
        }

        $at = strpos($normalized, '@');
        if ($at === false || $at === 0) {
            return false;
        }

        return $at <= self::EMAIL_LOCAL_PART_MAX;
    }

    public static function findUserByEmail(string $email, bool $withTrashed = false): ?User
    {
        $normalized = self::normalizeEmail($email);
        if (! $normalized || self::isPlaceholderEmail($normalized)) {
            return null;
        }

        $lookup = self::EMAIL_ALIASES[$normalized] ?? $normalized;

        $query = $withTrashed
            ? User::withTrashed()
            : User::query()->whereNull('deleted_at');

        return $query->whereRaw('LOWER(email) = ?', [$lookup])->first();
    }

    public static function findActiveUserByEmail(string $email, ?int $excludeUserId = null): ?User
    {
        $user = self::findUserByEmail($email);
        if ($excludeUserId && $user && (int) $user->id === $excludeUserId) {
            return null;
        }

        return $user;
    }

    public static function findActiveUserByPhone(string $phone, ?int $excludeUserId = null): ?User
    {
        $user = PhoneNormalizer::findUserByPhone($phone);
        if (! $user || $user->trashed()) {
            return null;
        }

        if ($excludeUserId && $user->id === $excludeUserId) {
            return null;
        }

        return $user;
    }

    /**
     * Phone still reserved by a row, including soft-deleted users.
     * Soft-deleted accounts keep the unique index, so re-invites must be rejected.
     */
    public static function findOccupyingUserByPhone(string $phone, ?int $excludeUserId = null): ?User
    {
        $normalized = PhoneNormalizer::normalize($phone);
        if (! $normalized) {
            return null;
        }

        $candidates = array_values(array_unique([
            $normalized,
            ...PhoneNormalizer::alternatesForLookup($normalized),
        ]));

        $user = User::withTrashed()->whereIn('phone', $candidates)->first();
        if ($excludeUserId && $user && (int) $user->id === $excludeUserId) {
            return null;
        }

        return $user;
    }

    public static function hasActiveGuestInvitationForPhone(string $phone): bool
    {
        $normalized = PhoneNormalizer::normalize($phone);
        if (! $normalized) {
            return false;
        }

        return self::activeGuestInvitationQuery()
            ->where('guest_phone', $normalized)
            ->exists();
    }

    public static function hasActiveGuestInvitationForEmail(string $email): bool
    {
        $normalized = self::normalizeEmail($email);
        if (! $normalized || self::isPlaceholderEmail($normalized)) {
            return false;
        }

        return self::activeGuestInvitationQuery()
            ->whereRaw('LOWER(guest_email) = ?', [$normalized])
            ->exists();
    }

    /**
     * Block provisioning or profile updates when email/phone belong to another live account.
     */
    public static function assertAvailableForRegistration(
        ?string $email,
        ?string $phone,
        ?int $excludeUserId = null,
        ?string $field = null,
    ): void {
        if ($email) {
            $existingEmail = self::findUserByEmail($email, withTrashed: true);
            if ($existingEmail && (! $excludeUserId || (int) $existingEmail->id !== $excludeUserId)) {
                self::failDuplicate($field ?? 'email', self::DUPLICATE_EMAIL_MESSAGE);
            }
        }

        if ($phone && self::findOccupyingUserByPhone($phone, $excludeUserId)) {
            self::failDuplicate($field ?? 'phone', self::DUPLICATE_PHONE_MESSAGE);
        }
    }

    /**
     * Block guest invites when email/phone are already registered or on another active invite.
     */
    public static function assertAvailableForGuestInvite(?string $email, ?string $phone): void
    {
        if ($phone && self::findActiveUserByPhone($phone)) {
            self::failDuplicate('guest_phone', self::DUPLICATE_PHONE_MESSAGE);
        }

        if ($email && self::findActiveUserByEmail($email)) {
            self::failDuplicate('guest_email', self::DUPLICATE_EMAIL_MESSAGE);
        }

        if ($phone && self::hasActiveGuestInvitationForPhone($phone)) {
            self::failDuplicate('guest_phone', self::DUPLICATE_PHONE_MESSAGE);
        }

        if ($email && self::hasActiveGuestInvitationForEmail($email)) {
            self::failDuplicate('guest_email', self::DUPLICATE_EMAIL_MESSAGE);
        }
    }

    public static function failDuplicate(string $field = 'contact', ?string $message = null): never
    {
        $text = $message ?? self::DUPLICATE_MESSAGE;

        throw new HttpResponseException(response()->json([
            'message' => $text,
            'code'    => 'CONTACT_ALREADY_EXISTS',
            'errors'  => [
                $field => [$text],
            ],
        ], 422));
    }

    private static function activeGuestInvitationQuery()
    {
        return GuestInvitation::query()
            ->whereIn('status', ['pending_verification', 'pending_approval', 'active'])
            ->where('ends_at', '>', now());
    }
}
