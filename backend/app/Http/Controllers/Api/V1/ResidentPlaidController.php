<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\GuestAccessService;
use App\Services\PlaidAchService;
use App\Services\PlaidResidentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResidentPlaidController extends Controller
{
    public function __construct(
        private readonly PlaidResidentService $residents,
        private readonly PlaidAchService $ach,
    ) {
    }

    public function capability(Request $request): JsonResponse
    {
        $user = $this->resident($request);

        return response()->json([
            'success' => true,
            'data' => $this->ach->capability($user, $request->integer('community_id') ?: null),
        ]);
    }

    public function showConnection(Request $request): JsonResponse
    {
        $user = $this->resident($request);

        return response()->json([
            'success' => true,
            'data' => $this->residents->getConnection($user, $request->integer('community_id') ?: null),
        ]);
    }

    public function createLinkToken(Request $request): JsonResponse
    {
        $user = $this->resident($request);
        $mode = $request->string('mode')->toString();
        if (! in_array($mode, ['create', 'update', 'replace'], true)) {
            $mode = 'create';
        }

        $payload = $mode === 'update'
            ? $this->residents->createLinkToken($user, 'update', $request->integer('community_id') ?: null)
            : $this->residents->createLinkToken($user, 'create', $request->integer('community_id') ?: null);

        return response()->json([
            'success' => true,
            'data' => $payload,
        ]);
    }

    public function exchangeToken(Request $request): JsonResponse
    {
        $user = $this->resident($request);
        $validated = $request->validate([
            'public_token' => ['required', 'string', 'max:512'],
            'community_id' => ['nullable', 'integer'],
            'account_id' => ['nullable', 'string', 'max:128'],
            'account' => ['nullable', 'array'],
            'account.name' => ['nullable', 'string', 'max:120'],
            'account.official_name' => ['nullable', 'string', 'max:160'],
            'account.type' => ['nullable', 'string', 'max:40'],
            'account.subtype' => ['nullable', 'string', 'max:40'],
            'account.mask' => ['nullable', 'string', 'max:16'],
            'institution_id' => ['nullable', 'string', 'max:64'],
            'institution_name' => ['nullable', 'string', 'max:160'],
            'replace' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->residents->connect($user, $validated['public_token'], $validated),
        ]);
    }

    public function reconnect(Request $request): JsonResponse
    {
        $user = $this->resident($request);

        return response()->json([
            'success' => true,
            'data' => $this->residents->completeReconnect($user, $request->integer('community_id') ?: null),
        ]);
    }

    public function disconnect(Request $request): JsonResponse
    {
        $user = $this->resident($request);

        return response()->json([
            'success' => true,
            'data' => $this->residents->disconnect($user, $request->integer('community_id') ?: null),
        ]);
    }

    private function resident(Request $request): \App\Models\User
    {
        $user = $request->user();
        abort_if(! $user, 401, 'Authentication required');
        abort_if(GuestAccessService::isGuest($user), 403, 'Guests cannot connect a bank account.');

        return $user;
    }
}
