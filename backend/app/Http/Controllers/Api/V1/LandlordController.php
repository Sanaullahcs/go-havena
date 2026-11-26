<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Landlord\LandlordAccessService;
use App\Services\Landlord\LandlordPortfolioService;
use App\Services\Landlord\UnitOwnershipService;
use App\Services\UnitAssignmentService;
use App\Services\UserActingContextService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LandlordController extends Controller
{
    public function __construct(
        private readonly LandlordPortfolioService $portfolio,
        private readonly UnitOwnershipService $ownerships,
        private readonly UnitAssignmentService $units,
        private readonly LandlordAccessService $access,
    ) {}

    public function portfolio(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request);
        $userId = (int) $request->user()->id;
        $data = $this->portfolio->portfolio($userId, $communityId);
        $landlordCommunities = $this->access->landlordCommunityIds($userId);
        $communities = DB::table('communities')
            ->whereIn('id', $landlordCommunities)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name])
            ->all();

        return response()->json([
            'data' => $data,
            'meta' => [
                'landlord_community_ids' => $landlordCommunities,
                'landlord_communities' => $communities,
                'landlord_community_picker' => count($landlordCommunities) > 1,
            ],
        ]);
    }

    public function enable(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request);
        $this->ownerships->setLandlordEnabled((int) $request->user()->id, $communityId, true);

        return response()->json([
            'message' => 'Landlord mode enabled for this community.',
            'data' => $this->access->resolve((int) $request->user()->id, $communityId),
        ]);
    }

    public function claimOwnership(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request);

        $data = $request->validate([
            'unit_number' => 'required|string|max:50',
            'is_new_unit' => 'sometimes|boolean',
            'proof_url' => 'required|string|max:1024',
            'occupancy' => ['required', Rule::in(UnitOwnershipOccupancy::all())],
        ]);

        $unitNumber = trim($data['unit_number']);
        if ($unitNumber === '') {
            throw ValidationException::withMessages(['unit_number' => 'Unit number is required.']);
        }

        $isNew = (bool) ($data['is_new_unit'] ?? false);
        if ($isNew) {
            if ($this->units->unitNumberExistsInCommunity($communityId, $unitNumber)) {
                throw ValidationException::withMessages([
                    'unit_number' => [UnitAssignmentService::DUPLICATE_UNIT_MESSAGE],
                ]);
            }
            $unit = $this->units->createUnit($communityId, $unitNumber);
        } else {
            $normalized = $this->units->normalizeUnitNumber($unitNumber);
            $unit = $this->units->findUnitByNormalizedNumber($communityId, $normalized);
            if (! $unit) {
                throw ValidationException::withMessages([
                    'unit_number' => 'Unit not found in this community.',
                ]);
            }
        }

        $occupancy = (string) $data['occupancy'];
        $ownershipId = $this->ownerships->claim(
            $communityId,
            (int) $unit->id,
            (int) $request->user()->id,
            $occupancy,
            'become_landlord',
            $data['proof_url'],
        );

        $this->ownerships->setLandlordEnabled((int) $request->user()->id, $communityId, true);
        app(\App\Services\Landlord\LandlordOwnershipAdminNotifier::class)->notifyPendingClaim($ownershipId);

        return response()->json([
            'message' => 'Ownership claim submitted for admin review.',
            'data' => [
                'ownership_id' => $ownershipId,
                'portfolio' => $this->portfolio->portfolio((int) $request->user()->id, $communityId),
            ],
        ], 201);
    }

    public function updateOccupancy(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'occupancy' => ['required', Rule::in(UnitOwnershipOccupancy::all())],
        ]);

        $this->ownerships->setOccupancy($id, (int) $request->user()->id, $data['occupancy']);

        $communityId = $this->resolveCommunityId($request);

        return response()->json([
            'message' => 'Occupancy updated.',
            'data' => $this->portfolio->portfolio((int) $request->user()->id, $communityId),
        ]);
    }

    public function advisoryIndex(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request);
        $rows = app(\App\Services\Landlord\LandlordAdvisoryService::class)
            ->pendingForLandlord((int) $request->user()->id, $communityId);

        return response()->json(['data' => $rows]);
    }

    public function advisoryDecide(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|in:approved,rejected',
            'reason' => 'nullable|string|max:2000',
        ]);

        app(\App\Services\Landlord\LandlordAdvisoryService::class)->decide(
            $id,
            (int) $request->user()->id,
            $data['status'],
            $data['reason'] ?? null,
        );

        return response()->json([
            'message' => 'Advisory review saved. Community admin approval is still required.',
            'data' => ['id' => $id, 'status' => $data['status'], 'blocks_admin' => false],
        ]);
    }

    public function setPrimaryResidence(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request);
        $data = $request->validate([
            'unit_id' => 'required|integer',
        ]);

        $this->ownerships->setPrimaryResidence((int) $request->user()->id, $communityId, (int) $data['unit_id']);

        return response()->json([
            'message' => 'Primary residence updated.',
            'data' => $this->access->resolve((int) $request->user()->id, $communityId),
        ]);
    }

    private function resolveCommunityId(Request $request): int
    {
        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        return UserActingContextService::requireCurrentCommunityId($request->user());
    }
}