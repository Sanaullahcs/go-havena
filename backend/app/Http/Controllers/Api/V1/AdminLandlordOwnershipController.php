<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\Landlord\LandlordBillingContactService;
use App\Services\Landlord\UnitOwnershipService;
use App\Services\UnitAssignmentService;
use App\Support\Landlord\UnitOwnershipOccupancy;
use App\Support\Landlord\UnitOwnershipStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminLandlordOwnershipController extends Controller
{
    public function __construct(
        private readonly UnitOwnershipService $ownerships,
        private readonly UnitAssignmentService $units,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $communityId = $this->communityScope($request);
        $statusParam = strtolower(trim((string) $request->query('status', UnitOwnershipStatus::PENDING)));
        if ($statusParam === 'all') {
            $statusParam = '';
        }

        if (! Schema::hasTable('unit_ownerships')) {
            return response()->json(['data' => []]);
        }

        $query = DB::table('unit_ownerships as o')
            ->join('units', 'units.id', '=', 'o.unit_id')
            ->join('users', 'users.id', '=', 'o.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->when($communityId > 0, fn ($q) => $q->where('o.community_id', $communityId))
            ->whereIn('o.occupancy', [UnitOwnershipOccupancy::VACANT, UnitOwnershipOccupancy::RENTED])
            ->when($statusParam !== '', fn ($q) => $q->where('o.status', $statusParam))
            ->orderByDesc('o.created_at')
            ->select(
                'o.id',
                'o.unit_id',
                'o.user_id',
                'o.community_id',
                'o.occupancy',
                'o.status',
                'o.source',
                'o.proof_url',
                'o.rejection_reason',
                'o.reviewed_at',
                'o.created_at',
                'units.unit_number',
                'units.billing_contact_user_id',
                'users.email',
                'users.phone',
                'users.name',
                'profiles.display_name',
            )
            ->limit(100);

        $raw = $query->get();
        $unitContext = $this->unitContextForClaims($raw);

        $rows = $raw->map(function ($row) use ($unitContext) {
            $proof = $row->proof_url ? $this->resolveMediaUrl((string) $row->proof_url) : null;
            $unitId = (int) $row->unit_id;
            $ctx = $unitContext[$unitId] ?? ['billing_contact' => null, 'resident_counts' => ['active' => 0, 'pending' => 0, 'total' => 0]];
            $billingContact = $this->resolveBillingContactForClaim($row, $ctx['billing_contact']);

            return [
                'id' => (int) $row->id,
                'unit_id' => $unitId,
                'user_id' => (int) $row->user_id,
                'community_id' => (int) $row->community_id,
                'occupancy' => (string) $row->occupancy,
                'status' => (string) $row->status,
                'source' => $row->source,
                'proof_url' => $proof,
                'rejection_reason' => $row->rejection_reason,
                'reviewed_at' => $row->reviewed_at,
                'created_at' => $row->created_at,
                'unit_number' => (string) $row->unit_number,
                'email' => (string) $row->email,
                'phone' => $row->phone,
                'display_name' => $row->display_name ?: $row->name,
                'billing_contact' => $billingContact,
                'resident_counts' => $ctx['resident_counts'],
            ];
        });

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $row = $this->findClaim($request, $id);
        $proof = isset($row->proof_url) ? $this->resolveMediaUrl((string) $row->proof_url) : null;
        $reviewerName = null;
        if (! empty($row->reviewed_by)) {
            $reviewerName = DB::table('users')->where('id', $row->reviewed_by)->value('name');
        }
        $claimer = DB::table('users as u')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'u.id')
            ->where('u.id', $row->user_id)
            ->select('u.email', 'u.phone', 'u.name', 'profiles.display_name')
            ->first();

        $unitId = (int) $row->unit_id;
        $unitRow = DB::table('units')->where('id', $unitId)->first();
        $billingId = (int) ($unitRow->billing_contact_user_id ?? 0);
        if (
            $billingId < 1
            && (string) $row->occupancy === UnitOwnershipOccupancy::VACANT
            && (string) $row->status === UnitOwnershipStatus::APPROVED
        ) {
            app(LandlordBillingContactService::class)->syncForUnit($unitId);
            $billingId = (int) (DB::table('units')->where('id', $unitId)->value('billing_contact_user_id') ?? 0);
        }

        $unitBillingFromDb = null;
        if ($billingId > 0) {
            $billingUser = DB::table('users as u')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'u.id')
                ->where('u.id', $billingId)
                ->select('u.id', 'u.email', 'u.name', 'profiles.display_name')
                ->first();
            if ($billingUser) {
                $unitBillingFromDb = [
                    'id' => (int) $billingUser->id,
                    'name' => (string) ($billingUser->display_name ?: $billingUser->name),
                    'email' => $billingUser->email,
                ];
            }
        }

        $billingContact = $this->resolveBillingContactForClaim($row, $unitBillingFromDb, $claimer);
        $effectiveBillingId = $billingContact['id'] ?? $billingId;

        $residentRows = DB::table('unit_residents as ur')
            ->join('users', 'users.id', '=', 'ur.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('ur.unit_id', $unitId)
            ->whereIn('ur.status', [
                UnitAssignmentService::RESIDENT_ACTIVE,
                UnitAssignmentService::RESIDENT_PENDING,
            ])
            ->orderBy('ur.status')
            ->orderBy('users.name')
            ->select('ur.user_id', 'ur.status', 'ur.joined_at', 'users.email', 'users.name', 'profiles.display_name')
            ->get();

        $residents = $residentRows->map(fn ($r) => [
            'id' => (int) $r->user_id,
            'name' => $r->display_name ?: $r->name,
            'email' => $r->email,
            'status' => (string) $r->status,
            'joined_at' => $r->joined_at,
            'is_billing_contact' => $effectiveBillingId === (int) $r->user_id,
            'is_claimant' => (int) $r->user_id === (int) $row->user_id,
        ])->values()->all();

        $activeCount = $residentRows->where('status', UnitAssignmentService::RESIDENT_ACTIVE)->count();
        $pendingCount = $residentRows->where('status', UnitAssignmentService::RESIDENT_PENDING)->count();

        return response()->json([
            'data' => [
                'id' => (int) $row->id,
                'unit_id' => $unitId,
                'user_id' => (int) $row->user_id,
                'community_id' => (int) $row->community_id,
                'occupancy' => (string) $row->occupancy,
                'status' => (string) $row->status,
                'source' => $row->source,
                'proof_url' => $proof,
                'rejection_reason' => $row->rejection_reason,
                'reviewed_by_name' => $reviewerName,
                'reviewed_at' => $row->reviewed_at,
                'created_at' => $row->created_at,
                'unit_number' => (string) $row->unit_number,
                'email' => $claimer->email ?? null,
                'phone' => $claimer->phone ?? null,
                'display_name' => $claimer->display_name ?? $claimer->name ?? null,
                'claimant' => [
                    'display_name' => $claimer->display_name ?? $claimer->name ?? null,
                    'email' => $claimer->email ?? null,
                    'phone' => $claimer->phone ?? null,
                ],
                'unit' => [
                    'id' => $unitId,
                    'unit_number' => (string) $row->unit_number,
                    'kind' => $unitRow->kind ?? 'residential',
                    'billing_contact' => $billingContact,
                    'resident_counts' => [
                        'active' => $activeCount,
                        'pending' => $pendingCount,
                        'total' => count($residents),
                    ],
                    'residents' => $residents,
                ],
            ],
        ]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $claim = $this->findClaim($request, $id);
        $this->ownerships->approve($id, (int) $request->user()->id);
        if (in_array($claim->occupancy, [UnitOwnershipOccupancy::RENTED, UnitOwnershipOccupancy::VACANT], true)) {
            $this->ownerships->setLandlordEnabled((int) $claim->user_id, (int) $claim->community_id, true);
        }

        if ($claim->occupancy === UnitOwnershipOccupancy::LIVE_HERE) {
            $hasResidency = DB::table('unit_residents')
                ->where('unit_id', $claim->unit_id)
                ->where('user_id', $claim->user_id)
                ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
                ->exists();

            if (! $hasResidency) {
                $this->units->assignUserToUnitNumber(
                    (int) $claim->community_id,
                    (int) $claim->user_id,
                    (string) $claim->unit_number,
                    false,
                    false,
                    UnitAssignmentService::RESIDENT_PENDING,
                    'landlord_ownership',
                );
            }

            $this->ownerships->setPrimaryResidence(
                (int) $claim->user_id,
                (int) $claim->community_id,
                (int) $claim->unit_id,
            );
        }

        return response()->json(['message' => 'Ownership approved.', 'data' => ['id' => $id]]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $this->findClaim($request, $id);

        $data = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        DB::table('unit_ownerships')->where('id', $id)->update([
            'status' => UnitOwnershipStatus::REJECTED,
            'rejection_reason' => $data['reason'] ?? null,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Ownership rejected.', 'data' => ['id' => $id]]);
    }

    private function communityScope(Request $request): int
    {
        if (AdminRoleService::isSystemAdmin($request->user())) {
            $scope = AdminRoleService::resolveAdminCommunityScope($request->user(), $request);

            return $scope ? (int) $scope : 0;
        }

        return AdminRoleService::requireManagedCommunityId($request->user(), $request);
    }

    private function findClaim(Request $request, int $id): object
    {
        $communityId = $this->communityScope($request);

        $row = DB::table('unit_ownerships as o')
            ->join('units', 'units.id', '=', 'o.unit_id')
            ->where('o.id', $id)
            ->where('o.community_id', $communityId)
            ->select('o.*', 'units.unit_number')
            ->first();

        if (! $row) {
            abort(404, 'Ownership claim not found.');
        }

        return $row;
    }

    /**
     * @param  ?array{id: int, name: string, email: ?string}  $fromUnit
     * @return ?array{id: int, name: string, email: ?string, is_claimant: bool}
     */
    private function resolveBillingContactForClaim(object $row, ?array $fromUnit, ?object $claimer = null): ?array
    {
        if ((string) $row->occupancy === UnitOwnershipOccupancy::VACANT) {
            $name = $claimer
                ? ($claimer->display_name ?? $claimer->name ?? null)
                : ($row->display_name ?? $row->name ?? null);
            $email = $claimer->email ?? $row->email ?? null;

            return [
                'id' => (int) $row->user_id,
                'name' => (string) ($name ?? 'Landlord'),
                'email' => $email,
                'is_claimant' => true,
            ];
        }

        if ($fromUnit) {
            $fromUnit['is_claimant'] = (int) $fromUnit['id'] === (int) $row->user_id;

            return $fromUnit;
        }

        return null;
    }

    private function resolveMediaUrl(string $url): string
    {
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return url($url);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>  $claims
     * @return array<int, array{billing_contact: ?array{id: int, name: string, email: ?string}, resident_counts: array{active: int, pending: int, total: int}}>
     */
    private function unitContextForClaims($claims): array
    {
        if ($claims->isEmpty()) {
            return [];
        }

        $unitIds = $claims->pluck('unit_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

        $activeStatus = UnitAssignmentService::RESIDENT_ACTIVE;
        $pendingStatus = UnitAssignmentService::RESIDENT_PENDING;

        $countsByUnit = [];
        foreach ($unitIds as $unitId) {
            $countsByUnit[$unitId] = ['active' => 0, 'pending' => 0, 'total' => 0];
        }

        if (Schema::hasTable('unit_residents')) {
            $countRows = DB::table('unit_residents')
                ->whereIn('unit_id', $unitIds)
                ->whereIn('status', [$activeStatus, $pendingStatus])
                ->select('unit_id', 'status', DB::raw('count(*) as aggregate'))
                ->groupBy('unit_id', 'status')
                ->get();

            foreach ($countRows as $countRow) {
                $uid = (int) $countRow->unit_id;
                $n = (int) $countRow->aggregate;
                if ((string) $countRow->status === $activeStatus) {
                    $countsByUnit[$uid]['active'] = $n;
                } elseif ((string) $countRow->status === $pendingStatus) {
                    $countsByUnit[$uid]['pending'] = $n;
                }
                $countsByUnit[$uid]['total'] += $n;
            }
        }

        $billingIds = $claims
            ->map(fn ($row) => (int) ($row->billing_contact_user_id ?? 0))
            ->filter(fn (int $id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        $billingUsersById = collect();
        if ($billingIds !== []) {
            $billingUsersById = DB::table('users as u')
                ->leftJoin('profiles', 'profiles.user_id', '=', 'u.id')
                ->whereIn('u.id', $billingIds)
                ->select('u.id', 'u.email', 'u.name', 'profiles.display_name')
                ->get()
                ->keyBy('id');
        }

        $out = [];
        foreach ($claims as $row) {
            $unitId = (int) $row->unit_id;
            if (isset($out[$unitId])) {
                continue;
            }

            $billingId = (int) ($row->billing_contact_user_id ?? 0);
            $billingContact = null;
            if ($billingId > 0 && $billingUsersById->has($billingId)) {
                $billingUser = $billingUsersById->get($billingId);
                $billingContact = [
                    'id' => $billingId,
                    'name' => (string) ($billingUser->display_name ?: $billingUser->name),
                    'email' => $billingUser->email,
                ];
            }

            $out[$unitId] = [
                'billing_contact' => $billingContact,
                'resident_counts' => $countsByUnit[$unitId] ?? ['active' => 0, 'pending' => 0, 'total' => 0],
            ];
        }

        return $out;
    }
}