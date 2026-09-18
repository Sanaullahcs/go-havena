<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Concerns\BlocksGuestWrites;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Support\MediaUrl;
use App\Support\NearbyDiscovery;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class BusinessController extends Controller
{
    use BlocksGuestReads;
    use BlocksGuestWrites;
    /** GET /v1/businesses */
    public function index(Request $request)
    {
        $this->assertGuestCanRead($request, 'businesses');
        $user        = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = $this->canManageCommunity($user, $communityId);
        $scope       = $request->get('scope', 'browse');

        $radiusMiles = $scope === 'browse'
            ? NearbyDiscovery::normalizeRadius($request->get('radius_miles'))
            : null;
        $communityIds = $radiusMiles
            ? NearbyDiscovery::communityIdsWithin($communityId, $radiusMiles)
            : [$communityId];

        $query = DB::table('businesses as b')
            ->join('users', 'users.id', '=', 'b.owner_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'b.owner_id')
            ->leftJoin('communities', 'communities.id', '=', 'b.community_id')
            ->select($this->businessSelect())
            ->whereIn('b.community_id', $communityIds)
            ->whereNull('b.deleted_at');

        if ($scope === 'manage') {
            if ($isAdmin) {
                if ($request->filled('status') && $request->status !== 'all') {
                    $query->where('b.status', $request->status);
                }
            } else {
                $query->where('b.owner_id', $user->id);
                if ($request->filled('status') && $request->status !== 'all') {
                    $query->where('b.status', $request->status);
                }
            }
        } else {
            $query->where('b.status', 'approved');
        }

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('b.name', 'like', "%{$s}%")
                  ->orWhere('b.category', 'like', "%{$s}%")
                  ->orWhere('b.description', 'like', "%{$s}%");
            });
        }

        $rows = $query->orderByDesc('b.created_at')
                      ->paginate(min((int) ($request->per_page ?? 20), 100));

        $meta = [
            'current_page' => $rows->currentPage(),
            'last_page'    => $rows->lastPage(),
            'total'        => $rows->total(),
            'per_page'     => $rows->perPage(),
        ];

        if ($scope === 'manage') {
            $statsQuery = DB::table('businesses')
                ->where('community_id', $communityId)
                ->whereNull('deleted_at');
            if (! $isAdmin) {
                $statsQuery->where('owner_id', $user->id);
            }
            $meta['stats'] = [
                'total'    => (clone $statsQuery)->count(),
                'approved' => (clone $statsQuery)->where('status', 'approved')->count(),
                'pending'  => (clone $statsQuery)->where('status', 'pending')->count(),
                'rejected' => (clone $statsQuery)->where('status', 'rejected')->count(),
                'inactive' => (clone $statsQuery)->where('status', 'inactive')->count(),
            ];
        }

        return response()->json([
            'data' => collect($rows->items())->map(fn ($b) => $this->format($b, $request, $communityId))->values(),
            'meta' => $meta,
        ]);
    }

    /** GET /v1/businesses/{id} */
    public function show(int $id, Request $request)
    {
        $business = $this->findBusiness($id);
        if (! $business) {
            return response()->json(['message' => 'Business not found'], 404);
        }

        $user    = auth()->user();
        $isAdmin = $this->canManageCommunity($user, (int) $business->community_id);
        $isOwner = $user && (int) $business->owner_id === (int) $user->id;

        if ($business->status !== 'approved' && ! $isAdmin && ! $isOwner) {
            return response()->json(['message' => 'Business not found'], 404);
        }

        $originId = (int) ($request->header('X-Community-Id') ?: $request->get('community_id') ?: 0) ?: null;

        return response()->json(['data' => $this->format($business, $request, $originId)]);
    }

    /** POST /v1/businesses */
    public function store(Request $request)
    {
        $this->assertNotGuestWrite($request, 'create_business');

        $validated   = $this->validatePayload($request, true);
        $user        = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = $this->canManageCommunity($user, $communityId);

        // Each user may only have one business per community at a time
        $existing = DB::table('businesses')
            ->where('community_id', $communityId)
            ->where('owner_id', $user->id)
            ->whereNull('deleted_at')
            ->exists();

        if ($existing) {
            return response()->json([
                'message' => 'You already have a registered business. Please edit your existing business instead.',
                'error'   => 'one_business_per_user',
            ], 422);
        }

        $status = $isAdmin ? ($validated['status'] ?? 'approved') : 'pending';

        $insert = [
            'community_id' => $communityId,
            'owner_id'     => $user->id,
            'name'         => $validated['name'],
            'category'     => $validated['category'] ?? null,
            'description'  => $validated['description'] ?? null,
            'address'      => $validated['address'] ?? null,
            'phone'        => $validated['phone'] ?? null,
            'hours'        => $validated['hours'] ?? null,
            'amenities'    => $validated['amenities'] ?? null,
            'image_url'    => MediaUrl::normalize($validated['image_url'] ?? null),
            'status'       => $status,
            'approved_at'  => $status === 'approved' ? now() : null,
            'approved_by'  => $status === 'approved' ? $user->id : null,
            'created_at'   => now(),
            'updated_at'   => now(),
        ];
        $this->applyOptionalListingFields($insert, $validated);

        $id = DB::table('businesses')->insertGetId($insert);

        ActivityLogService::user('business_created', "Created business: \"{$validated['name']}\"", 'Business', $id);

        $business = $this->findBusiness($id);

        return response()->json([
            'data'    => $this->format($business, $request),
            'message' => $status === 'approved' ? 'Business published' : 'Business submitted for approval',
        ], 201);
    }

    /** PATCH /v1/businesses/{id} — business owner edits profile fields only */
    public function update(int $id, Request $request)
    {
        $business = $this->assertCanManageBusiness($id);
        $user       = auth()->user();
        $isOwner    = (int) $business->owner_id === (int) $user->id;

        if (! $isOwner) {
            abort(403, 'Only the business owner can edit this profile. Admins can approve, reject, re-approve, or delete.');
        }

        $validated = $this->validatePayload($request, false);

        $data = array_filter([
            'name'        => $validated['name'] ?? null,
            'category'    => $validated['category'] ?? null,
            'description' => $validated['description'] ?? null,
            'address'     => $validated['address'] ?? null,
            'phone'       => $validated['phone'] ?? null,
            'hours'       => $validated['hours'] ?? null,
            'amenities'   => $validated['amenities'] ?? null,
        ], fn ($v) => $v !== null);

        $this->applyOptionalListingFields($data, $validated);

        if (array_key_exists('image_url', $validated)) {
            $data['image_url'] = MediaUrl::normalize($validated['image_url']);
        }

        $data['updated_at'] = now();
        $fields = ['name', 'category', 'description', 'address', 'phone', 'hours', 'amenities', 'image_url'];
        $before = ActivityLogService::snapshot($business, $fields);

        DB::table('businesses')->where('id', $id)->update($data);

        $fresh = DB::table('businesses')->where('id', $id)->first();
        ActivityLogService::recordUpdate(
            'business_updated',
            'Business',
            $id,
            $before,
            ActivityLogService::snapshot($fresh, $fields),
            [],
            null,
            null,
            ['status' => $fresh->status ?? $business->status ?? null, 'related_item' => $fresh->name ?? $business->name],
        );

        return response()->json([
            'data'    => $this->format($this->findBusiness($id), $request),
            'message' => 'Business updated',
        ]);
    }

    /** DELETE /v1/businesses/{id} */
    public function destroy(int $id)
    {
        $business = $this->assertCanManageBusiness($id);

        DB::table('businesses')->where('id', $id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);

        ActivityLogService::user(
            'business_deleted',
            "Deleted business: \"{$business->name}\"",
            'Business',
            $id,
            'info',
            null,
            ['related_item' => $business->name],
        );

        return response()->json(['message' => 'Business deleted']);
    }

    /** PATCH /v1/admin/businesses/{id}/approve */
    public function approve(int $id, Request $request)
    {
        $business = $this->assertAdminCanManageBusiness($id);

        DB::table('businesses')->where('id', $id)->update([
            'status'      => 'approved',
            'approved_at' => now(),
            'approved_by' => auth()->id(),
            'updated_at'  => now(),
        ]);

        $dealsReactivated = $this->reactivateDealsForBusiness($business);

        ActivityLogService::recordStatusChange(
            'business_approved',
            'Business',
            $id,
            $business->status ?? 'pending',
            'approved',
            'Status',
            null,
            null,
            ['related_item' => $business->name],
        );

        return response()->json([
            'data'    => $this->format($this->findBusiness($id), $request),
            'message' => $business->status === 'rejected' ? 'Business re-approved' : 'Business approved',
            'meta'    => ['deals_reactivated' => $dealsReactivated],
        ]);
    }

    /** PATCH /v1/admin/businesses/{id}/reject */
    public function reject(int $id, Request $request)
    {
        $business = $this->assertAdminCanManageBusiness($id);

        DB::table('businesses')->where('id', $id)->update([
            'status'     => 'rejected',
            'updated_at' => now(),
        ]);

        $dealsDisabled = $this->disableDealsForBusiness($business);

        ActivityLogService::recordStatusChange(
            'business_rejected',
            'Business',
            $id,
            $business->status ?? 'pending',
            'rejected',
            'Status',
            null,
            null,
            ['related_item' => $business->name],
            'warning',
        );

        return response()->json([
            'data'    => $this->format($this->findBusiness($id), $request),
            'message' => 'Business rejected',
            'meta'    => ['deals_disabled' => $dealsDisabled],
        ]);
    }

    /** POST /v1/businesses/upload-image */
    public function uploadImage(Request $request)
    {
        $request->validate(['image' => 'required|image|max:5120']);

        $relative = $this->storeImage($request->file('image'));

        return response()->json([
            'data'    => ['image_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Image uploaded',
        ]);
    }

    /* ── Helpers ── */

    private function validatePayload(Request $request, bool $creating): array
    {
        $req = $creating ? 'required' : 'sometimes|required';

        return $request->validate([
            'name'         => "{$req}|string|max:200",
            'category'     => "{$req}|string|max:60",
            'description'  => "{$req}|string|max:2000",
            'address'      => "{$req}|string|max:255",
            'phone'        => "{$req}|string|max:40",
            'hours'        => "{$req}|string|max:120",
            'amenities'    => 'nullable|string|max:500',
            'website'      => 'nullable|string|max:512',
            'menu_items'   => 'nullable',
            'image_url'    => 'nullable|string|max:512',
            'status'       => 'nullable|in:pending,approved,rejected,inactive',
            'community_id' => 'nullable|integer|exists:communities,id',
        ]);
    }

    private function format(object $business, Request $request, ?int $originCommunityId = null): array
    {
        $ownerName = $business->owner_display_name ?? $business->owner_name ?? null;
        $bizCommunityId = (int) $business->community_id;
        $distanceMiles = $originCommunityId
            ? NearbyDiscovery::distanceFromOrigin($originCommunityId, $bizCommunityId)
            : null;

        return [
            'id'             => (int) $business->id,
            'community_id'   => $bizCommunityId,
            'community_name' => $business->community_name ?? null,
            'owner_id'       => (int) $business->owner_id,
            'owner_name'     => $ownerName,
            'name'           => $business->name,
            'category'       => $business->category,
            'description'    => $business->description,
            'address'        => $business->address,
            'phone'          => $business->phone,
            'hours'          => $business->hours,
            'amenities'      => $this->publicAmenities($business->amenities ?? null),
            'website'        => $this->publicWebsite($business),
            'menu_items'     => $this->publicMenuItems($business),
            'image_url'      => MediaUrl::toPublic($business->image_url ?? null, $request),
            'status'         => $business->status,
            'approved_at'    => $business->approved_at,
            'created_at'     => $business->created_at,
            'updated_at'     => $business->updated_at,
            'distance_miles' => $distanceMiles,
            'is_local'       => $originCommunityId ? $bizCommunityId === $originCommunityId : true,
            'latitude'       => isset($business->community_latitude) && $business->community_latitude !== null
                ? (float) $business->community_latitude
                : null,
            'longitude'      => isset($business->community_longitude) && $business->community_longitude !== null
                ? (float) $business->community_longitude
                : null,
        ];
    }

    private function applyOptionalListingFields(array &$data, array $validated): void
    {
        if (Schema::hasColumn('businesses', 'website') && array_key_exists('website', $validated)) {
            $website = trim((string) ($validated['website'] ?? ''));
            $data['website'] = $website !== '' ? $website : null;
        }

        if (Schema::hasColumn('businesses', 'menu_items') && array_key_exists('menu_items', $validated)) {
            $data['menu_items'] = $this->encodeMenuItems($validated['menu_items']);
        }
    }

    private function encodeMenuItems(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? json_encode($decoded) : $value;
        }
        if (is_array($value)) {
            return json_encode(array_values($value));
        }

        return null;
    }

    private function publicWebsite(object $business): ?string
    {
        $website = trim((string) ($business->website ?? ''));
        if ($website !== '') {
            return $website;
        }
        if (preg_match('/https?:\/\/[^\s,]+/i', (string) ($business->amenities ?? ''), $match)) {
            return rtrim($match[0], ')].,;');
        }

        return null;
    }

    private function publicAmenities(?string $amenities): ?string
    {
        if ($amenities === null || trim($amenities) === '') {
            return $amenities;
        }
        $cleaned = trim(preg_replace('/https?:\/\/[^\s,]+/i', '', $amenities) ?? '', " \t\n\r\0\x0B,");

        return $cleaned !== '' ? $cleaned : null;
    }

    private function publicMenuItems(object $business): array
    {
        $raw = $business->menu_items ?? null;
        if (is_array($raw)) {
            return $raw;
        }
        if (! is_string($raw) || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function businessSelect(): array
    {
        $select = [
            'b.*',
            'users.name as owner_name',
            'profiles.display_name as owner_display_name',
            'communities.name as community_name',
        ];

        if (Schema::hasColumn('communities', 'latitude')) {
            $select[] = 'communities.latitude as community_latitude';
            $select[] = 'communities.longitude as community_longitude';
        }

        return $select;
    }

    private function findBusiness(int $id): ?object
    {
        return DB::table('businesses as b')
            ->join('users', 'users.id', '=', 'b.owner_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'b.owner_id')
            ->leftJoin('communities', 'communities.id', '=', 'b.community_id')
            ->select($this->businessSelect())
            ->where('b.id', $id)
            ->whereNull('b.deleted_at')
            ->first();
    }

    private function assertCanManageBusiness(int $id): object
    {
        $business = DB::table('businesses')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $business) {
            abort(404, 'Business not found');
        }

        $user = auth()->user();
        if (
            (int) $business->owner_id !== (int) $user->id
            && ! $this->canManageCommunity($user, (int) $business->community_id)
        ) {
            abort(403, 'You cannot manage this business.');
        }

        return $business;
    }

    private function assertAdminCanManageBusiness(int $id): object
    {
        $business = DB::table('businesses')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $business) {
            abort(404, 'Business not found');
        }

        if (! $this->canManageCommunity(auth()->user(), (int) $business->community_id)) {
            abort(403, 'Admin access required');
        }

        return $business;
    }

    private function canManageCommunity($user, int $communityId): bool
    {
        return AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, $communityId);
    }

    private function resolveCommunityId(Request $request, $user): int
    {
        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $header = $request->header('X-Community-Id');
        if ($header) {
            return (int) $header;
        }

        if ($user) {
            $membership = DB::table('community_memberships')
                ->where('user_id', $user->id)
                ->where('status', 'approved')
                ->orderBy('id')
                ->first();

            if ($membership) {
                return (int) $membership->community_id;
            }
        }

        abort(422, 'No community is assigned to your account.');
    }

    /** Disable active deals when a business is rejected or deactivated. */
    private function disableDealsForBusiness(object $business): int
    {
        $now = now();

        $byBusiness = DB::table('deals')
            ->where('business_id', $business->id)
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->update(['status' => 'inactive', 'updated_at' => $now]);

        $byOwner = DB::table('deals')
            ->where('community_id', $business->community_id)
            ->where('created_by', $business->owner_id)
            ->whereNull('business_id')
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->update(['status' => 'inactive', 'updated_at' => $now]);

        return $byBusiness + $byOwner;
    }

    /** Re-enable eligible deals when a business is approved again. */
    private function reactivateDealsForBusiness(object $business): int
    {
        $now = now();

        return DB::table('deals')
            ->where(function ($query) use ($business) {
                $query->where('business_id', $business->id)
                    ->orWhere(function ($ownerDeals) use ($business) {
                        $ownerDeals->where('community_id', $business->community_id)
                            ->where('created_by', $business->owner_id)
                            ->whereNull('business_id');
                    });
            })
            ->where('status', 'inactive')
            ->whereNull('deleted_at')
            ->where(function ($query) use ($now) {
                $query->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', $now);
            })
            ->update(['status' => 'active', 'updated_at' => $now]);
    }

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('businesses', 'public');

        return Storage::url($path);
    }
}
