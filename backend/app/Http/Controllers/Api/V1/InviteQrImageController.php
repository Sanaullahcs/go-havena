<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\GuestInvitationService;
use App\Services\InviteCodeService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class InviteQrImageController extends Controller
{
    /** GET /v1/public/invite-qr.png?scope=member&code=... (signed) */
    public function show(Request $request): Response
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid or expired QR link.');
        }

        $scope = (string) $request->query('scope', 'member');
        $code = match ($scope) {
            'guest' => GuestInvitationService::normalizeInviteCode((string) $request->query('code', '')),
            default => InviteCodeService::normalize((string) $request->query('code', '')),
        };

        if ($code === '') {
            abort(404);
        }

        $payload = match ($scope) {
            'guest' => GuestInvitationService::qrPayload($code),
            default => InviteCodeService::qrPayload($code),
        };

        $png = InviteCodeService::qrPngBytes($payload);
        if (! $png) {
            abort(503, 'QR image unavailable.');
        }

        return response($png, 200, [
            'Content-Type' => 'image/png',
            'Content-Disposition' => 'inline; filename="invite-qr.png"',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    /** GET /v1/public/invite-qr (signed) — HTML page when email clients block inline images. */
    public function view(Request $request)
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid or expired QR link.');
        }

        $scope = (string) $request->query('scope', 'member');
        $code = match ($scope) {
            'guest' => GuestInvitationService::normalizeInviteCode((string) $request->query('code', '')),
            default => InviteCodeService::normalize((string) $request->query('code', '')),
        };

        if ($code === '') {
            abort(404);
        }

        $imageUrl = InviteCodeService::qrPublicImageUrl($code, $scope);
        if ($imageUrl === null) {
            abort(503, 'QR image unavailable.');
        }

        return response()->view('emails.invite-qr-view', [
            'code' => $code,
            'imageUrl' => $imageUrl,
        ]);
    }
}
