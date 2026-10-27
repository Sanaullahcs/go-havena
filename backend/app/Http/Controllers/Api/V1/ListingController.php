<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Concerns\BlocksGuestWrites;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\NotificationService;
use App\Services\UserBlockService;
use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ListingController extends Controller
{
    use BlocksGuestReads;
    use BlocksGuestWrites;
    private const MAX_LISTING_IMAGES = 6;

    private const LISTING_CONDITIONS = ['Like New', 'Good', 'Fair', 'For Parts'];

    /** GET /v1/listings */
    public function index(Request $request)
    {
        $this->assertGuestCanRead($request, 'marketplace');
        $user = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, $communityId);

        $query = DB::table('listings')
            ->join('users', 'users.id', '=', 'listings.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'listings.user_id')
            ->select(
                'listings.*',
                'users.name as seller_name', 'users.email as seller_email',
                'profiles.unit_number as seller_unit', 'profiles.avatar_url as seller_avatar'
            )
            ->where('listings.community_id', $communityId)
            ->whereNull('listings.deleted_at');

        $mineOnly = $request->boolean('mine') && $user;

        if ($mineOnly) {
            $query->where('listings.user_id', $user->id);
        } elseif (! $isAdmin) {
            $query->where('listings.status', 'approved');
        } elseif ($request->filled('status') && $request->status !== 'all') {
            $query->where('listings.status', $request->status);
        }

        if ($request->filled('type') && $request->type !== 'all') {
            $query->where('listings.type', $request->type);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('listings.title', 'like', "%{$s}%")
                  ->orWhere('listings.description', 'like', "%{$s}%")
                  ->orWhere('users.name', 'like', "%{$s}%");
            });
        }

        $listings = $query->orderBy('listings.created_at', 'desc')
                          ->paginate($request->per_page ?? 12);

        // Add saved status for current user
        $savedIds = [];
        if ($user) {
            $savedIds = DB::table('listing_saves')->where('user_id', $user->id)->pluck('listing_id')->toArray();
        }

        $rawItems = collect($listings->items());
        $sellerUnitsMap = app(\App\Services\UnitAssignmentService::class)->unitsBriefMapForUsers(
            (int) $communityId,
            $rawItems->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
        );

        $items = $rawItems->map(function ($l) use ($savedIds, $request, $sellerUnitsMap) {
            $l->is_saved = in_array($l->id, $savedIds);
            $l->images   = $this->formatImages($l->images, $request);
            $unitNumbers = array_values(array_map(
                static fn (array $u) => (string) $u['unit_number'],
                $sellerUnitsMap[(int) $l->user_id] ?? [],
            ));
            if ($unitNumbers === [] && ! empty($l->seller_unit)) {
                $unitNumbers = [(string) $l->seller_unit];
            }
            $l->seller_unit = $unitNumbers[0] ?? $l->seller_unit;
            $l->seller_units = $unitNumbers;

            return $l;
        });

        $meta = [
            'current_page' => $listings->currentPage(),
            'last_page'    => $listings->lastPage(),
            'total'        => $listings->total(),
            'per_page'     => $listings->perPage(),
        ];

        if ($user) {
            $meta['my_count'] = (int) DB::table('listings')
                ->where('community_id', $communityId)
                ->where('user_id', $user->id)
                ->whereNull('deleted_at')
                ->count();
        }

        if ($isAdmin) {
            $statsQuery = DB::table('listings')
                ->where('community_id', $communityId)
                ->whereNull('deleted_at');
            $meta['stats'] = [
                'total'    => (clone $statsQuery)->count(),
                'pending'  => (clone $statsQuery)->where('status', 'pending')->count(),
                'active'   => (clone $statsQuery)->where('status', 'approved')->count(),
                'rejected' => (clone $statsQuery)->where('status', 'rejected')->count(),
                'sold'     => (clone $statsQuery)->where('status', 'sold')->count(),
            ];
        }

        return response()->json(['data' => $items, 'meta' => $meta]);
    }

    /** GET /v1/listings/{id} */
    public function show(int $id, Request $request)
    {
        $user = auth()->user();

        $listing = DB::table('listings')
            ->join('users', 'users.id', '=', 'listings.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'listings.user_id')
            ->select(
                'listings.*',
                'users.name as seller_name', 'users.email as seller_email',
                'users.role as seller_account_role',
                'profiles.unit_number as seller_unit', 'profiles.avatar_url as seller_avatar'
            )
            ->where('listings.id', $id)
            ->whereNull('listings.deleted_at')
            ->first();

        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        $isOwner = $user && (int) $listing->user_id === (int) $user->id;
        $isAdmin = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, (int) $listing->community_id);

        if ($listing->status !== 'approved' && ! $isAdmin && ! $isOwner) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        if ($user && ! $isOwner && ! $isAdmin) {
            $this->assertListingCommunityAccess($user, (int) $listing->community_id);
        } elseif ($user && $isAdmin && ! AdminRoleService::isSystemAdmin($user)) {
            if (! AdminRoleService::canManageCommunity($user, (int) $listing->community_id) && ! $isOwner) {
                return response()->json(['message' => 'Listing not found'], 404);
            }
        }

        $listing->images   = $this->formatImages($listing->images, $request);
        $listing->is_saved = $user
            ? DB::table('listing_saves')->where('user_id', $user->id)->where('listing_id', $id)->exists()
            : false;

        $listing->seller_listings_count = (int) DB::table('listings')
            ->where('user_id', $listing->user_id)
            ->where('community_id', $listing->community_id)
            ->whereNull('deleted_at')
            ->count();
        $listing->seller_member_since = DB::table('users')
            ->where('id', $listing->user_id)
            ->value('created_at');
        $listing->save_count = (int) DB::table('listing_saves')
            ->where('listing_id', $id)
            ->count();
        $listing->can_report = $user && ! $isOwner
            ? UserBlockService::canBlock((int) $user->id, (int) $listing->user_id, (int) $listing->community_id)
            : false;

        $sellerUnitNumbers = array_values(array_map(
            static fn (array $u) => (string) $u['unit_number'],
            app(\App\Services\UnitAssignmentService::class)->unitsBriefMapForUsers(
                (int) $listing->community_id,
                [(int) $listing->user_id],
            )[(int) $listing->user_id] ?? [],
        ));
        if ($sellerUnitNumbers === [] && ! empty($listing->seller_unit)) {
            $sellerUnitNumbers = [(string) $listing->seller_unit];
        }
        $listing->seller_unit = $sellerUnitNumbers[0] ?? $listing->seller_unit;
        $listing->seller_units = $sellerUnitNumbers;

        return response()->json(['data' => $listing]);
    }

    /** POST /v1/listings */
    public function store(Request $request)
    {
        $this->assertNotGuestWrite($request, 'create_listing');

        $request->validate([
            'type'        => 'required|in:for_sale,service,deal,item',
            'title'       => 'required|string|max:200',
            'price'       => 'required|numeric|min:0',
            'description' => 'required|string',
            'category'    => 'required|string|max:60',
            'condition'   => ['nullable', 'string', Rule::in(self::LISTING_CONDITIONS)],
            'location'    => 'nullable|string|max:160',
            'images'      => 'nullable|array|max:'.self::MAX_LISTING_IMAGES,
            'images.*'    => 'string|max:500',
            'community_id'=> 'nullable|integer|exists:communities,id',
        ]);

        $type = $request->type === 'item' ? 'for_sale' : $request->type;
        $user = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $images = $this->normalizeImageUrls($request->input('images', []));
        if (count($images) > self::MAX_LISTING_IMAGES) {
            return response()->json([
                'message' => 'A listing can include at most '.self::MAX_LISTING_IMAGES.' photos.',
            ], 422);
        }

        if ($type === 'for_sale' && ! $request->filled('condition')) {
            return response()->json(['message' => 'Condition is required for item listings.'], 422);
        }

        // Admins publishing to a community they manage skip the review queue.
        $autoApprove = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, $communityId);

        $id = DB::table('listings')->insertGetId([
            'community_id' => $communityId,
            'user_id'      => auth()->id(),
            'type'         => $type,
            'category'     => $request->category,
            'condition'    => $request->input('condition'),
            'title'        => $request->title,
            'price'        => $request->price,
            'description'  => $request->description,
            'location'     => $request->location,
            'images'       => json_encode($images),
            'status'       => $autoApprove ? 'approved' : 'pending',
            'approved_by'  => $autoApprove ? auth()->id() : null,
            'approved_at'  => $autoApprove ? now() : null,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        ActivityLogService::user(
            'listing_created',
            "Created marketplace listing: \"{$request->title}\"",
            'Listing',
            $id,
            'info',
            null,
            [
                'status' => $autoApprove ? 'approved' : 'pending',
                'related_item' => $request->title,
            ],
        );

        return response()->json([
            'data'    => ['id' => $id, 'status' => $autoApprove ? 'approved' : 'pending'],
            'message' => $autoApprove ? 'Listing published' : 'Listing submitted for review',
        ], 201);
    }

    /** POST /v1/listings/upload-image */
    public function uploadImage(Request $request)
    {
        $request->validate(['image' => 'required|image|max:5120']);

        $relative = $this->storeImage($request->file('image'));

        return response()->json([
            'data'    => ['image_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Image uploaded',
        ]);
    }

    /** PATCH /v1/listings/{id} */
    public function update(int $id, Request $request)
    {
        $listing = DB::table('listings')
            ->where('id', $id)
            ->where('user_id', auth()->id())
            ->whereNull('deleted_at')
            ->first();
        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        if ($listing->status === 'sold') {
            return response()->json(['message' => 'Sold listings cannot be edited.'], 422);
        }

        $request->validate([
            'title'       => 'sometimes|required|string|max:200',
            'price'       => 'sometimes|required|numeric|min:0',
            'description' => 'sometimes|required|string',
            'category'    => 'sometimes|required|string|max:60',
            'condition'   => ['nullable', 'string', Rule::in(self::LISTING_CONDITIONS)],
            'location'    => 'nullable|string|max:160',
        ]);

        $payload = array_filter([
            'title'       => $request->title,
            'price'       => $request->price,
            'description' => $request->description,
            'category'    => $request->category,
            'condition'   => $request->has('condition') ? $request->input('condition') : null,
            'location'    => $request->location,
            'updated_at'  => now(),
        ], fn ($v) => $v !== null);

        if ($request->has('images')) {
            $request->validate([
                'images'   => 'array|max:'.self::MAX_LISTING_IMAGES,
                'images.*' => 'string|max:500',
            ]);
            $images = $this->normalizeImageUrls($request->input('images', []));
            if (count($images) > self::MAX_LISTING_IMAGES) {
                return response()->json([
                    'message' => 'A listing can include at most '.self::MAX_LISTING_IMAGES.' photos.',
                ], 422);
            }
            $payload['images'] = json_encode($images);
        }

        $user = auth()->user();
        $autoApprove = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, (int) $listing->community_id);

        if ($autoApprove) {
            $payload['status']      = 'approved';
            $payload['approved_by'] = auth()->id();
            $payload['approved_at'] = now();
        } else {
            $payload['status']      = 'pending';
            $payload['approved_by'] = null;
            $payload['approved_at'] = null;
        }

        $fields = ['title', 'price', 'description', 'category', 'condition', 'location', 'images', 'status'];
        $before = ActivityLogService::snapshot($listing, $fields);

        DB::table('listings')->where('id', $id)->update($payload);

        $status = $autoApprove ? 'approved' : 'pending';
        $fresh = DB::table('listings')->where('id', $id)->first();

        ActivityLogService::recordUpdate(
            'listing_updated',
            'Listing',
            $id,
            $before,
            ActivityLogService::snapshot($fresh, $fields),
            [],
            null,
            (int) $listing->user_id,
            [
                'status' => $status,
                'related_item' => $request->input('title', $listing->title),
            ],
        );

        return response()->json([
            'data'    => ['id' => $id, 'status' => $status],
            'message' => $autoApprove
                ? 'Listing updated and published'
                : 'Listing updated and submitted for review',
        ]);
    }

    /** PATCH /v1/listings/{id}/mark-sold */
    public function markSold(int $id)
    {
        $listing = DB::table('listings')
            ->where('id', $id)
            ->where('user_id', auth()->id())
            ->whereNull('deleted_at')
            ->first();

        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        if ($listing->status !== 'approved') {
            return response()->json(['message' => 'Only approved listings can be marked as sold.'], 422);
        }

        DB::table('listings')->where('id', $id)->update([
            'status'     => 'sold',
            'updated_at' => now(),
        ]);

        ActivityLogService::recordStatusChange(
            'listing_sold',
            'Listing',
            $id,
            $listing->status,
            'sold',
            'Status',
            null,
            (int) $listing->user_id,
            ['related_item' => $listing->title],
        );

        return response()->json([
            'data'    => ['id' => $id, 'status' => 'sold'],
            'message' => 'Listing marked as sold',
        ]);
    }

    /** DELETE /v1/listings/{id} */
    public function destroy(int $id)
    {
        $listing = DB::table('listings')
            ->where('id', $id)
            ->where('user_id', auth()->id())
            ->whereNull('deleted_at')
            ->first();

        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        DB::table('listings')->where('id', $id)->update(['deleted_at' => now()]);

        ActivityLogService::user(
            'listing_deleted',
            "Deleted marketplace listing: \"{$listing->title}\"",
            'Listing',
            $id,
            'info',
            null,
            ['related_item' => $listing->title],
        );

        return response()->json(['message' => 'Listing deleted']);
    }

    /** PATCH /v1/admin/listings/{id}/approve */
    public function approve(int $id)
    {
        $this->assertCanManageListing($id);

        $listing = DB::table('listings')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        $wasRejected = ($listing->status ?? '') === 'rejected';

        DB::table('listings')->where('id', $id)->update([
            'status'      => 'approved',
            'approved_by' => auth()->id(),
            'approved_at' => now(),
            'updated_at'  => now(),
        ]);

        $listing = DB::table('listings')->find($id);
        ActivityLogService::recordStatusChange(
            $wasRejected ? 'listing_reapproved' : 'listing_approved',
            'Listing',
            $id,
            $wasRejected ? 'rejected' : 'pending',
            'approved',
            'Status',
            null,
            (int) $listing->user_id,
            ['related_item' => $listing->title],
        );
        if ((int) $listing->user_id !== (int) auth()->id()) {
        NotificationService::send(
            $listing->user_id,
            'success',
            $wasRejected ? 'Listing re-approved' : 'Listing approved',
            "Your listing \"{$listing->title}\" is now live in the marketplace.",
            '/screens/listing-detail?id='.$id,
        );
        }

        return response()->json([
            'message' => $wasRejected ? 'Listing re-approved' : 'Listing approved',
        ]);
    }

    /** PATCH /v1/admin/listings/{id}/reject */
    public function reject(int $id, Request $request)
    {
        $this->assertCanManageListing($id);

        $listing = DB::table('listings')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        $wasLive = ($listing->status ?? '') === 'approved';
        $previousStatus = $listing->status ?? 'pending';

        DB::table('listings')->where('id', $id)->update([
            'status'      => 'rejected',
            'approved_by' => null,
            'approved_at' => null,
            'updated_at'  => now(),
        ]);

        $listing = DB::table('listings')->find($id);
        ActivityLogService::recordStatusChange(
            'listing_rejected',
            'Listing',
            $id,
            $previousStatus,
            'rejected',
            'Status',
            null,
            (int) $listing->user_id,
            ['related_item' => $listing->title],
            'warning',
        );
        if ((int) $listing->user_id !== (int) auth()->id()) {
        NotificationService::send(
            $listing->user_id,
            'warning',
            $wasLive ? 'Listing removed' : 'Listing rejected',
            $wasLive
                ? "Your listing \"{$listing->title}\" was removed from the marketplace by a community administrator."
                : "Your listing \"{$listing->title}\" was not approved. Please review our marketplace guidelines.",
            '/screens/listing-detail?id='.$id,
        );
        }

        return response()->json([
            'message' => $wasLive ? 'Listing removed from marketplace' : 'Listing rejected',
        ]);
    }

    /** POST /v1/listings/{id}/save */
    public function toggleSave(int $id)
    {
        $userId = auth()->id();
        $listing = DB::table('listings')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $listing) {
            return response()->json(['message' => 'Listing not found'], 404);
        }

        $this->assertListingCommunityAccess(auth()->user(), (int) $listing->community_id);

        $exists = DB::table('listing_saves')
            ->where('user_id', $userId)
            ->where('listing_id', $id)
            ->exists();

        if ($exists) {
            DB::table('listing_saves')->where('user_id', $userId)->where('listing_id', $id)->delete();

            return response()->json(['data' => ['saved' => false], 'message' => 'Listing unsaved']);
        }

        DB::table('listing_saves')->insert([
            'user_id'    => $userId,
            'listing_id' => $id,
            'created_at' => now(),
        ]);

        return response()->json(['data' => ['saved' => true], 'message' => 'Listing saved']);
    }

    private function assertListingCommunityAccess($user, int $communityId): void
    {
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        if (AdminRoleService::canManageCommunity($user, $communityId)) {
            return;
        }

        $approved = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();

        if (! $approved) {
            abort(404, 'Listing not found');
        }
    }

    private function isAdmin($user): bool
    {
        if (! $user) {
            return false;
        }

        if (AdminRoleService::isSystemAdmin($user) || AdminRoleService::isActiveCommunityAdmin($user)) {
            return true;
        }

        $m = DB::table('community_memberships')->where('user_id', $user->id)->first();

        return $m && in_array($m->role, ['admin', 'moderator'], true);
    }

    private function assertCanManageListing(int $id): object
    {
        $listing = DB::table('listings')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $listing) {
            abort(404, 'Listing not found');
        }

        $user = auth()->user();
        if (
            ! AdminRoleService::isSystemAdmin($user)
            && ! AdminRoleService::canManageCommunity($user, (int) $listing->community_id)
        ) {
            abort(403, 'You cannot manage listings for this community.');
        }

        return $listing;
    }

    private function resolveCommunityId(Request $request, $user): int
    {
        if ($user && ($this->isAdmin($user) || AdminRoleService::isSystemAdmin($user))) {
            $scoped = AdminRoleService::resolveAdminCommunityScope($user, $request);
            if ($scoped !== null) {
                return $scoped;
            }
        }

        if ($request->filled('community_id')) {
            $id = (int) $request->community_id;
            if ($user) {
                $approved = DB::table('community_memberships')
                    ->where('user_id', $user->id)
                    ->where('community_id', $id)
                    ->where('status', 'approved')
                    ->exists();
                if ($approved) {
                    return $id;
                }
                abort(403, 'You are not a member of this community.');
            }

            return $id;
        }

        $header = $request->header('X-Community-Id');
        if ($header) {
            $id = (int) $header;
            if ($user) {
                $approved = DB::table('community_memberships')
                    ->where('user_id', $user->id)
                    ->where('community_id', $id)
                    ->where('status', 'approved')
                    ->exists();
                if ($approved) {
                    return $id;
                }
                abort(403, 'You are not a member of this community.');
            }

            return $id;
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

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('listings', 'public');

        return Storage::url($path);
    }

    private function normalizeImageUrls(array $urls): array
    {
        return collect($urls)
            ->filter(fn ($url) => is_string($url) && trim($url) !== '')
            ->map(fn ($url) => MediaUrl::normalize($url))
            ->filter()
            ->values()
            ->all();
    }

    private function formatImages(?string $json, Request $request): array
    {
        $raw = $json ? json_decode($json, true) : [];
        if (! is_array($raw)) {
            return [];
        }

        return collect($raw)
            ->filter(fn ($url) => is_string($url) && $url !== '')
            ->map(fn ($url) => MediaUrl::toPublic($url, $request))
            ->filter()
            ->values()
            ->all();
    }
}
