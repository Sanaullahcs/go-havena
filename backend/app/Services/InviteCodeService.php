<?php

namespace App\Services;

use App\Models\CommunityMembership;
use App\Models\InviteCode;
use App\Models\User;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\Writer\PngWriter;
use Endroid\QrCode\Writer\SvgWriter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;

class InviteCodeService
{
    /** Letters/digits that stay readable when typed from email or a QR label. */
    private const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public static function generateUniqueCode(): string
    {
        do {
            $code = 'NBR-'.self::randomSegment(4).'-'.random_int(2345, 9876);
        } while (InviteCode::query()->where('code', $code)->exists());

        return $code;
    }

    /**
     * Strip copy/paste noise from email (spaces, unicode dashes, zero-width chars).
     */
    public static function compactCode(string $code): string
    {
        $value = strtoupper(trim($code));
        $value = strtr($value, [
            "\u{2010}" => '-',
            "\u{2011}" => '-',
            "\u{2012}" => '-',
            "\u{2013}" => '-',
            "\u{2014}" => '-',
            "\u{2212}" => '-',
            "\u{00AD}" => '-',
        ]);
        $value = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $value) ?? $value;

        return preg_replace('/[^A-Z0-9]/', '', $value) ?? '';
    }

    public static function normalize(string $code): string
    {
        $compact = self::compactCode($code);
        if (preg_match('/^NBR([A-Z0-9]{4})(\d{4})$/', $compact, $matches)) {
            return 'NBR-'.$matches[1].'-'.$matches[2];
        }

        $trimmed = strtoupper(trim($code));
        $trimmed = strtr($trimmed, [
            "\u{2010}" => '-',
            "\u{2011}" => '-',
            "\u{2012}" => '-',
            "\u{2013}" => '-',
            "\u{2014}" => '-',
            "\u{2212}" => '-',
            "\u{00AD}" => '-',
        ]);
        $trimmed = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $trimmed) ?? $trimmed;
        $trimmed = preg_replace('/\s+/', '', $trimmed) ?? $trimmed;

        return $trimmed;
    }

    public static function findUsableByCode(string $input, ?int $communityId = null): ?InviteCode
    {
        $compact = self::compactCode($input);
        if (strlen($compact) < 6) {
            return null;
        }

        $query = InviteCode::query()->with('community');
        if ($communityId !== null) {
            $query->where('community_id', $communityId);
        }

        $invite = $query
            ->whereRaw("REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') = ?", [$compact])
            ->first();

        if (! $invite || ! $invite->isValid()) {
            return null;
        }

        return $invite;
    }

    public static function createForCommunity(
        int $communityId,
        ?int $createdBy = null,
        ?int $maxUses = 1,
        ?\DateTimeInterface $expiresAt = null,
        ?int $invitedUserId = null,
    ): InviteCode {
        return InviteCode::query()->create([
            'community_id'   => $communityId,
            'code'           => self::generateUniqueCode(),
            'created_by'     => $createdBy,
            'invited_user_id'=> $invitedUserId,
            'max_uses'       => $maxUses,
            'used_count'     => 0,
            'expires_at'     => $expiresAt,
        ]);
    }

    /**
     * When a resident redeems an admin member invite, merge the placeholder invited
     * account into the email-authenticated user so invitation email/name/unit can be reused.
     *
     * @return array{display_name:string,email:string,unit_number:?string}|null
     */
    public static function claimInvitedMember(User $claimant, InviteCode $invite): ?array
    {
        $invitedUserId = (int) ($invite->invited_user_id ?? 0);
        if ($invitedUserId <= 0 || $invitedUserId === (int) $claimant->id) {
            return null;
        }

        $invited = User::query()->with('profile')->find($invitedUserId);
        if (! $invited || $invited->trashed() || ! self::isInvitedPlaceholderUser($invited, $invite)) {
            return null;
        }

        $invitedProfile = $invited->profile;
        $prefill = [
            'display_name' => $invitedProfile?->display_name ?: ($invited->name ?: ''),
            'email'        => ContactIdentityService::normalizeEmail($invited->email) ?? '',
            'unit_number'  => $invitedProfile?->unit_number,
        ];

        if ($prefill['email'] === '') {
            return null;
        }

        DB::transaction(function () use ($claimant, $invited, $prefill): void {
            CommunityMembership::query()
                ->where('user_id', $invited->id)
                ->delete();

            if (Schema::hasTable('invite_unit_assignments')) {
                DB::table('invite_unit_assignments')
                    ->where('user_id', $invited->id)
                    ->update([
                        'user_id' => $claimant->id,
                        'updated_at' => now(),
                    ]);
            }

            $invited->update([
                'email' => 'claimed-'.$invited->id.'@invited-claimed.havena.local',
            ]);
            $invited->delete();

            $claimant->update([
                'name'  => $prefill['display_name'] ?: $claimant->name,
                'email' => $prefill['email'],
            ]);

            $claimant->profile()->updateOrCreate(
                ['user_id' => $claimant->id],
                array_filter([
                    'display_name' => $prefill['display_name'] ?: null,
                    'unit_number'  => $prefill['unit_number'],
                ], fn ($value) => $value !== null && $value !== ''),
            );
        });

        $claimant->refresh()->load(['profile', 'memberships.community']);

        return $prefill;
    }

    private static function isInvitedPlaceholderUser(User $user, ?InviteCode $forInvite = null): bool
    {
        if (ContactIdentityService::isPlaceholderEmail($user->email)) {
            return false;
        }

        // When redeeming a member invite, the linked placeholder is claimable even after
        // used_count increments (claim runs in the same request as the redemption).
        if ($forInvite && (int) $forInvite->invited_user_id === (int) $user->id) {
            return true;
        }

        // Reserved invite seats stay placeholders until the code is redeemed — even if
        // the invitee verified email/phone by logging in before entering the code.
        if (InviteCode::query()->pendingForUser((int) $user->id)->exists()) {
            return true;
        }

        if ($user->phone_verified_at || filled($user->phone)) {
            return false;
        }

        return true;
    }

    /** True when this account still must redeem its member invite code in the app. */
    public static function userNeedsInviteCode(User $user): bool
    {
        if (CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->exists()) {
            return false;
        }

        return InviteCode::query()->pendingForUser((int) $user->id)->exists();
    }

    public static function rejectForUser(InviteCode $invite, User $user): InviteCode
    {
        if ((int) $invite->invited_user_id !== (int) $user->id) {
            abort(404, 'Invitation not found.');
        }

        if ($invite->rejected_at || ! $invite->isValid()) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'invite' => ['This invitation is no longer pending.'],
            ]);
        }

        $invite->forceFill([
            'rejected_at' => now(),
        ])->save();

        app(CommunityBillingService::class)->releaseReservationsForUser(
            (int) $invite->community_id,
            (int) $user->id,
        );

        return $invite->fresh();
    }

    /**
     * Block login for admin-provisioned invite placeholders whose invite was cancelled or expired
     * and who never received a community membership.
     *
     * @return array{message: string, code: string, status?: string, reason?: ?string, rejected_by?: ?string}|null
     */
    public static function inactiveMemberInviteAuthenticationBlock(User $user): ?array
    {
        if (($user->role ?? '') !== 'resident' || $user->trashed()) {
            return null;
        }

        if (CommunityMembership::query()->where('user_id', $user->id)->exists()) {
            return null;
        }

        if (self::userNeedsInviteCode($user)) {
            return null;
        }

        $wasInvitePlaceholder = InviteCode::withTrashed()
            ->where('invited_user_id', $user->id)
            ->exists();

        if (! $wasInvitePlaceholder) {
            return null;
        }

        return [
            'message' => 'This invitation is no longer active. Contact your community admin for a new invite.',
            'code' => 'MEMBER_INVITE_INACTIVE',
            'status' => 'invitation_inactive',
            'reason' => null,
            'rejected_by' => null,
        ];
    }

    /** @return InviteCode|null */
    public static function pendingInviteFor(User $user): ?InviteCode
    {
        return InviteCode::query()
            ->pendingForUser((int) $user->id)
            ->orderByDesc('id')
            ->first();
    }

    /** Value encoded in QR — mobile scanner accepts code or URL with invite_code param. */
    public static function qrPayload(string $code): string
    {
        return 'havena://join?invite_code='.urlencode($code);
    }

    /** Signed HTTPS URL for email clients that block CID/data-URI images (e.g. Gmail mobile). */
    public static function qrPublicImageUrl(string $code, string $scope = 'member'): ?string
    {
        return self::signedPublicQrRoute('public.invite-qr', $code, $scope);
    }

    /** HTML page with the QR image — fallback when email clients block inline images. */
    public static function qrPublicViewUrl(string $code, string $scope = 'member'): ?string
    {
        return self::signedPublicQrRoute('public.invite-qr-view', $code, $scope);
    }

    public static function emailImageBaseUrl(): string
    {
        $configured = rtrim((string) config('mail.brand.api_url', ''), '/');

        if ($configured !== '' && self::isPublicEmailImageHost($configured)) {
            return $configured;
        }

        $appUrl = rtrim((string) config('app.url', ''), '/');
        if ($appUrl !== '' && self::isPublicEmailImageHost($appUrl)) {
            return $appUrl;
        }

        $derived = self::deriveProductionApiUrl();
        if ($derived !== null) {
            return $derived;
        }

        return $configured !== '' ? $configured : ($appUrl ?: 'http://localhost:8000');
    }

    public static function isPublicEmailImageHost(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return false;
        }

        $host = strtolower($host);
        if (in_array($host, ['localhost', '127.0.0.1', '0.0.0.0'], true)) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return (bool) filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            );
        }

        return true;
    }

    private static function signedPublicQrRoute(string $routeName, string $code, string $scope): ?string
    {
        if (! self::isPublicEmailImageHost(self::emailImageBaseUrl())) {
            return null;
        }

        $normalized = $scope === 'guest'
            ? GuestInvitationService::normalizeInviteCode($code)
            : self::normalize($code);

        if ($normalized === '') {
            return null;
        }

        $base = self::emailImageBaseUrl();
        $baseScheme = parse_url($base, PHP_URL_SCHEME) ?: 'https';
        $appScheme = parse_url((string) config('app.url'), PHP_URL_SCHEME);

        URL::forceRootUrl($base);
        URL::forceScheme($baseScheme);
        try {
            $url = URL::temporarySignedRoute(
                $routeName,
                now()->addDays(90),
                [
                    'scope' => $scope,
                    'code' => $normalized,
                ],
                absolute: true,
            );

            if ($baseScheme === 'https' && str_starts_with($url, 'http://')) {
                $url = 'https://'.substr($url, 7);
            }

            return $url;
        } finally {
            URL::forceRootUrl((string) config('app.url'));
            URL::forceScheme($appScheme ?: null);
        }
    }

    private static function deriveProductionApiUrl(): ?string
    {
        $mailHost = strtolower((string) (config('mail.mailers.smtp.host') ?: env('MAIL_HOST', '')));
        if (str_contains($mailHost, 'gohavena.com')) {
            return 'https://api.gohavena.com';
        }

        $from = strtolower((string) (config('mail.from.address') ?: env('MAIL_FROM_ADDRESS', '')));
        if (str_contains($from, 'gohavena.com')) {
            return 'https://api.gohavena.com';
        }

        $website = rtrim((string) config('mail.brand.website_url', ''), '/');
        if ($website !== '' && self::isPublicEmailImageHost($website)) {
            $host = parse_url($website, PHP_URL_HOST);
            $scheme = parse_url($website, PHP_URL_SCHEME) ?: 'https';
            if (is_string($host) && $host !== '' && ! str_starts_with($host, 'api.')) {
                $apiHost = 'api.'.preg_replace('/^www\./', '', $host);
                $candidate = $scheme.'://'.$apiHost;
                if (self::isPublicEmailImageHost($candidate)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    public static function qrPngBytes(string $payload, int $size = 280): ?string
    {
        if (! extension_loaded('gd')) {
            return null;
        }

        try {
            $result = Builder::create()
                ->writer(new PngWriter())
                ->data($payload)
                ->encoding(new Encoding('UTF-8'))
                ->errorCorrectionLevel(ErrorCorrectionLevel::Medium)
                ->size($size)
                ->margin(12)
                ->build();

            return $result->getString();
        } catch (\Throwable) {
            return null;
        }
    }

    public static function qrSvgBytes(string $payload, int $size = 280): ?string
    {
        try {
            $result = Builder::create()
                ->writer(new SvgWriter())
                ->data($payload)
                ->encoding(new Encoding('UTF-8'))
                ->errorCorrectionLevel(ErrorCorrectionLevel::Medium)
                ->size($size)
                ->margin(12)
                ->build();

            return $result->getString();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * QR image for transactional email: PNG when GD is available, otherwise SVG.
     *
     * @return array{bytes: string, mime: string, data_uri: string, use_cid: bool}|null
     */
    public static function qrEmailImage(string $payload, int $size = 280): ?array
    {
        $png = self::qrPngBytes($payload, $size);
        if ($png) {
            return [
                'bytes' => $png,
                'mime' => 'image/png',
                'data_uri' => 'data:image/png;base64,'.base64_encode($png),
                'use_cid' => true,
            ];
        }

        $svg = self::qrSvgBytes($payload, $size);
        if ($svg) {
            return [
                'bytes' => $svg,
                'mime' => 'image/svg+xml',
                'data_uri' => 'data:image/svg+xml;base64,'.base64_encode($svg),
                'use_cid' => false,
            ];
        }

        return null;
    }

    private static function randomSegment(int $length): string
    {
        $max = strlen(self::CODE_ALPHABET) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= self::CODE_ALPHABET[random_int(0, $max)];
        }

        return $out;
    }

    /**
     * Soft-cancel unused member invites so the code cannot be redeemed later.
     *
     * @return list<InviteCode>
     */
    public static function cancelPendingInvitesForUser(int $communityId, int $userId): array
    {
        $invites = InviteCode::query()
            ->where('community_id', $communityId)
            ->where('invited_user_id', $userId)
            ->get();

        foreach ($invites as $invite) {
            $invite->forceFill([
                'expires_at' => now(),
                'used_count' => max((int) $invite->used_count, (int) ($invite->max_uses ?? 1)),
            ])->save();
            $invite->delete();
        }

        return $invites->all();
    }
}
