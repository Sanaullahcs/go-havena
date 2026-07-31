<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegionController extends Controller
{
    /** GET /v1/regions — public list for mobile onboarding (regions + approved communities) */
    public function index(Request $request): JsonResponse
    {
        $q = $request->string('q')->trim()->toString();

        $regionQuery = Region::query()->where('status', 'active');

        if ($q !== '') {
            $regionQuery->where(function ($builder) use ($q) {
                $builder->where('title', 'like', '%'.$q.'%')
                    ->orWhere('area', 'like', '%'.$q.'%')
                    ->orWhere('state', 'like', '%'.$q.'%');
            });
        }

        $regions = $regionQuery->orderBy('sort_order')->orderBy('title')->get()
            ->map(fn (Region $region) => $this->transform($region));

        $communityQuery = Community::query()
            ->with('regionRecord')
            ->withCount(['memberships as members_count' => fn ($m) => $m->where('status', 'approved')])
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            });

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
        $query = Region::query();

        if ($status = $request->string('status')->trim()->toString()) {
            if (in_array($status, ['active', 'inactive'], true)) {
                $query->where('status', $status);
            }
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('title', 'like', '%'.$q.'%')
                    ->orWhere('area', 'like', '%'.$q.'%')
                    ->orWhere('state', 'like', '%'.$q.'%');
            });
        }

        $regions = $query->orderBy('sort_order')->orderBy('title')->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => collect($regions->items())->map(fn (Region $region) => $this->transform($region)),
            'meta' => [
                'current_page' => $regions->currentPage(),
                'last_page' => $regions->lastPage(),
                'total' => $regions->total(),
                'per_page' => $regions->perPage(),
            ],
        ]);
    }

    /** POST /v1/admin/regions */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'min:2', 'max:150'],
            'area' => ['required', 'string', 'min:2', 'max:150'],
            'state' => ['nullable', 'string', 'max:80'],
            'users_label' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        $region = Region::query()->create([
            'title' => $validated['title'],
            'area' => $validated['area'],
            'state' => $validated['state'] ?? null,
            'users_label' => $validated['users_label'] ?? '0 users',
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
        ]);

        return response()->json(['data' => $this->transform($region), 'message' => 'Region created'], 201);
    }

    /** PUT /v1/admin/regions/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $region = Region::query()->findOrFail($id);

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'min:2', 'max:150'],
            'area' => ['sometimes', 'string', 'min:2', 'max:150'],
            'state' => ['nullable', 'string', 'max:80'],
            'users_label' => ['nullable', 'string', 'max:50'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        $region->update($validated);

        return response()->json(['data' => $this->transform($region->fresh()), 'message' => 'Region updated']);
    }

    /** DELETE /v1/admin/regions/{id} */
    public function destroy(int $id): JsonResponse
    {
        $region = Region::query()->findOrFail($id);
        $region->delete();

        return response()->json(['message' => 'Region deleted']);
    }

    private function transform(Region $region): array
    {
        return [
            'type' => 'region',
            'id' => $region->id,
            'title' => $region->title,
            'area' => $region->area,
            'state' => $region->state,
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

        return [
            'type' => 'community',
            'id' => $community->id,
            'title' => $community->name,
            'area' => $community->address ?? $community->description ?? '',
            'state' => $community->regionRecord?->state,
            'region_id' => $community->region_id,
            'region_title' => $regionTitle,
            'users_label' => $memberCount === 1 ? '1 member' : "{$memberCount} members",
            'users' => $memberCount === 1 ? '1 member' : "{$memberCount} members",
            'address' => $community->address,
        ];
    }
}
