<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\AdminRoleService;
use App\Services\CommunityDirectoryService;
use App\Services\OsmGeocodingService;
use App\Services\OsmNearbyPlacesService;
use App\Services\UserActingContextService;
use App\Support\NearbyDiscovery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CommunityDirectoryController extends Controller
{
    public function __construct(private readonly CommunityDirectoryService $directory) {}

    /** GET /v1/essentials */
    public function essentials(Request $request, OsmNearbyPlacesService $places, OsmGeocodingService $geocoder): JsonResponse
    {
        $validated = $request->validate([
            'radius_meters' => ['nullable', 'integer', 'min:500', 'max:'.OsmNearbyPlacesService::maxRadiusMeters()],
            'include_places' => ['sometimes', 'boolean'],
        ]);
        $radius = OsmNearbyPlacesService::normalizeRadiusMeters($validated['radius_meters'] ?? null);
        $includePlaces = $request->boolean('include_places', true);
        if (function_exists('set_time_limit')) {
            set_time_limit(60);
        }

        $communityId = $this->residentCommunityId($request);
        $coords = NearbyDiscovery::resolveCommunityCoordinates($communityId, $geocoder);
        $entries = $this->directory->entries($communityId, null, $coords[0] ?? null, $coords[1] ?? null);
        $sections = $this->directory->essentialSections($entries);
        unset($includePlaces, $places);

        return response()->json([
            'data' => [
                'sections' => $sections,
                'suggestions' => $this->directory->suggestionsForUser($communityId, (int) $request->user()->id),
                'categories' => $this->directory->listingCategories($communityId),
            ],
            'meta' => [
                'community_id' => $communityId,
                'has_coordinates' => $coords !== null,
                'radius_meters' => $radius,
                'latitude' => $coords[0] ?? null,
                'longitude' => $coords[1] ?? null,
            ],
        ]);
    }

    /** POST /v1/nearby-places/suggestions */
    public function storeSuggestion(Request $request): JsonResponse
    {
        $communityId = $this->residentCommunityId($request);
        $validated = $request->validate([
            'kind' => ['required', Rule::in(['suggest', 'report'])],
            'place_id' => ['nullable', 'string', 'max:80'],
            'name' => ['nullable', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'max:80'],
            'essential_section' => ['nullable', 'string', 'max:80'],
            'new_category' => ['nullable', 'string', 'max:80'],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'phone' => ['nullable', 'string', 'max:40'],
            'note' => ['nullable', 'string', 'max:1000'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $section = $this->directory->normalizeSection((string) (
            $validated['essential_section']
            ?? $validated['new_category']
            ?? $validated['category']
            ?? ''
        ));
        if ($validated['kind'] === 'suggest' && trim((string) ($validated['name'] ?? '')) === '') {
            return response()->json(['message' => 'Enter the place name.'], 422);
        }
        if ($validated['kind'] === 'suggest' && $section === '') {
            return response()->json(['message' => 'Category is required.'], 422);
        }
        if ($validated['kind'] === 'suggest' && trim((string) ($validated['phone'] ?? '')) === '') {
            return response()->json(['message' => 'Phone number is required.'], 422);
        }
        if ($validated['kind'] === 'suggest' && trim((string) ($validated['address'] ?? '')) === '') {
            return response()->json(['message' => 'Address is required.'], 422);
        }
        if ($validated['kind'] === 'suggest' && (! isset($validated['latitude'], $validated['longitude']))) {
            return response()->json(['message' => 'Choose an address from the suggestions.'], 422);
        }
        if ($validated['kind'] === 'report' && trim((string) ($validated['note'] ?? '')) === '' && trim((string) ($validated['place_id'] ?? '')) === '') {
            return response()->json(['message' => 'Describe what needs to be corrected.'], 422);
        }

        $id = DB::table('nearby_place_suggestions')->insertGetId([
            'community_id' => $communityId,
            'user_id' => (int) $request->user()->id,
            'kind' => $validated['kind'],
            'place_id' => $validated['place_id'] ?? null,
            'name' => isset($validated['name']) ? trim((string) $validated['name']) : null,
            'category' => $section !== '' ? $section : ($validated['category'] ?? null),
            'essential_section' => $section !== '' ? $section : null,
            'publish_nearby' => false,
            'publish_essentials' => $validated['kind'] === 'suggest',
            'address' => $validated['address'] ?? null,
            'latitude' => $validated['latitude'] ?? null,
            'longitude' => $validated['longitude'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'note' => $validated['note'] ?? null,
            'description' => $validated['description'] ?? null,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $label = trim((string) ($validated['name'] ?? 'A nearby place'));
        $this->directory->notifyAdminsOfSuggestion(
            $communityId,
            $validated['kind'] === 'report' ? 'Place correction submitted' : 'New place suggested',
            $label.' is waiting for review.',
        );

        $row = DB::table('nearby_place_suggestions')->where('id', $id)->first();

        return response()->json(['data' => [
            'id' => (int) $row->id,
            'status' => 'pending',
            'kind' => $row->kind,
            'name' => $row->name,
            'category' => $row->category,
        ]], 201);
    }

    /** GET /v1/nearby-places/suggestions */
    public function mySuggestions(Request $request): JsonResponse
    {
        $communityId = $this->residentCommunityId($request);

        return response()->json([
            'data' => $this->directory->suggestionsForUser($communityId, (int) $request->user()->id),
        ]);
    }

    /** GET /v1/admin/essentials */
    public function adminIndex(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);

        return response()->json([
            'data' => [
                'entries' => $this->directory->entries($communityId),
                'suggestions' => $this->directory->suggestionsForCommunity($communityId, 'pending'),
                'categories' => $this->directory->listingCategories($communityId),
            ],
        ]);
    }

    /** POST /v1/admin/essentials */
    public function adminStore(Request $request): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $validated = $this->entryPayload($request);
        $id = DB::table('community_essential_entries')->insertGetId([
            ...$validated,
            'community_id' => $communityId,
            'verified' => (bool) ($validated['verified'] ?? false),
            'created_by' => (int) $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['data' => ['id' => $id]], 201);
    }

    /** PATCH /v1/admin/essentials/{id} */
    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $entry = $this->entryForCommunity($id, $communityId);
        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'max:160'],
            'body' => ['nullable', 'string', 'max:2000'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'verified' => ['sometimes', 'boolean'],
            'section' => ['sometimes', 'string', 'max:80'],
        ]);
        if (isset($validated['section'])) {
            $validated['section'] = $this->directory->normalizeSection((string) $validated['section']);
            if ($validated['section'] === '') {
                abort(422, 'Choose a category.');
            }
        }

        DB::table('community_essential_entries')->where('id', $entry->id)->update([
            ...$validated,
            'updated_at' => now(),
        ]);
        return response()->json(['data' => ['id' => (int) $entry->id]]);
    }

    /** DELETE /v1/admin/essentials/{id} */
    public function adminDestroy(Request $request, int $id): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $entry = $this->entryForCommunity($id, $communityId);
        if (! empty($entry->nearby_place_id)) {
            DB::table('community_nearby_places')
                ->where('id', $entry->nearby_place_id)
                ->where('community_id', $communityId)
                ->delete();
        }
        DB::table('community_essential_entries')->where('id', $entry->id)->delete();

        return response()->json(['data' => ['id' => (int) $entry->id]]);
    }

    /** POST /v1/admin/nearby-suggestions/{id}/approve */
    public function approveSuggestion(Request $request, int $id): JsonResponse
    {
        return $this->reviewSuggestion($request, $id, 'approved');
    }

    /** POST /v1/admin/nearby-suggestions/{id}/reject */
    public function rejectSuggestion(Request $request, int $id): JsonResponse
    {
        return $this->reviewSuggestion($request, $id, 'rejected');
    }

    private function reviewSuggestion(Request $request, int $id, string $status): JsonResponse
    {
        $communityId = AdminRoleService::requireManagedCommunityId($request->user(), $request);
        $note = $request->validate(['review_note' => ['nullable', 'string', 'max:500']])['review_note'] ?? null;
        $row = DB::table('nearby_place_suggestions')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $row || $row->status !== 'pending') {
            abort(404, 'Suggestion not found.');
        }

        DB::table('nearby_place_suggestions')->where('id', $row->id)->update([
            'status' => $status,
            'review_note' => $note,
            'reviewed_by' => (int) $request->user()->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);

        if ($status === 'approved') {
            $this->publishSuggestion($row);
        }

        $name = trim((string) ($row->name ?: 'Your place submission'));
        $this->directory->notifyResident(
            (int) $row->user_id,
            $communityId,
            $status === 'approved' ? 'Place submission approved' : 'Place submission rejected',
            $status === 'approved'
                ? $name.' is now visible in Discover.'
                : $name.' was not added.'.($note ? ' '.$note : ''),
        );

        return response()->json(['data' => ['id' => (int) $row->id, 'status' => $status]]);
    }

    private function publishSuggestion(object $row): void
    {
        if ($row->kind === 'report' && filled($row->place_id)) {
            DB::table('community_place_hides')->updateOrInsert(
                ['community_id' => $row->community_id, 'place_id' => $row->place_id],
                ['updated_at' => now(), 'created_at' => now()],
            );
        }

        if ($row->kind !== 'suggest') {
            return;
        }

        $name = trim((string) ($row->name ?? ''));
        $section = $this->directory->normalizeSection((string) ($row->essential_section ?: $row->category ?: ''));
        if ($name === '' || $section === '') {
            return;
        }

        DB::table('community_essential_entries')->insert([
            'community_id' => $row->community_id,
            'section' => $section,
            'title' => $name,
            'body' => $row->description ?? null,
            'description' => $row->description ?? null,
            'phone' => $row->phone,
            'address' => $row->address,
            'latitude' => $row->latitude ?? null,
            'longitude' => $row->longitude ?? null,
            'verified' => true,
            'created_by' => $row->user_id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array{section: string, title: string, body: ?string, phone: ?string, address: ?string, verified: bool} */
    private function entryPayload(Request $request): array
    {
        $validated = $request->validate([
            'section' => ['required', 'string', 'max:80'],
            'title' => ['required', 'string', 'max:160'],
            'body' => ['nullable', 'string', 'max:2000'],
            'description' => ['nullable', 'string', 'max:2000'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'verified' => ['sometimes', 'boolean'],
        ]);
        $validated['section'] = $this->directory->normalizeSection((string) $validated['section']);
        if ($validated['section'] === '') {
            abort(422, 'Choose a category.');
        }
        $validated['verified'] = (bool) ($validated['verified'] ?? true);
        if (! empty($validated['description']) && empty($validated['body'])) {
            $validated['body'] = $validated['description'];
        }

        return $validated;
    }

    private function entryForCommunity(int $id, int $communityId): object
    {
        $entry = DB::table('community_essential_entries')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $entry) {
            abort(404, 'Essential entry not found.');
        }

        return $entry;
    }

    private function residentCommunityId(Request $request): int
    {
        $user = $request->user();
        $requested = (int) ($request->input('community_id') ?: $request->header('X-Community-Id') ?: 0);
        if ($requested > 0 && $this->directory->userCanAccessCommunity($user, $requested)) {
            return $requested;
        }

        $current = UserActingContextService::currentCommunityId($user);
        if ($current) {
            return (int) $current;
        }

        abort(422, 'No community is assigned to your account.');
    }
}
