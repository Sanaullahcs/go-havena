<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DealController extends Controller
{
    use BlocksGuestReads;
    private const TYPES = ['deal', 'offer', 'coupon'];

    /** GET /v1/deals — browse active deals, or manage own/all with scope=manage */
    public function index(Request $request)
    {
        $this->assertGuestCanRead($request, 'marketplace');
        $user        = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $scope       = $request->get('scope', 'browse');
        $isAdmin     = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, $communityId);

        $query = DB::table('deals')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at');

        if ($scope === 'manage') {
            if (! $isAdmin) {
                $query->where('created_by', $user->id);
            }
            if ($request->filled('status') && $request->status !== 'all') {
                $query->where('status', $request->status);
            }
        } else {
            $query->where('status', 'active');

            if (! $request->boolean('include_expired')) {
                $query->where(function ($q) {
                    $q->whereNull('ends_at')->orWhere('ends_at', '>=', now());
                });
            }

            $query->where(function ($q) {
                    $q->whereExists(function ($sub) {
                        $sub->select(DB::raw(1))
                            ->from('businesses')
                            ->whereColumn('businesses.id', 'deals.business_id')
                            ->where('businesses.status', 'approved')
                            ->whereNull('businesses.deleted_at');
                    })->orWhere(function ($ownerDeals) {
                        $ownerDeals->whereNull('business_id')
                            ->whereExists(function ($sub) {
                                $sub->select(DB::raw(1))
                                    ->from('businesses')
                                    ->whereColumn('businesses.owner_id', 'deals.created_by')
                                    ->whereColumn('businesses.community_id', 'deals.community_id')
                                    ->where('businesses.status', 'approved')
                                    ->whereNull('businesses.deleted_at');
                            });
                    });
                });
        }

        if ($request->filled('type') && $request->type !== 'all') {
            $query->where('type', $request->type);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('title', 'like', "%{$s}%")
                  ->orWhere('vendor', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%");
            });
        }

        if ($request->filled('business_id')) {
            $businessId = (int) $request->business_id;
            $business = DB::table('businesses')
                ->where('id', $businessId)
                ->where('community_id', $communityId)
                ->whereNull('deleted_at')
                ->first();

            if ($business) {
                $query->where(function ($q) use ($businessId, $business) {
                    $q->where('business_id', $businessId)
                        ->orWhere(function ($ownerDeals) use ($business) {
                            $ownerDeals->where('created_by', $business->owner_id)
                                ->whereNull('business_id');
                        });
                });
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        $deals = $query->orderByDesc('is_featured')
                       ->orderByDesc('created_at')
                       ->paginate(min((int) ($request->per_page ?? 20), 100));

        $meta = [
            'current_page' => $deals->currentPage(),
            'last_page'    => $deals->lastPage(),
            'total'        => $deals->total(),
            'per_page'     => $deals->perPage(),
        ];

        if ($scope === 'manage') {
            $statsQuery = DB::table('deals')
                ->where('community_id', $communityId)
                ->whereNull('deleted_at');
            if (! $isAdmin) {
                $statsQuery->where('created_by', $user->id);
            }
            $meta['stats'] = [
                'total'    => (clone $statsQuery)->count(),
                'active'   => (clone $statsQuery)->where('status', 'active')->count(),
                'inactive' => (clone $statsQuery)->where('status', 'inactive')->count(),
                'expired'  => (clone $statsQuery)->where('status', 'expired')->count(),
            ];
        }

        $savedIds = $user
            ? DB::table('deal_saves')->where('user_id', $user->id)->pluck('deal_id')->map(fn ($id) => (int) $id)->all()
            : [];

        return response()->json([
            'data' => collect($deals->items())
                ->map(fn ($d) => $this->format($d, $request, in_array((int) $d->id, $savedIds, true)))
                ->values(),
            'meta' => $meta,
        ]);
    }

    /** GET /v1/deals/{id} */
    public function show(int $id, Request $request)
    {
        $deal = DB::table('deals')->where('id', $id)->whereNull('deleted_at')->first();

        if (! $deal) {
            return response()->json(['message' => 'Deal not found'], 404);
        }

        $isAdmin = AdminRoleService::isSystemAdmin(auth()->user())
            || AdminRoleService::canManageCommunity(auth()->user(), (int) $deal->community_id);
        $isOwner = auth()->user() && (int) $deal->created_by === (int) auth()->id();

        if ($deal->status !== 'active' && ! $isAdmin && ! $isOwner) {
            return response()->json(['message' => 'Deal not found'], 404);
        }

        $isLiked = auth()->id()
            ? DB::table('deal_saves')
                ->where('user_id', auth()->id())
                ->where('deal_id', $id)
                ->exists()
            : false;

        return response()->json(['data' => $this->format($deal, $request, $isLiked)]);
    }

    /** POST /v1/deals/{id}/save — toggle favorite/heart for the current user */
    public function toggleSave(int $id)
    {
        $userId = auth()->id();
        $deal = DB::table('deals')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $deal) {
            return response()->json(['message' => 'Deal not found'], 404);
        }

        $this->assertDealCommunityAccess(auth()->user(), (int) $deal->community_id);

        $exists = DB::table('deal_saves')
            ->where('user_id', $userId)
            ->where('deal_id', $id)
            ->exists();

        if ($exists) {
            DB::table('deal_saves')->where('user_id', $userId)->where('deal_id', $id)->delete();

            return response()->json(['data' => ['saved' => false, 'liked' => false], 'message' => 'Deal unsaved']);
        }

        DB::table('deal_saves')->insert([
            'user_id'    => $userId,
            'deal_id'    => $id,
            'created_at' => now(),
        ]);

        return response()->json(['data' => ['saved' => true, 'liked' => true], 'message' => 'Deal saved']);
    }

    /** POST /v1/deals — residents and admins create deals they own */
    public function residentStore(Request $request)
    {
        $validated   = $this->validatePayload($request, true);
        $user        = auth()->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = AdminRoleService::isSystemAdmin($user)
            || AdminRoleService::canManageCommunity($user, $communityId);

        // Residents can only post deals if they have an approved business
        $ownerBusiness = null;
        if (! $isAdmin) {
            $ownerBusiness = DB::table('businesses')
                ->where('community_id', $communityId)
                ->where('owner_id', $user->id)
                ->whereNull('deleted_at')
                ->first();

            if (! $ownerBusiness) {
                return response()->json([
                    'message' => 'You must register a business before creating a deal.',
                    'error'   => 'no_business',
                ], 422);
            }

            if ($ownerBusiness->status === 'rejected') {
                return response()->json([
                    'message' => 'Your business has been rejected. You cannot create deals until it is approved.',
                    'error'   => 'business_rejected',
                ], 422);
            }

            if ($ownerBusiness->status === 'inactive') {
                return response()->json([
                    'message' => 'Your business is inactive. You cannot create deals until it is active again.',
                    'error'   => 'business_inactive',
                ], 422);
            }
        }

        $businessId = $validated['business_id'] ?? ($ownerBusiness->id ?? null);

        $id = DB::table('deals')->insertGetId([
            'community_id'     => $communityId,
            'created_by'       => $user->id,
            'business_id'      => $businessId,
            'title'            => $validated['title'],
            'vendor'           => $validated['vendor'] ?? null,
            'description'      => $validated['description'],
            'type'             => $validated['type'] ?? 'deal',
            'discount_label'   => $validated['discount_label'] ?? null,
            'original_price'   => $validated['original_price'] ?? null,
            'discounted_price' => $validated['discounted_price'] ?? null,
            'promo_code'       => $validated['promo_code'] ?? null,
            'category'         => $validated['category'] ?? null,
            'location'         => $validated['location'] ?? null,
            'image_url'        => MediaUrl::normalize($validated['image_url'] ?? null),
            'is_featured'      => $isAdmin && (bool) ($validated['is_featured'] ?? false),
            'status'           => 'active',
            'starts_at'        => $validated['starts_at'] ?? null,
            'ends_at'          => $validated['ends_at'] ?? null,
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        ActivityLogService::user(
            'deal_created',
            "Created deal: \"{$validated['title']}\"",
            'Deal',
            $id,
            'info',
            null,
            ['status' => 'active', 'related_item' => $validated['title']],
        );

        $deal = DB::table('deals')->where('id', $id)->first();

        return response()->json(['data' => $this->format($deal, $request), 'message' => 'Deal published'], 201);
    }

    /** PATCH /v1/deals/{id} — owner or community admin */
    public function residentUpdate(int $id, Request $request)
    {
        $deal = $this->assertCanManageDealAsOwner($id);

        $validated = $this->validatePayload($request, false);

        $data = array_filter([
            'title'            => $validated['title'] ?? null,
            'vendor'           => $validated['vendor'] ?? null,
            'description'      => $validated['description'] ?? null,
            'type'             => $validated['type'] ?? null,
            'discount_label'   => $validated['discount_label'] ?? null,
            'original_price'   => $validated['original_price'] ?? null,
            'discounted_price' => $validated['discounted_price'] ?? null,
            'promo_code'       => $validated['promo_code'] ?? null,
            'category'         => $validated['category'] ?? null,
            'location'         => $validated['location'] ?? null,
            'status'           => $validated['status'] ?? null,
            'starts_at'        => $validated['starts_at'] ?? null,
            'ends_at'          => $validated['ends_at'] ?? null,
            'business_id'      => $validated['business_id'] ?? null,
        ], fn ($v) => $v !== null);

        if (array_key_exists('image_url', $validated)) {
            $data['image_url'] = MediaUrl::normalize($validated['image_url']);
        }

        $data['updated_at'] = now();

        DB::table('deals')->where('id', $id)->update($data);

        $fresh = DB::table('deals')->where('id', $id)->first();

        ActivityLogService::user(
            'deal_updated',
            "Updated deal: \"{$deal->title}\"",
            'Deal',
            $id,
            'info',
            null,
            [
                'status' => $fresh->status ?? null,
                'related_item' => $fresh->title ?? $deal->title,
            ],
        );

        return response()->json(['data' => $this->format($fresh, $request), 'message' => 'Deal updated']);
    }

    /** DELETE /v1/deals/{id} — owner or community admin */
    public function residentDestroy(int $id)
    {
        $deal = $this->assertCanManageDealAsOwner($id);

        DB::table('deals')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        ActivityLogService::user(
            'deal_deleted',
            "Deleted deal: \"{$deal->title}\"",
            'Deal',
            $id,
            'info',
            null,
            ['related_item' => $deal->title],
        );

        return response()->json(['message' => 'Deal deleted']);
    }

    /** POST /v1/deals/upload-image */
    public function residentUploadImage(Request $request)
    {
        $request->validate(['image' => 'required|image|max:5120']);

        $relative = $this->storeImage($request->file('image'));

        return response()->json([
            'data'    => ['image_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Image uploaded',
        ]);
    }

    /** GET /v1/admin/deals */
    public function adminIndex(Request $request)
    {
        $this->ensureCanManageContent();

        $scopeId = AdminRoleService::resolveAdminCommunityScope(auth()->user(), $request);

        $query = DB::table('deals')->whereNull('deleted_at');
        if ($scopeId !== null) {
            $query->where('community_id', $scopeId);
        } elseif ($request->filled('community_id') && $request->community_id !== 'all') {
            $query->where('community_id', (int) $request->community_id);
        }

        if ($request->filled('type') && $request->type !== 'all') {
            $query->where('type', $request->type);
        }
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('title', 'like', "%{$s}%")
                  ->orWhere('vendor', 'like', "%{$s}%")
                  ->orWhere('description', 'like', "%{$s}%");
            });
        }

        $deals = $query->orderByDesc('created_at')
                       ->paginate(min((int) ($request->per_page ?? 20), 100));

        $statsQuery = DB::table('deals')->whereNull('deleted_at');
        if ($scopeId !== null) {
            $statsQuery->where('community_id', $scopeId);
        } elseif ($request->filled('community_id') && $request->community_id !== 'all') {
            $statsQuery->where('community_id', (int) $request->community_id);
        }

        $stats = [
            'total'    => (clone $statsQuery)->count(),
            'active'   => (clone $statsQuery)->where('status', 'active')->count(),
            'inactive' => (clone $statsQuery)->where('status', 'inactive')->count(),
            'expired'  => (clone $statsQuery)->where(function ($q) {
                $q->where('status', 'expired')
                  ->orWhere(fn ($x) => $x->whereNotNull('ends_at')->where('ends_at', '<', now()));
            })->count(),
            'featured' => (clone $statsQuery)->where('is_featured', true)->count(),
        ];

        return response()->json([
            'data' => collect($deals->items())->map(fn ($d) => $this->format($d, $request))->values(),
            'meta' => [
                'current_page' => $deals->currentPage(),
                'last_page'    => $deals->lastPage(),
                'total'        => $deals->total(),
                'per_page'     => $deals->perPage(),
                'stats'        => $stats,
            ],
        ]);
    }

    /** POST /v1/admin/deals */
    public function store(Request $request)
    {
        $this->ensureCanManageContent();

        $validated = $this->validatePayload($request, true);
        $communityId = $this->resolveManagedCommunityId($request);

        $id = DB::table('deals')->insertGetId([
            'community_id'     => $communityId,
            'created_by'       => auth()->id(),
            'business_id'      => $validated['business_id'] ?? null,
            'title'            => $validated['title'],
            'vendor'           => $validated['vendor'] ?? null,
            'description'      => $validated['description'],
            'type'             => $validated['type'] ?? 'deal',
            'discount_label'   => $validated['discount_label'] ?? null,
            'original_price'   => $validated['original_price'] ?? null,
            'discounted_price' => $validated['discounted_price'] ?? null,
            'promo_code'       => $validated['promo_code'] ?? null,
            'category'         => $validated['category'] ?? null,
            'location'         => $validated['location'] ?? null,
            'image_url'        => MediaUrl::normalize($validated['image_url'] ?? null),
            'is_featured'      => (bool) ($validated['is_featured'] ?? false),
            'status'           => $validated['status'] ?? 'active',
            'starts_at'        => $validated['starts_at'] ?? null,
            'ends_at'          => $validated['ends_at'] ?? null,
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        ActivityLogService::user('deal_created', "Created deal: \"{$validated['title']}\"", 'Deal', $id);

        $deal = DB::table('deals')->where('id', $id)->first();

        return response()->json(['data' => $this->format($deal, $request), 'message' => 'Deal published'], 201);
    }

    /** PATCH /v1/admin/deals/{id} */
    public function update(int $id, Request $request)
    {
        $deal = $this->assertCanManageDeal($id);

        $validated = $this->validatePayload($request, false);

        $data = array_filter([
            'title'            => $validated['title'] ?? null,
            'vendor'           => $validated['vendor'] ?? null,
            'description'      => $validated['description'] ?? null,
            'type'             => $validated['type'] ?? null,
            'discount_label'   => $validated['discount_label'] ?? null,
            'original_price'   => $validated['original_price'] ?? null,
            'discounted_price' => $validated['discounted_price'] ?? null,
            'promo_code'       => $validated['promo_code'] ?? null,
            'category'         => $validated['category'] ?? null,
            'location'         => $validated['location'] ?? null,
            'status'           => $validated['status'] ?? null,
            'starts_at'        => $validated['starts_at'] ?? null,
            'ends_at'          => $validated['ends_at'] ?? null,
        ], fn ($v) => $v !== null);

        if (array_key_exists('image_url', $validated)) {
            $data['image_url'] = MediaUrl::normalize($validated['image_url']);
        }
        if (array_key_exists('is_featured', $validated)) {
            $data['is_featured'] = (bool) $validated['is_featured'];
        }

        $data['updated_at'] = now();

        DB::table('deals')->where('id', $id)->update($data);

        $fresh = DB::table('deals')->where('id', $id)->first();

        return response()->json(['data' => $this->format($fresh, $request), 'message' => 'Deal updated']);
    }

    /** DELETE /v1/admin/deals/{id} */
    public function destroy(int $id)
    {
        $this->assertCanManageDeal($id);

        DB::table('deals')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Deal deleted']);
    }

    /** POST /v1/admin/deals/upload-image */
    public function uploadImage(Request $request)
    {
        $this->ensureCanManageContent();

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
            'title'            => "{$req}|string|max:200",
            'description'      => "{$req}|string",
            'vendor'           => 'nullable|string|max:160',
            'type'             => 'nullable|in:deal,offer,coupon',
            'discount_label'   => "{$req}|string|max:60",
            'original_price'   => 'nullable|numeric|min:0',
            'discounted_price' => 'nullable|numeric|min:0',
            'promo_code'       => 'nullable|string|max:60',
            'category'         => "{$req}|string|max:60",
            'location'         => 'nullable|string|max:160',
            'image_url'        => "{$req}|string|max:512",
            'is_featured'      => 'nullable|boolean',
            'status'           => 'nullable|in:active,inactive,expired',
            'starts_at'        => 'nullable|date',
            'ends_at'          => 'nullable|date',
            'community_id'     => 'nullable|integer|exists:communities,id',
            'business_id'      => 'nullable|integer|exists:businesses,id',
        ]);
    }

    private function assertCanManageDealAsOwner(int $id): object
    {
        $deal = DB::table('deals')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $deal) {
            abort(404, 'Deal not found');
        }

        $user = auth()->user();
        if (
            (int) $deal->created_by !== (int) $user->id
            && ! AdminRoleService::isSystemAdmin($user)
            && ! AdminRoleService::canManageCommunity($user, (int) $deal->community_id)
        ) {
            abort(403, 'You cannot manage this deal.');
        }

        return $deal;
    }

    private function format(object $deal, Request $request, bool $isLiked = false): array
    {
        $expired = $deal->ends_at ? now()->greaterThan($deal->ends_at) : false;

        return [
            'id'               => (int) $deal->id,
            'community_id'     => (int) $deal->community_id,
            'created_by'       => (int) $deal->created_by,
            'business_id'      => isset($deal->business_id) ? (int) $deal->business_id : null,
            'title'            => $deal->title,
            'title_es'         => $deal->title_es ?? null,
            'title_ar'         => $deal->title_ar ?? null,
            'vendor'           => $deal->vendor,
            'description'      => $deal->description,
            'description_es'   => $deal->description_es ?? null,
            'description_ar'   => $deal->description_ar ?? null,
            'type'             => $deal->type,
            'discount_label'   => $deal->discount_label,
            'discount_label_es' => $deal->discount_label_es ?? null,
            'discount_label_ar' => $deal->discount_label_ar ?? null,
            'original_price'   => $deal->original_price !== null ? (float) $deal->original_price : null,
            'discounted_price' => $deal->discounted_price !== null ? (float) $deal->discounted_price : null,
            'promo_code'       => $deal->promo_code,
            'category'         => $deal->category,
            'location'         => $deal->location,
            'image_url'        => MediaUrl::toPublic($deal->image_url ?? null, $request),
            'is_featured'      => (bool) $deal->is_featured,
            'is_liked'         => $isLiked,
            'is_saved'         => $isLiked,
            'status'           => $expired ? 'expired' : $deal->status,
            'is_expired'       => $expired,
            'starts_at'        => $deal->starts_at,
            'ends_at'          => $deal->ends_at,
            'created_at'       => $deal->created_at,
            'updated_at'       => $deal->updated_at,
        ];
    }

    private function assertDealCommunityAccess($user, int $communityId): void
    {
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        $approved = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();

        if (! $approved) {
            abort(403, 'You do not have access to this community.');
        }
    }

    private function ensureCanManageContent(): void
    {
        $user = auth()->user();
        if (! AdminRoleService::isSystemAdmin($user) && ! AdminRoleService::isActiveCommunityAdmin($user)) {
            abort(403, 'Admin access required');
        }
    }

    private function assertCanManageDeal(int $id): object
    {
        $deal = DB::table('deals')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $deal) {
            abort(404, 'Deal not found');
        }

        $user = auth()->user();
        if (
            ! AdminRoleService::isSystemAdmin($user)
            && ! AdminRoleService::canManageCommunity($user, (int) $deal->community_id)
        ) {
            abort(403, 'You cannot manage deals for this community.');
        }

        return $deal;
    }

    private function resolveManagedCommunityId(Request $request): int
    {
        $scoped = AdminRoleService::resolveAdminCommunityScope(auth()->user(), $request);
        if ($scoped !== null) {
            return $scoped;
        }

        if ($request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $header = $request->header('X-Community-Id');
        if ($header) {
            return (int) $header;
        }

        abort(422, 'A community must be selected to publish this deal.');
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

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('deals', 'public');

        return Storage::url($path);
    }
}
