<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\Region;
use App\Models\State;
use App\Services\ActivityLogService;
use App\Services\LocationCatalog;
use App\Support\RegionHierarchy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RegionController extends Controller
{
    /** GET /v1/regions — public list for mobile onboarding (regions + approved communities) */
    public function index(Request $request): JsonResponse
    {
        $q = $request->string('q')->trim()->toString();
        $countryId = $request->integer('country_id') ?: null;
        $stateId = $request->integer('state_id') ?: null;
        $city = $request->string('city')->trim()->toString();

        $regionQuery = Region::query()
            ->with('stateRecord.country')
            ->where('regions.status', 'active')
            ->whereRaw(
                'LOWER(TRIM(regions.state)) = LOWER(TRIM((SELECT states.name FROM states WHERE states.id = regions.state_id LIMIT 1)))'
            );

        if ($stateId) {
            $regionQuery->where('state_id', $stateId);
        } elseif ($countryId) {
            $regionQuery->whereHas('stateRecord', fn ($builder) => $builder->where('country_id', $countryId));
        }

        if ($city !== '') {
            $regionQuery->cityLevel()
                ->whereRaw('LOWER(TRIM(regions.area)) = ?', [mb_strtolower($city)]);
        }

        if ($q !== '') {
            $regionQuery->where(function ($builder) use ($q) {
                $builder->where('title', 'like', '%'.$q.'%')
                    ->orWhere('area', 'like', '%'.$q.'%')
                    ->orWhere('state', 'like', '%'.$q.'%')
                    ->orWhereHas('stateRecord', fn ($state) => $state
                        ->where('name', 'like', '%'.$q.'%')
                        ->orWhereHas('country', fn ($country) => $country->where('name', 'like', '%'.$q.'%')));
            });
        }

        $regions = $regionQuery->orderBy('sort_order')->orderBy('title')->get()
            ->map(fn (Region $region) => $this->transform($region));

        $communityQuery = Community::query()
            ->with('regionRecord.stateRecord.country')
            ->withCount(['memberships as members_count' => fn ($m) => $m->where('status', 'approved')])
            ->where('status', 'active')
            ->whereHas('regionRecord', fn ($region) => $region->where('status', 'active'))
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            });

        if ($stateId) {
            $communityQuery->whereHas('regionRecord', fn ($builder) => $builder->where('state_id', $stateId));
        } elseif ($countryId) {
            $communityQuery->whereHas('regionRecord.stateRecord', fn ($builder) => $builder->where('country_id', $countryId));
        }

        if ($city !== '') {
            $normalizedCity = mb_strtolower($city);
            $communityQuery->whereHas('regionRecord', fn ($builder) => $builder
                ->whereRaw('LOWER(TRIM(area)) = ?', [$normalizedCity]));
        }

        if ($q !== '') {
            $communityQuery->where(function ($builder) use ($q) {
                $builder->where('name', 'like', '%'.$q.'%')
                    ->orWhere('address', 'like', '%'.$q.'%')
                    ->orWhere('region', 'like', '%'.$q.'%');
            });
        }

        $communities = $communityQuery->orderBy('name')->get()
            ->map(fn (Community $community) => $this->transformCommunity($community));

        $items = $regions->concat($communities)->sortBy('title', SORT_NATURAL | SORT_FLAG_CASE)->values();

        return response()->json([
            'data' => $items,
        ]);
    }

    /** GET /v1/admin/regions */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = Region::query()->with('stateRecord.country');
        $this->applyAdminRegionFilters($query, $request, includeStatus: true);

        $statsQuery = Region::query();
        $this->applyAdminRegionFilters($statsQuery, $request, includeStatus: false);

        $regions = $query->orderBy('sort_order')->orderBy('title')->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => collect($regions->items())->map(fn (Region $region) => $this->transform($region)),
            'meta' => [
                'current_page' => $regions->currentPage(),
                'last_page' => $regions->lastPage(),
                'total' => $regions->total(),
                'per_page' => $regions->perPage(),
                'stats' => [
                    'total' => (clone $statsQuery)->count(),
                    'active' => (clone $statsQuery)->where('regions.status', 'active')->count(),
                    'inactive' => (clone $statsQuery)->where('regions.status', 'inactive')->count(),
                ],
            ],
        ]);
    }

    /** POST /v1/admin/regions */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'min:2', 'max:150'],
            'area' => ['required', 'string', 'min:2', 'max:150'],
            'state_id' => ['required', 'integer', Rule::exists('states', 'id')->where('status', 'active')],
            'state' => ['nullable', 'string', 'max:80'],
            'users_label' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        $state = State::query()->findOrFail($validated['state_id']);
        $catalog = app(LocationCatalog::class);
        $area = trim($validated['area']);

        if (mb_strtolower($area) === mb_strtolower($state->name)) {
            $region = $catalog->ensureStateRegion($state);
        } else {
            if ($catalog->findCityRegion($state, $area)) {
                throw ValidationException::withMessages([
                    'area' => ['A region already exists for this city in the selected state.'],
                ]);
            }

            $region = $catalog->ensureCityRegion($state, $area);
        }

        if (isset($validated['users_label'])) {
            $region->update(['users_label' => $validated['users_label']]);
        }
        if (isset($validated['sort_order'])) {
            $region->update(['sort_order' => (int) $validated['sort_order']]);
        }
        if (isset($validated['status'])) {
            $region->update(['status' => $validated['status']]);
        }

        $region->load('stateRecord.country');

        return response()->json(['data' => $this->transform($region->fresh(['stateRecord.country'])), 'message' => 'Region created'], 201);
    }

    /** PUT /v1/admin/regions/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $region = Region::query()->findOrFail($id);

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'min:2', 'max:150'],
            'area' => ['sometimes', 'string', 'min:2', 'max:150'],
            'state_id' => ['sometimes', 'integer', Rule::exists('states', 'id')->where('status', 'active')],
            'state' => ['nullable', 'string', 'max:80'],
            'users_label' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        if (isset($validated['state_id'])) {
            $state = State::query()->findOrFail($validated['state_id']);
            $validated['state'] = $validated['state'] ?? $state->name;
        }

        $nextStateId = (int) ($validated['state_id'] ?? $region->state_id);
        $nextArea = trim((string) ($validated['area'] ?? $region->area));
        if ($nextStateId && $nextArea !== '') {
            $state = State::query()->findOrFail($nextStateId);
            $catalog = app(LocationCatalog::class);
            $duplicate = mb_strtolower($nextArea) === mb_strtolower($state->name)
                ? $catalog->findStateRegion($state)
                : $catalog->findCityRegion($state, $nextArea);

            if ($duplicate && (int) $duplicate->id !== (int) $region->id) {
                throw ValidationException::withMessages([
                    'area' => ['A region already exists for this city in the selected state.'],
                ]);
            }
        }

        $fields = ['title', 'area', 'state', 'state_id', 'users_label', 'sort_order', 'status'];
        $before = ActivityLogService::snapshot($region, $fields);
        $region->update($validated);
        $fresh = $region->fresh(['stateRecord.country']);
        ActivityLogService::recordUpdate(
            'region_updated',
            'Region',
            $region->id,
            $before,
            ActivityLogService::snapshot($fresh, $fields),
            [],
            null,
            null,
            ['related_item' => $fresh->title],
        );

        return response()->json(['data' => $this->transform($fresh), 'message' => 'Region updated']);
    }

    /** DELETE /v1/admin/regions/{id} */
    public function destroy(int $id): JsonResponse
    {
        $region = Region::query()->findOrFail($id);
        $region->delete();

        return response()->json(['message' => 'Region deleted']);
    }

    private function applyAdminRegionFilters($query, Request $request, bool $includeStatus): void
    {
        if ($includeStatus) {
            $status = $request->string('status')->trim()->toString();
            if (in_array($status, ['active', 'inactive'], true)) {
                $query->where('regions.status', $status);
            }
        }

        if ($countryId = $request->integer('country_id')) {
            $query->whereHas('stateRecord', fn ($builder) => $builder->where('country_id', $countryId));
        }

        if ($stateId = $request->integer('state_id')) {
            $query->where('state_id', $stateId);
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('title', 'like', '%'.$q.'%')
                    ->orWhere('area', 'like', '%'.$q.'%')
                    ->orWhere('state', 'like', '%'.$q.'%')
                    ->orWhereHas('stateRecord', fn ($state) => $state
                        ->where('name', 'like', '%'.$q.'%')
                        ->orWhereHas('country', fn ($country) => $country->where('name', 'like', '%'.$q.'%')));
            });
        }

        if ($request->boolean('city_level')) {
            $query->cityLevel();
            $query->whereRaw(
                'LOWER(TRIM(regions.state)) = LOWER(TRIM((SELECT states.name FROM states WHERE states.id = regions.state_id LIMIT 1)))'
            );
        }
    }

    private function transform(Region $region): array
    {
        $region->loadMissing('stateRecord.country');
        $state = $region->stateRecord;
        $country = $state?->country;

        $cityLevel = RegionHierarchy::isCityLevelRegion($region);

        return [
            'type' => 'region',
            'id' => $region->id,
            'title' => $region->title,
            'hierarchy_label' => RegionHierarchy::hierarchyLabel($region),
            'is_city_level' => $cityLevel,
            'level' => $cityLevel ? 'city' : 'state',
            'area' => $region->area,
            'state' => $state?->code ?: ($state?->name ?? $region->state),
            'state_id' => $region->state_id,
            'state_name' => $state?->name ?? $region->state,
            'state_code' => $state?->code,
            'country_id' => $country?->id,
            'country_code' => $country?->code,
            'country_name' => $country?->name,
            'billing_policy' => $country?->billing_policy,
            'billing_exempt' => $country?->isBillingExempt() ?? false,
            'users_label' => $region->users_label,
            'users' => $region->users_label,
            'sort_order' => $region->sort_order,
            'status' => $region->status,
            'created_at' => $region->created_at?->toIso8601String(),
            'updated_at' => $region->updated_at?->toIso8601String(),
        ];
    }

    private function transformCommunity(Community $community): array
    {
        $memberCount = (int) ($community->members_count ?? 0);
        $regionTitle = $community->regionRecord?->title ?? $community->region;
        $state = $community->regionRecord?->stateRecord;
        $country = $state?->country;

        return [
            'type' => 'community',
            'id' => $community->id,
            'title' => $community->name,
            'area' => $community->address ?? $community->description ?? '',
            'state' => $state?->code ?: ($state?->name ?? $community->regionRecord?->state),
            'state_id' => $community->regionRecord?->state_id,
            'state_name' => $state?->name ?? $community->regionRecord?->state,
            'state_code' => $state?->code,
            'country_id' => $country?->id,
            'country_code' => $country?->code,
            'country_name' => $country?->name,
            'billing_exempt' => $country?->isBillingExempt() ?? false,
            'region_id' => $community->region_id,
            'region_title' => $regionTitle,
            'users_label' => $memberCount === 1 ? '1 member' : "{$memberCount} members",
            'users' => $memberCount === 1 ? '1 member' : "{$memberCount} members",
            'address' => $community->address,
        ];
    }
}
