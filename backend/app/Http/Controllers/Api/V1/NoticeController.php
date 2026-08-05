<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Concerns\BlocksGuestWrites;
use App\Services\EventWaitlistService;
use App\Services\AdminRoleService;
use App\Services\ActivityLogService;
use App\Services\NoticeAudienceService;
use App\Services\NotificationService;
use App\Services\ScheduledNoticeService;
use App\Support\MediaUrl;
use App\Support\NoticeExpiry;
use App\Support\NoticeSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;

class NoticeController extends Controller
{
    use BlocksGuestReads;
    use BlocksGuestWrites;
    private const CATEGORIES = ['general', 'maintenance', 'event', 'security', 'finance', 'emergency'];
    private const STATUSES     = ['draft', 'published', 'archived'];
    private const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

    /** GET /v1/notices */
    public function index(Request $request)
    {
        $category = strtolower((string) ($request->query('category') ?? ''));
        $this->assertGuestCanRead($request, $category === 'event' ? 'events' : 'notices');

        ScheduledNoticeService::publishDue();

        $user = auth()->user();

        try {
            $communityId = $this->resolveCommunityId($request, $user);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if ($e->getStatusCode() === 422) {
                return response()->json([
                    'data' => [],
                    'meta' => [
                        'current_page' => 1,
                        'last_page'    => 1,
                        'total'        => 0,
                        'reason'       => 'no_approved_membership',
                    ],
                    'message' => $e->getMessage(),
                ], 422);
            }

            throw $e;
        }

        $isAdmin = $this->isCommunityAdmin($user);

        $query = $this->baseQuery();

        if ($this->isPlatformAdmin($user)) {
            if ($request->filled('community_id') && $request->community_id !== 'all') {
                $query->where('notices.community_id', (int) $request->community_id);
            }
        } else {
            $query->where(function ($q) use ($communityId) {
                $q->where(function ($q2) use ($communityId) {
                    $q2->where('notices.community_id', $communityId)
                        ->where('notices.is_global', false);
                })->orWhere('notices.is_global', true);
            });
        }

        // Resident-facing list: only super-admin-approved, published notices.
        $query->where('notices.status', 'published')
            ->where('notices.review_status', 'approved');

        NoticeExpiry::applyVisibleScheduleFilter($query, 'notices', $communityId);

        if (! $this->isPlatformAdmin($user)) {
            NoticeAudienceService::applyResidentVisibilityFilter($query, (int) $user->id);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('notices.status', $request->status);
        }
        if ($request->filled('review_status') && $request->review_status !== 'all') {
            $query->where('notices.review_status', $request->review_status);
        }
        if ($request->filled('category_group')) {
            $this->applyCategoryGroupFilter($query, $request->input('category_group'), $request->input('category'));
        } elseif ($request->filled('category') && $request->category !== 'all') {
            $query->where('notices.category', $this->normalizeCategory($request->category));
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('notices.title', 'like', "%{$s}%")
                    ->orWhere('notices.body', 'like', "%{$s}%")
                    ->orWhere('notices.location', 'like', "%{$s}%");
            });
        }

        $notices = $this->applyNoticeOrdering($query, $communityId)
                         ->paginate($request->per_page ?? 15);

        $items     = $notices->items();
        $summaries = $this->batchEventRsvpSummaries($items, $user);

        $payload = [
            'data' => collect($items)->map(
                fn ($n) => $this->formatNotice($n, $user, false, $summaries[(int) $n->id] ?? null),
            )->values(),
            'meta' => [
                'current_page' => $notices->currentPage(),
                'last_page'    => $notices->lastPage(),
                'total'        => $notices->total(),
            ],
        ];

        if ($isAdmin || $this->isPlatformAdmin($user)) {
            $payload['meta']['stats'] = $this->communityStats($communityId, $user);
        }

        return response()->json($payload);
    }

    /** GET /v1/admin/notices */
    public function adminIndex(Request $request)
    {
        ScheduledNoticeService::publishDue();

        $this->ensureCanManageContent();

        $query = $this->baseQuery()
            ->leftJoin('communities', 'communities.id', '=', 'notices.community_id')
            ->addSelect('communities.name as community_name');

        $scopeId = AdminRoleService::resolveAdminCommunityScope(auth()->user(), $request);
        if ($scopeId !== null) {
            $query->where('notices.community_id', $scopeId);
        } elseif ($request->filled('community_id') && $request->community_id !== 'all') {
            $query->where('notices.community_id', (int) $request->community_id);
        }

        $this->applyCategoryGroupFilter($query, $request->input('category_group'), $request->input('category'));

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('notices.status', $request->status);
        }
        if ($request->filled('review_status') && $request->review_status !== 'all') {
            $query->where('notices.review_status', $request->review_status);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('notices.title', 'like', "%{$s}%")
                    ->orWhere('notices.body', 'like', "%{$s}%")
                    ->orWhere('notices.location', 'like', "%{$s}%")
                    ->orWhere('communities.name', 'like', "%{$s}%");
            });
        }

        $notices = $this->applyNoticeOrdering($query)
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        $statsQuery = DB::table('notices')->whereNull('deleted_at');
        if ($scopeId !== null) {
            $statsQuery->where('community_id', $scopeId);
        } elseif ($request->filled('community_id') && $request->community_id !== 'all') {
            $statsQuery->where('community_id', (int) $request->community_id);
        }
        $this->applyCategoryGroupFilter($statsQuery, $request->input('category_group'), $request->input('category'), 'category');

        $stats = [
            'total'    => (clone $statsQuery)->count(),
            'pending'  => (clone $statsQuery)->where('review_status', 'pending')->count(),
            'approved' => (clone $statsQuery)->where('review_status', 'approved')->count(),
            'rejected' => (clone $statsQuery)->where('review_status', 'rejected')->count(),
            'published'=> (clone $statsQuery)->where('status', 'published')->count(),
            'draft'    => (clone $statsQuery)->where('status', 'draft')->count(),
            'archived' => (clone $statsQuery)->where('status', 'archived')->count(),
        ];

        $items     = $notices->items();
        $summaries = $this->batchEventRsvpSummaries($items, auth()->user());

        return response()->json([
            'data' => collect($items)->map(
                fn ($n) => $this->formatNotice($n, auth()->user(), false, $summaries[(int) $n->id] ?? null),
            )->values(),
            'meta' => [
            'current_page' => $notices->currentPage(),
            'last_page'    => $notices->lastPage(),
            'total'        => $notices->total(),
                'per_page'     => $notices->perPage(),
                'stats'        => $stats,
            ],
        ]);
    }

    /** GET /v1/notices/{id} */
    public function show(int $id)
    {
        ScheduledNoticeService::publishDue();

        $notice = $this->baseQuery()->where('notices.id', $id)->first();

        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        $user = auth()->user();

        if ($notice->status !== 'published' || $notice->review_status !== 'approved') {
            if (! $this->isPlatformAdmin($user)) {
                return response()->json(['message' => 'Notice not found'], 404);
            }
        } elseif (! $notice->is_global) {
            $communityId = $this->resolveCommunityId(request(), $user);
            if ((int) $notice->community_id !== $communityId) {
                return response()->json(['message' => 'Notice not found'], 404);
            }
        }

        if (! $this->isPlatformAdmin($user) && ! NoticeAudienceService::canUserViewNotice($notice, (int) $user->id)) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        if (! $this->isPlatformAdmin($user) && NoticeExpiry::isExpired($notice, null, (int) $notice->community_id)) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        return response()->json(['data' => $this->formatNotice($notice, $user, true)]);
    }

    /** POST /v1/notices/{id}/rsvp — join or update event RSVP */
    public function rsvp(Request $request, int $id)
    {
        $validated = $request->validate([
            'status' => 'required|string|in:going,maybe,not_going',
        ]);

        $notice = $this->baseQuery()->where('notices.id', $id)->first();

        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        $user = auth()->user();

        if ($notice->status !== 'published' || $notice->review_status !== 'approved') {
            return response()->json(['message' => 'This event is not available'], 404);
        }

        if ($notice->category !== 'event') {
            return response()->json(['message' => 'RSVP is only available for events'], 422);
        }

        if (! ($notice->requires_rsvp ?? false)) {
            return response()->json(['message' => 'This event does not accept RSVPs'], 422);
        }

        if (! $notice->is_global) {
            $communityId = $this->resolveCommunityId($request, $user);
            if ((int) $notice->community_id !== $communityId) {
                return response()->json(['message' => 'Notice not found'], 404);
            }
        }

        if ((int) $notice->author_id === (int) $user->id) {
            return response()->json(['message' => 'Event organizers cannot RSVP to their own event'], 422);
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $notice->community_id)
            ->where('status', 'approved')
            ->exists();

        if (! $membership && ! $notice->is_global) {
            return response()->json(['message' => 'Approved community membership required'], 403);
        }

        $rsvpChange = null;
        $promotedUserIds = [];

        try {
            DB::transaction(function () use ($validated, $id, $user, &$rsvpChange, &$promotedUserIds) {
                $lockedNotice = DB::table('notices')
                    ->where('id', $id)
                    ->whereNull('deleted_at')
                    ->lockForUpdate()
                    ->first();

                if (! $lockedNotice) {
                    return;
                }

                $capacity = $this->readEventCapacity($lockedNotice);

                if ($validated['status'] === 'not_going') {
                    $existing = DB::table('event_rsvps')
                        ->where('notice_id', $id)
                        ->where('user_id', $user->id)
                        ->first();

                    if ($existing && $existing->status === 'going') {
                        $rsvpChange = 'left';
                    }

                    DB::table('event_rsvps')
                        ->where('notice_id', $id)
                        ->where('user_id', $user->id)
                        ->delete();

                    if ($rsvpChange === 'left') {
                        $promotedUserIds = EventWaitlistService::promoteFromWaitlist($id, $capacity);
                    }

                    return;
                }

                $existing = DB::table('event_rsvps')
                    ->where('notice_id', $id)
                    ->where('user_id', $user->id)
                    ->first();

                if ($validated['status'] === 'going') {
                    if ($existing && $existing->status === 'waiting') {
                        return;
                    }

                    $alreadyGoing = $existing && $existing->status === 'going';
                    if (! $alreadyGoing && $this->isEventAtCapacity($lockedNotice, $existing)) {
                        $now = now();

                        if ($existing) {
                            DB::table('event_rsvps')
                                ->where('id', $existing->id)
                                ->update([
                                    'status'     => 'waiting',
                                    'updated_at' => $now,
                                ]);
                        } else {
                            DB::table('event_rsvps')->insert([
                                'notice_id'  => $id,
                                'user_id'    => $user->id,
                                'status'     => 'waiting',
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]);
                        }

                        $rsvpChange = 'waitlisted';

                        return;
                    }
                }

                $now = now();

                if ($existing) {
                    $wasGoing = $existing->status === 'going';
                    DB::table('event_rsvps')
                        ->where('id', $existing->id)
                        ->update([
                            'status'     => $validated['status'],
                            'updated_at' => $now,
                        ]);

                    if ($validated['status'] === 'going' && ! $wasGoing) {
                        $rsvpChange = 'joined';
                    }
                } else {
                    DB::table('event_rsvps')->insert([
                        'notice_id'  => $id,
                        'user_id'    => $user->id,
                        'status'     => $validated['status'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                    if ($validated['status'] === 'going') {
                        $rsvpChange = 'joined';
                    }
                }
            });
        } catch (QueryException $e) {
            report($e);

            return response()->json([
                'message' => 'Could not save your RSVP. Please try again.',
                'code'    => 'rsvp_failed',
            ], 500);
        }

        $freshAfterLock = DB::table('notices')
            ->where('id', $id)
            ->whereNull('deleted_at')
            ->exists();

        if (! $freshAfterLock) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        if ($promotedUserIds !== []) {
            EventWaitlistService::notifyPromotedUsers($notice, $promotedUserIds);
        }

        if ($rsvpChange) {
            $totalGoing = (int) DB::table('event_rsvps')
                ->where('notice_id', $id)
                ->where('status', 'going')
                ->count();

            $this->notifyOrganizerEventRsvp($notice, $user, $rsvpChange, $totalGoing);
        }

        $fresh = $this->baseQuery()->where('notices.id', $id)->first();

        $message = match (true) {
            $validated['status'] === 'not_going' => 'You left this event',
            $validated['status'] === 'maybe'     => 'Your RSVP was updated',
            $rsvpChange === 'waitlisted'         => "You're on the waiting list",
            default                              => 'You joined this event',
        };

        return response()->json([
            'data'    => $this->formatNotice($fresh, $user, true),
            'message' => $message,
        ]);
    }

    /** POST /v1/events — resident event submission (pending admin approval) */
    public function submitEvent(Request $request)
    {
        $this->assertNotGuestWrite($request, 'create_event');

        $user = auth()->user();

        if (AdminRoleService::isActiveCommunityAdmin($user) || AdminRoleService::isSystemAdmin($user)) {
            return response()->json([
                'message' => 'Community admins should use the admin events endpoint.',
            ], 422);
        }

        $validated = $request->validate([
            'title'          => 'required|string|max:200',
            'body'           => 'required|string',
            'location'       => 'nullable|string|max:255',
            'image_url'      => 'nullable|string|max:512',
            'event_date'     => 'required|date',
            'event_time'     => 'required|string|max:20',
            'event_time_end' => 'required|string|max:20',
            'event_capacity' => 'nullable|integer|min:1|max:100000',
            'requires_rsvp'  => 'nullable|boolean',
        ]);

        if ($request->hasAny(['is_pinned', 'scheduled_at'])) {
            return response()->json(['message' => 'Admin-only event options are not allowed for resident submissions'], 422);
        }

        $communityId = $this->resolveCommunityId($request, $user);

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'Approved community membership required'], 403);
        }

        if (! DB::table('communities')->where('id', $communityId)->exists()) {
            return response()->json(['message' => 'Community not found. Please contact support.'], 422);
        }

        $id = DB::table('notices')->insertGetId([
            'community_id'   => $communityId,
            'author_id'      => auth()->id(),
            'title'          => $validated['title'],
            'category'       => 'event',
            'body'           => $validated['body'],
            'location'       => $validated['location'] ?? null,
            'image_url'      => MediaUrl::normalize($validated['image_url'] ?? null),
            'event_date'     => $validated['event_date'],
            'event_time'     => $validated['event_time'],
            'event_time_end' => $validated['event_time_end'] ?? null,
            'event_capacity' => $this->parseEventCapacity($validated['event_capacity'] ?? null),
            'requires_rsvp'  => $request->boolean('requires_rsvp'),
            'status'         => 'draft',
            'review_status'  => 'pending',
            'is_global'      => false,
            'published_at'   => null,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        $this->notifyCommunityAdminsPendingNotice($communityId, $validated['title'], 'event');

        ActivityLogService::user(
            'event_submitted',
            "Submitted event for approval: \"{$validated['title']}\"",
            'Notice',
            $id,
        );

        $notice = $this->baseQuery()->where('notices.id', $id)->first();

        return response()->json([
            'data'    => $this->formatNotice($notice),
            'message' => 'Event submitted for admin approval',
        ], 201);
    }

    /** POST /v1/events/upload-image */
    public function uploadEventImage(Request $request)
    {
        $user = auth()->user();

        if (AdminRoleService::isActiveCommunityAdmin($user) || AdminRoleService::isSystemAdmin($user)) {
            return response()->json([
                'message' => 'Community admins should use the admin upload endpoint.',
            ], 422);
        }

        $communityId = $this->resolveCommunityId($request, $user);

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'Approved community membership required'], 403);
        }

        $request->validate(['image' => 'required|image|max:5120']);

        $relative = $this->storeImage($request->file('image'));

        return response()->json([
            'data'    => ['image_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Image uploaded',
        ]);
    }

    /** POST /v1/admin/notices */
    public function store(Request $request)
    {
        return $this->createItem($request, null);
    }

    /** POST /v1/admin/events */
    public function storeEvent(Request $request)
    {
        return $this->createItem($request, 'event');
    }

    /** POST /v1/admin/alerts */
    public function storeAlert(Request $request)
    {
        return $this->createItem($request, 'emergency');
    }

    /** PATCH /v1/admin/notices/{id} */
    public function update(int $id, Request $request)
    {
        $this->ensureCanManageContent();

        $notice = DB::table('notices')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        AdminRoleService::assertCanManageCommunity(auth()->user(), (int) $notice->community_id);

        $validated = $request->validate([
            'title'          => 'sometimes|string|max:200',
            'category'       => 'sometimes|string',
            'body'           => 'sometimes|string',
            'location'       => 'nullable|string|max:255',
            'image_url'      => 'nullable|string|max:512',
            'event_date'     => 'nullable|date',
            'event_time'     => 'nullable|string|max:20',
            'event_time_end' => 'nullable|string|max:20',
            'event_capacity' => 'nullable|integer|min:1|max:100000',
            'status'         => 'sometimes|in:draft,published,archived',
            'is_global'      => 'sometimes|boolean',
            'is_pinned'      => 'sometimes|boolean',
            'scheduled_at'   => 'nullable|date',
            'requires_rsvp'  => 'sometimes|boolean',
            'audience_type'      => 'sometimes|in:all,selected',
            'recipient_user_ids' => 'nullable|array',
            'recipient_user_ids.*' => 'integer|min:1',
        ]);

        $data = [];

        foreach (['title', 'body', 'location', 'event_date', 'event_time', 'event_time_end', 'status'] as $field) {
            if (array_key_exists($field, $validated)) {
                $data[$field] = $validated[$field];
            }
        }

        if (array_key_exists('image_url', $validated)) {
            $data['image_url'] = MediaUrl::normalize($validated['image_url']);
        }

        if (isset($validated['category'])) {
            $category = $this->normalizeCategory($validated['category']);
            if (! in_array($category, self::CATEGORIES, true)) {
                return response()->json(['message' => 'Invalid category'], 422);
            }
            $data['category'] = $category;
        }

        if ($this->isPlatformAdmin(auth()->user()) && array_key_exists('is_global', $validated)) {
            $data['is_global'] = (bool) $validated['is_global'];
        }

        if (array_key_exists('event_capacity', $validated)) {
            if ($notice->category !== 'event') {
                return response()->json(['message' => 'Capacity applies to events only'], 422);
            }

            $capacity = $this->parseEventCapacity($validated['event_capacity']);
            $this->assertEventCapacityNotBelowAttendance($id, $capacity);
            $data['event_capacity'] = $capacity;
        }

        if ($notice->category === 'event') {
            if (array_key_exists('is_pinned', $validated)) {
                $data['is_pinned'] = (bool) $validated['is_pinned'];
            }

            if (array_key_exists('requires_rsvp', $validated)) {
                $data['requires_rsvp'] = (bool) $validated['requires_rsvp'];
            }

            if (array_key_exists('scheduled_at', $validated)) {
                $scheduledAt = NoticeSchedule::normalizeForStorage(
                    $validated['scheduled_at'],
                    (int) $notice->community_id,
                );
                $data['scheduled_at'] = $scheduledAt;

                if ($scheduledAt !== null && NoticeSchedule::isFuture($scheduledAt, (int) $notice->community_id)) {
                    $data['status'] = 'draft';
                    $data['published_at'] = null;
                }
            }
        } elseif ($this->categorySupportsPinAndSchedule($notice->category)) {
            if (array_key_exists('is_pinned', $validated)) {
                $data['is_pinned'] = (bool) $validated['is_pinned'];
            }

            if (array_key_exists('scheduled_at', $validated)) {
                $scheduledAt = NoticeSchedule::normalizeForStorage(
                    $validated['scheduled_at'],
                    (int) $notice->community_id,
                );
                $data['scheduled_at'] = $scheduledAt;

                if ($scheduledAt !== null && NoticeSchedule::isFuture($scheduledAt, (int) $notice->community_id)) {
                    $data['status'] = 'draft';
                    $data['published_at'] = null;
                }
            }

            if (array_key_exists('requires_rsvp', $validated)) {
                return response()->json(['message' => 'RSVP applies to events only'], 422);
            }
        } elseif (array_key_exists('is_pinned', $validated) || array_key_exists('scheduled_at', $validated) || array_key_exists('requires_rsvp', $validated)) {
            return response()->json(['message' => 'These options are not available for this notice type'], 422);
        }

        if (isset($data['status']) && $data['status'] === 'published' && $notice->status !== 'published') {
            if ($notice->review_status !== 'approved') {
                return response()->json(['message' => 'Item must be approved before publishing'], 422);
            }
            $data['published_at'] = now();
            $this->notifyResidentsForNotice($notice, $data['title'] ?? $notice->title);
            ActivityLogService::user('notice_published', "Published notice: \"{$notice->title}\"", 'Notice', $id);
        }

        if (isset($data['status']) && $data['status'] === 'draft') {
            $data['published_at'] = null;
        }

        $effectiveCategory = $data['category'] ?? $notice->category;
        $audienceType = NoticeAudienceService::normalizeAudienceType(
            $validated['audience_type'] ?? $notice->audience_type ?? NoticeAudienceService::TYPE_ALL,
        );
        $recipientIds = null;

        if (NoticeAudienceService::categorySupportsAudienceTargeting($effectiveCategory)) {
            if (array_key_exists('audience_type', $validated) || array_key_exists('recipient_user_ids', $validated)) {
                $recipientIds = NoticeAudienceService::validateRecipientIds(
                    (int) $notice->community_id,
                    $audienceType,
                    $validated['recipient_user_ids'] ?? (
                        $audienceType === NoticeAudienceService::TYPE_SELECTED
                            ? NoticeAudienceService::recipientUserIds($id)
                            : []
                    ),
                );
                $data['audience_type'] = $audienceType;
            }
        } elseif (
            array_key_exists('audience_type', $validated)
            && $validated['audience_type'] === NoticeAudienceService::TYPE_SELECTED
        ) {
            return response()->json(['message' => 'Recipient targeting applies to notices only'], 422);
        }

        $wasPublished = $notice->status === 'published';
        $contentFields = ['title', 'body', 'category'];
        $contentChanged = collect($contentFields)->contains(fn ($field) => array_key_exists($field, $data));

        $data['updated_at'] = now();
        DB::table('notices')->where('id', $id)->update($data);

        if ($recipientIds !== null) {
            if ($audienceType === NoticeAudienceService::TYPE_SELECTED) {
                NoticeAudienceService::syncRecipients($id, $recipientIds);
            } else {
                DB::table('notice_recipients')->where('notice_id', $id)->delete();
            }
        }

        $fresh = $this->baseQuery()->where('notices.id', $id)->first();

        if ($fresh && $fresh->status === 'published' && $wasPublished && $contentChanged) {
            $this->syncNoticeNotifications($fresh);
        }

        return response()->json([
            'data'    => $this->formatNotice($fresh),
            'message' => 'Notice updated',
        ]);
    }

    /** PATCH /v1/admin/notices/{id}/approve */
    public function approve(int $id)
    {
        $notice = DB::table('notices')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        AdminRoleService::assertCanManageCommunity(auth()->user(), (int) $notice->community_id);

        $wasRejected = ($notice->review_status ?? '') === 'rejected';

        DB::table('notices')->where('id', $id)->update([
            'review_status'    => 'approved',
            'status'           => 'published',
            'published_at'     => now(),
            'approved_by'      => auth()->id(),
            'approved_at'      => now(),
            'rejection_reason' => null,
            'updated_at'       => now(),
        ]);

        $fresh = DB::table('notices')->where('id', $id)->first();
        $this->notifyResidentsForNotice($fresh, $fresh->title);

        ActivityLogService::user(
            $wasRejected ? 'notice_reapproved' : 'notice_approved',
            ($wasRejected ? 'Re-approved' : 'Approved')." notice: \"{$notice->title}\"",
            'Notice',
            $id,
        );

        if ($notice->author_id) {
            NotificationService::send(
                (int) $notice->author_id,
                'success',
                $wasRejected ? 'Content re-approved' : 'Content approved',
                "Your {$this->categoryLabel($notice->category)} \"{$notice->title}\" is now live.",
                "/notices/{$id}",
                ['category' => $notice->category ?? 'general'],
            );
        }

        return response()->json([
            'data'    => $this->formatNotice($this->baseQuery()->where('notices.id', $id)->first()),
            'message' => $wasRejected ? 'Re-approved and published' : 'Approved and published',
        ]);
    }

    /** PATCH /v1/admin/notices/{id}/reject */
    public function reject(int $id, Request $request)
    {
        $request->validate(['reason' => 'nullable|string|max:500']);

        $notice = DB::table('notices')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        AdminRoleService::assertCanManageCommunity(auth()->user(), (int) $notice->community_id);

        DB::table('notices')->where('id', $id)->update([
            'review_status'    => 'rejected',
            'status'           => 'draft',
            'published_at'     => null,
            'approved_by'      => null,
            'approved_at'      => null,
            'rejection_reason' => $request->reason,
            'updated_at'       => now(),
        ]);

        ActivityLogService::user('notice_rejected', "Rejected notice: \"{$notice->title}\"", 'Notice', $id, 'warning');

        if ($notice->author_id) {
            $reason = $request->reason ? " Reason: {$request->reason}" : '';
            NotificationService::send(
                (int) $notice->author_id,
                'warning',
                'Content not approved',
                "Your {$this->categoryLabel($notice->category)} \"{$notice->title}\" was not approved.{$reason}",
            );
        }

        return response()->json(['message' => 'Rejected']);
    }

    /** DELETE /v1/admin/notices/{id} */
    public function destroy(int $id)
    {
        $this->ensureCanManageContent();

        $notice = DB::table('notices')->where('id', $id)->whereNull('deleted_at')->first();
        if (! $notice) {
            return response()->json(['message' => 'Notice not found'], 404);
        }

        AdminRoleService::assertCanManageCommunity(auth()->user(), (int) $notice->community_id);

        // Notify before soft-delete so audience/recipient rows are still available.
        if (($notice->category ?? '') === 'event') {
            NoticeAudienceService::notifyEventCancelled($notice);
        }

        DB::table('notices')->where('id', $id)->update(['deleted_at' => now()]);

        // Point prior deep-links away from the deleted event detail page.
        DB::table('app_notifications')
            ->where('action_url', "/notices/{$id}")
            ->update([
                'action_url' => '/screens/notices',
                'updated_at' => now(),
            ]);

        ActivityLogService::user('notice_deleted', "Deleted notice: \"{$notice->title}\"", 'Notice', $id, 'warning');

        return response()->json(['message' => 'Notice deleted']);
    }

    /** POST /v1/admin/notices/upload-image */
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

    private function createItem(Request $request, ?string $forcedCategory)
    {
        $this->ensureCanManageContent();

        $user = auth()->user();

        $validated = $request->validate([
            'title'              => 'required|string|max:200',
            'category'           => $forcedCategory ? 'nullable|string' : 'required|string',
            'body'               => 'required|string',
            'location'           => 'nullable|string|max:255',
            'image_url'          => 'nullable|string|max:512',
            'event_date'         => 'nullable|date',
            'event_time'         => 'nullable|string|max:20',
            'event_time_end'     => 'nullable|string|max:20',
            'event_capacity'     => 'nullable|integer|min:1|max:100000',
            'status'             => 'nullable|in:draft,published,archived',
            'community_id'       => 'nullable|integer',
            'is_global'          => 'nullable|boolean',
            'as_platform_admin'  => 'nullable|boolean',
            'is_pinned'          => 'nullable|boolean',
            'scheduled_at'       => 'nullable|date',
            'requires_rsvp'      => 'nullable|boolean',
            'audience_type'      => 'nullable|in:all,selected',
            'recipient_user_ids' => 'nullable|array',
            'recipient_user_ids.*' => 'integer|min:1',
        ]);

        $category = $this->normalizeCategory($forcedCategory ?? $validated['category'] ?? 'general');

        if (! in_array($category, self::CATEGORIES, true)) {
            return response()->json(['message' => 'Invalid category'], 422);
        }

        if ($response = $this->assertContentSchedulePresent($validated, $category, $validated['status'] ?? 'published')) {
            return $response;
        }

        if (array_key_exists('event_capacity', $validated) && $category !== 'event') {
            return response()->json(['message' => 'Capacity applies to events only'], 422);
        }

        $platformCreate = $this->isPlatformAdmin($user) && $request->boolean('as_platform_admin');
        $isGlobal       = $platformCreate && $request->boolean('is_global');

        if ($isGlobal) {
            $communityId = (int) (DB::table('communities')->orderBy('id')->value('id') ?? 1);
        } elseif ($platformCreate) {
            $communityId = $request->filled('community_id')
                ? (int) $request->community_id
                : $this->resolveCommunityId($request, $user);
        } else {
            $membership = $this->getApprovedAdminMembership($user);
            if (! $membership) {
                return response()->json(['message' => 'Community admin access required'], 403);
            }
            $communityId = (int) $membership->community_id;
        }

        if (! DB::table('communities')->where('id', $communityId)->exists()) {
            return response()->json(['message' => 'Community not found. Please contact support.'], 422);
        }

        if ($platformCreate) {
            $reviewStatus = 'approved';
            $status       = $validated['status'] ?? 'published';
        } elseif (AdminRoleService::isActiveCommunityAdmin($user)) {
            $reviewStatus = 'approved';
            $status       = $validated['status'] ?? 'published';
        } else {
            return response()->json(['message' => 'Approved community admin access required'], 403);
        }

        $scheduledAt  = null;
        $isPinned     = false;
        $requiresRsvp = false;

        if ($category === 'event') {
            $requiresRsvp = $request->boolean('requires_rsvp');
        }

        if ($this->categorySupportsPinAndSchedule($category)) {
            $isPinned = $request->boolean('is_pinned');

            if ($request->filled('scheduled_at')) {
                $scheduledAt = NoticeSchedule::normalizeForStorage(
                    $validated['scheduled_at'],
                    $communityId,
                );
                if ($response = $this->assertScheduledAtInFuture($scheduledAt)) {
                    return $response;
                }
                $status = 'draft';
            }
        }

        $publishedAt = null;
        if ($status === 'published' && $reviewStatus === 'approved' && $scheduledAt === null) {
            $publishedAt = now();
        }

        $audienceType = NoticeAudienceService::TYPE_ALL;
        $recipientIds = [];

        if (NoticeAudienceService::categorySupportsAudienceTargeting($category)) {
            $audienceType = NoticeAudienceService::normalizeAudienceType($validated['audience_type'] ?? null);
            $recipientIds = NoticeAudienceService::validateRecipientIds(
                $communityId,
                $audienceType,
                $validated['recipient_user_ids'] ?? null,
            );
        } elseif (
            ($validated['audience_type'] ?? NoticeAudienceService::TYPE_ALL) === NoticeAudienceService::TYPE_SELECTED
            || ! empty($validated['recipient_user_ids'])
        ) {
            return response()->json(['message' => 'Recipient targeting applies to notices only'], 422);
        }

        $id = DB::table('notices')->insertGetId([
            'community_id'     => $communityId,
            'author_id'        => auth()->id(),
            'title'            => $validated['title'],
            'category'         => $category,
            'body'             => $validated['body'],
            'location'         => $validated['location'] ?? null,
            'image_url'        => MediaUrl::normalize($validated['image_url'] ?? null),
            'event_date'       => $validated['event_date'] ?? null,
            'event_time'       => $validated['event_time'] ?? null,
            'event_time_end'   => $validated['event_time_end'] ?? null,
            'event_capacity'   => $category === 'event'
                ? $this->parseEventCapacity($validated['event_capacity'] ?? null)
                : null,
            'is_pinned'        => $isPinned,
            'requires_rsvp'    => $category === 'event' ? $requiresRsvp : false,
            'scheduled_at'     => $scheduledAt,
            'status'           => $status,
            'review_status'    => $reviewStatus,
            'is_global'        => $isGlobal,
            'audience_type'    => $audienceType,
            'published_at'     => $publishedAt,
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        if ($audienceType === NoticeAudienceService::TYPE_SELECTED) {
            NoticeAudienceService::syncRecipients($id, $recipientIds);
        }

        if ($reviewStatus === 'approved' && $status === 'published' && $scheduledAt === null) {
            $fresh = DB::table('notices')->where('id', $id)->first();
            $this->notifyResidentsForNotice($fresh, $validated['title']);
        }

        $logType = match ($category) {
            'event'     => 'event_created',
            'emergency' => 'alert_created',
            default     => 'notice_created',
        };

        ActivityLogService::user($logType, "Created {$this->categoryLabel($category)}: \"{$validated['title']}\"", 'Notice', $id);

        $notice = $this->baseQuery()->where('notices.id', $id)->first();

        $message = $platformCreate
            ? ($isGlobal ? 'Published to all communities' : ucfirst($this->categoryLabel($category)).' published')
            : ($scheduledAt
                ? ucfirst($this->categoryLabel($category)).' scheduled for later'
                : ucfirst($this->categoryLabel($category)).' published to your community');

        return response()->json([
            'data'    => $this->formatNotice($notice),
            'message' => $message,
        ], 201);
    }

    private function baseQuery()
    {
        return DB::table('notices')
            ->join('users', 'users.id', '=', 'notices.author_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'notices.author_id')
            ->select(
                'notices.*',
                'users.name as author_name',
                'profiles.avatar_url as author_avatar',
            )
            ->whereNull('notices.deleted_at');
    }

    private function formatNotice(object $notice, $user = null, bool $withRsvp = false, ?array $eventSummary = null): array
    {
        $audienceType = $notice->audience_type ?? NoticeAudienceService::TYPE_ALL;
        $recipients = $audienceType === NoticeAudienceService::TYPE_SELECTED
            ? NoticeAudienceService::recipients((int) $notice->id)
            : [];

        $payload = [
            'id'               => (int) $notice->id,
            'community_id'     => (int) $notice->community_id,
            'community_name'   => $notice->community_name ?? null,
            'author_id'        => (int) $notice->author_id,
            'title'            => $notice->title,
            'body'             => $notice->body,
            'description'      => $notice->body,
            'category'         => $notice->category,
            'location'         => $notice->location,
            'image_url'        => MediaUrl::toPublic($notice->image_url, request()),
            'event_date'       => $notice->event_date,
            'event_time'       => $notice->event_time,
            'event_time_end'   => $notice->event_time_end ?? null,
            'status'           => $notice->status,
            'review_status'    => $notice->review_status ?? 'approved',
            'is_global'        => (bool) ($notice->is_global ?? false),
            'approved_by'      => $notice->approved_by ? (int) $notice->approved_by : null,
            'approved_at'      => $notice->approved_at,
            'rejection_reason' => $notice->rejection_reason,
            'published_at'     => $notice->published_at,
            'scheduled_at'     => $notice->scheduled_at ?? null,
            'is_pinned'        => (bool) ($notice->is_pinned ?? false),
            'is_pinned_active' => $this->isPinActive($notice),
            'requires_rsvp'    => (bool) ($notice->requires_rsvp ?? false),
            'audience_type'    => $audienceType,
            'recipient_user_ids' => array_column($recipients, 'id'),
            'recipients'       => $recipients,
            'created_at'       => $notice->created_at,
            'updated_at'       => $notice->updated_at,
            'author_name'      => $notice->author_name,
            'author_avatar'    => MediaUrl::toPublic($notice->author_avatar ?? null, request()),
        ];

        if ($notice->category === 'event') {
            $capacity = isset($notice->event_capacity) ? (int) $notice->event_capacity : null;
            $payload['event_capacity'] = $capacity;

            if ($withRsvp) {
                $payload = array_merge(
                    $payload,
                    $this->eventRsvpPayload((int) $notice->id, (int) $notice->author_id, $user, $capacity),
                );
            } else {
                $payload = array_merge(
                    $payload,
                    $eventSummary ?? $this->eventRsvpSummary((int) $notice->id, (int) $notice->author_id, $user, $capacity),
                );
            }
        }

        return $payload;
    }

    /** Lightweight RSVP counts for list views (no attendee avatars). */
    private function eventRsvpSummary(int $noticeId, int $authorId, $user, ?int $eventCapacity = null): array
    {
        $goingCount = (int) DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('status', 'going')
            ->count();

        $userId      = $user ? (int) $user->id : null;
        $isOrganizer = $userId !== null && $userId === $authorId;
        $isJoined    = false;
        $isWaitlisted = false;

        if ($userId) {
            $isJoined = DB::table('event_rsvps')
                ->where('notice_id', $noticeId)
                ->where('user_id', $userId)
                ->where('status', 'going')
                ->exists();

            $isWaitlisted = EventWaitlistService::isUserWaitlisted($noticeId, $userId);
        }

        $spotsRemaining = $eventCapacity !== null ? max(0, $eventCapacity - $goingCount) : null;
        $isFull         = $eventCapacity !== null && $goingCount >= $eventCapacity;
        $waitlistCount  = EventWaitlistService::waitlistCount($noticeId);

        return [
            'rsvp_count'        => $goingCount,
            'waitlist_count'    => $waitlistCount,
            'spots_remaining'   => $spotsRemaining,
            'is_full'           => $isFull,
            'is_joined'         => $isJoined,
            'is_waitlisted'     => $isWaitlisted,
            'waitlist_position' => $isWaitlisted
                ? EventWaitlistService::waitlistPosition($noticeId, $userId)
                : null,
            'is_organizer'      => $isOrganizer,
        ];
    }

    /** Batch RSVP summaries for paginated event lists. */
    private function batchEventRsvpSummaries(array $notices, $user): array
    {
        $eventIds   = [];
        $capacities = [];
        $authorIds  = [];

        foreach ($notices as $notice) {
            if (($notice->category ?? null) !== 'event') {
                continue;
            }

            $id             = (int) $notice->id;
            $eventIds[]     = $id;
            $capacities[$id] = isset($notice->event_capacity) ? (int) $notice->event_capacity : null;
            $authorIds[$id]  = (int) $notice->author_id;
        }

        if ($eventIds === []) {
            return [];
        }

        $counts = DB::table('event_rsvps')
            ->whereIn('notice_id', $eventIds)
            ->where('status', 'going')
            ->groupBy('notice_id')
            ->selectRaw('notice_id, COUNT(*) as cnt')
            ->pluck('cnt', 'notice_id');

        $waitlistCounts = EventWaitlistService::batchWaitlistCounts($eventIds);

        $joinedSet = [];
        $waitlistedSet = [];
        $userId    = $user ? (int) $user->id : null;

        if ($userId) {
            $joinedSet = DB::table('event_rsvps')
                ->whereIn('notice_id', $eventIds)
                ->where('user_id', $userId)
                ->where('status', 'going')
                ->pluck('notice_id')
                ->map(fn ($id) => (int) $id)
                ->flip()
                ->all();

            $waitlistedSet = DB::table('event_rsvps')
                ->whereIn('notice_id', $eventIds)
                ->where('user_id', $userId)
                ->where('status', 'waiting')
                ->pluck('notice_id')
                ->map(fn ($id) => (int) $id)
                ->flip()
                ->all();
        }

        $summaries = [];

        foreach ($eventIds as $id) {
            $going          = (int) ($counts[$id] ?? 0);
            $capacity       = $capacities[$id];
            $spotsRemaining = $capacity !== null ? max(0, $capacity - $going) : null;
            $isFull         = $capacity !== null && $going >= $capacity;

            $summaries[$id] = [
                'rsvp_count'        => $going,
                'waitlist_count'    => (int) ($waitlistCounts[$id] ?? 0),
                'spots_remaining'   => $spotsRemaining,
                'is_full'           => $isFull,
                'is_joined'         => isset($joinedSet[$id]),
                'is_waitlisted'     => isset($waitlistedSet[$id]),
                'waitlist_position' => isset($waitlistedSet[$id])
                    ? EventWaitlistService::waitlistPosition($id, $userId)
                    : null,
                'is_organizer'      => $userId !== null && $userId === ($authorIds[$id] ?? 0),
            ];
        }

        return $summaries;
    }

    private function eventRsvpPayload(int $noticeId, int $authorId, $user, ?int $eventCapacity = null): array
    {
        $goingCount = (int) DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('status', 'going')
            ->count();

        $attendees = DB::table('event_rsvps')
            ->join('users', 'users.id', '=', 'event_rsvps.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'event_rsvps.user_id')
            ->where('event_rsvps.notice_id', $noticeId)
            ->where('event_rsvps.status', 'going')
            ->select('users.id', 'users.name', 'profiles.avatar_url')
            ->orderBy('event_rsvps.created_at')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'id'         => (int) $row->id,
                'name'       => $row->name,
                'avatar_url' => MediaUrl::toPublic($row->avatar_url ?? null, request()),
            ])
            ->values()
            ->all();

        $userId = $user ? (int) $user->id : null;
        $isOrganizer = $userId !== null && $userId === $authorId;
        $isJoined = false;
        $isWaitlisted = false;

        if ($userId) {
            $isJoined = DB::table('event_rsvps')
                ->where('notice_id', $noticeId)
                ->where('user_id', $userId)
                ->where('status', 'going')
                ->exists();

            $isWaitlisted = EventWaitlistService::isUserWaitlisted($noticeId, $userId);
        }

        $spotsRemaining = $eventCapacity !== null ? max(0, $eventCapacity - $goingCount) : null;
        $isFull         = $eventCapacity !== null && $goingCount >= $eventCapacity;
        $waitlistCount  = EventWaitlistService::waitlistCount($noticeId);

        $payload = [
            'rsvp_count'        => $goingCount,
            'waitlist_count'    => $waitlistCount,
            'attendees'         => $attendees,
            'is_joined'         => $isJoined,
            'is_waitlisted'     => $isWaitlisted,
            'waitlist_position' => $isWaitlisted
                ? EventWaitlistService::waitlistPosition($noticeId, $userId)
                : null,
            'is_organizer'      => $isOrganizer,
            'spots_remaining'   => $spotsRemaining,
            'is_full'           => $isFull,
        ];

        if ($this->canViewEventWaitlist($noticeId, $authorId, $user)) {
            $payload['waitlist'] = EventWaitlistService::waitlistEntries($noticeId);
        }

        return $payload;
    }

    private function canViewEventWaitlist(int $noticeId, int $authorId, $user): bool
    {
        if (! $user) {
            return false;
        }

        if ((int) $user->id === $authorId) {
            return true;
        }

        if (AdminRoleService::isSystemAdmin($user)) {
            return true;
        }

        $communityId = (int) DB::table('notices')->where('id', $noticeId)->value('community_id');

        return AdminRoleService::canManageCommunity($user, $communityId);
    }

    private function parseEventCapacity(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return max(1, min(100000, (int) $value));
    }

    private function assertEventCapacityNotBelowAttendance(int $noticeId, ?int $capacity): void
    {
        if ($capacity === null) {
            return;
        }

        $going = (int) DB::table('event_rsvps')
            ->where('notice_id', $noticeId)
            ->where('status', 'going')
            ->count();

        if ($going > $capacity) {
            abort(response()->json([
                'message' => "Capacity cannot be less than current attendance ({$going}).",
                'code'    => 'capacity_below_attendance',
            ], 422));
        }
    }

    private function isEventAtCapacity(object $notice, ?object $existingRsvp = null): bool
    {
        $capacity = $this->readEventCapacity($notice);
        if ($capacity === null) {
            return false;
        }

        if ($existingRsvp && $existingRsvp->status === 'going') {
            return false;
        }

        $goingCount = (int) DB::table('event_rsvps')
            ->where('notice_id', $notice->id)
            ->where('status', 'going')
            ->count();

        return $goingCount >= $capacity;
    }

    private function readEventCapacity(object $notice): ?int
    {
        if (! property_exists($notice, 'event_capacity') || $notice->event_capacity === null) {
            return null;
        }

        return max(1, (int) $notice->event_capacity);
    }

    private function applyNoticeOrdering($query, ?int $communityId = null)
    {
        $now = NoticeExpiry::nowInTimezone($communityId);
        $today = $now->toDateString();
        $time = $now->format('H:i');

        return $query
            ->orderByRaw(NoticeExpiry::activePinOrderSql('notices', $today, $time))
            ->orderByDesc('notices.created_at');
    }

    private function isPinActive(object $notice): bool
    {
        if (! ($notice->is_pinned ?? false)) {
            return false;
        }

        return ! NoticeExpiry::isExpired($notice, null, (int) ($notice->community_id ?? 0));
    }

    private function communityStats(int $communityId, $user): array
    {
        $query = DB::table('notices')->whereNull('deleted_at');

        if (! $this->isPlatformAdmin($user)) {
            $query->where(function ($q) use ($communityId) {
                $q->where('community_id', $communityId)->orWhere('is_global', true);
            });
        }

        $rows = (clone $query)
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $published = (int) ($rows['published'] ?? 0);
        $draft     = (int) ($rows['draft'] ?? 0);
        $archived  = (int) ($rows['archived'] ?? 0);
        $total     = $published + $draft + $archived;

        $pendingReview = (clone $query)->where('review_status', 'pending')->count();

        return [
            'total'          => $total,
            'published'      => $published,
            'draft'          => $draft,
            'archived'       => $archived,
            'pending_review' => (int) $pendingReview,
        ];
    }

    private function normalizeCategory(string $category): string
    {
        return strtolower(trim($category));
    }

    /** Notices, events, and alerts support pin + scheduled publish. */
    private function categorySupportsPinAndSchedule(string $category): bool
    {
        return in_array($this->normalizeCategory($category), [
            'event', 'general', 'maintenance', 'security', 'finance', 'emergency',
        ], true);
    }

    private function assertScheduledAtInFuture(?string $scheduledAtUtc): ?\Illuminate\Http\JsonResponse
    {
        if ($scheduledAtUtc === null) {
            return null;
        }

        if (NoticeSchedule::isDue($scheduledAtUtc)) {
            return response()->json([
                'message' => 'Scheduled publish time must be in the future.',
                'errors'  => ['scheduled_at' => ['Scheduled publish time must be in the future.']],
            ], 422);
        }

        return null;
    }

    /** Categories that require relevance date + start/end times on create. */
    private function categoryRequiresContentSchedule(string $category): bool
    {
        return in_array($this->normalizeCategory($category), [
            'event', 'general', 'maintenance', 'security', 'finance', 'emergency',
        ], true);
    }

    private function assertContentSchedulePresent(array $validated, string $category, string $status = 'published'): ?\Illuminate\Http\JsonResponse
    {
        if ($status === 'draft' || ! $this->categoryRequiresContentSchedule($category)) {
            return null;
        }

        $missing = [];
        if (empty($validated['event_date'])) {
            $missing['event_date'] = ['Date is required.'];
        }
        if ($this->normalizeCategory($category) !== 'emergency') {
            if (empty($validated['event_time'])) {
                $missing['event_time'] = ['Start time is required.'];
            }
            if (empty($validated['event_time_end'])) {
                $missing['event_time_end'] = ['End time is required.'];
            }
        }

        if ($missing !== []) {
            $message = array_key_exists('event_time', $missing) || array_key_exists('event_time_end', $missing)
                ? 'Date, start time, and end time are required.'
                : 'Date is required.';

            return response()->json([
                'message' => $message,
                'errors'  => $missing,
            ], 422);
        }

        return null;
    }

    private function categoryLabel(string $category): string
    {
        return match ($category) {
            'event'     => 'event',
            'emergency' => 'alert',
            default     => 'notice',
        };
    }

    private function applyCategoryGroupFilter($query, ?string $group, ?string $category, string $column = 'notices.category'): void
    {
        if ($category && $category !== 'all') {
            $query->where($column, $this->normalizeCategory($category));

            return;
        }

        if ($group === 'events') {
            $query->where($column, 'event');

            return;
        }

        if ($group === 'alerts') {
            $query->where($column, 'emergency');

            return;
        }

        if ($group === 'notices') {
            $query->whereNotIn($column, ['event', 'emergency']);
        }
    }

    private function resolveCommunityId(Request $request, $user): int
    {
        if ($request->filled('community_id') && $request->community_id !== 'all') {
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

        if ($user && ($this->isPlatformAdmin($user) || $this->isCommunityAdmin($user))) {
            $communityId = DB::table('communities')
                ->where('status', 'active')
                ->orderBy('id')
                ->value('id');

            if (! $communityId) {
                $communityId = DB::table('communities')->orderBy('id')->value('id');
            }

            if ($communityId) {
                return (int) $communityId;
            }
        }

        abort(422, 'No community is assigned to your account.');
    }

    private function isPlatformAdmin($user): bool
    {
        return AdminRoleService::isSystemAdmin($user);
    }

    private function isCommunityAdmin($user): bool
    {
        return AdminRoleService::isActiveCommunityAdmin($user);
    }

    private function getApprovedAdminMembership($user): ?object
    {
        return $user ? AdminRoleService::getApprovedAdminMembership($user) : null;
    }

    private function ensureCanManageContent(): void
    {
        $user = auth()->user();
        if (! AdminRoleService::isSystemAdmin($user) && ! AdminRoleService::isActiveCommunityAdmin($user)) {
            abort(403, 'Admin access required');
        }
    }

    private function ensurePlatformAdmin(): void
    {
        if (! $this->isPlatformAdmin(auth()->user())) {
            abort(403, 'Platform admin access required');
        }
    }

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('notices', 'public');

        return MediaUrl::normalize('/storage/'.$path) ?? '/storage/'.$path;
    }

    private function notifyOrganizerEventRsvp(object $notice, $member, string $change, int $totalGoing): void
    {
        $organizerId = (int) $notice->author_id;
        if ($organizerId <= 0 || $organizerId === (int) $member->id) {
            return;
        }

        $memberName = trim((string) ($member->name ?? 'A neighbor'));
        if ($memberName === '') {
            $memberName = 'A neighbor';
        }

        $countLabel = $totalGoing === 1
            ? 'Total people coming: 1'
            : "Total people coming: {$totalGoing}";

        $body = match ($change) {
            'left'       => "{$memberName} left your event. {$countLabel}.",
            'waitlisted' => "{$memberName} joined the waiting list. {$countLabel}.",
            default      => "{$memberName} joined your event. {$countLabel}.",
        };

        NotificationService::send(
            $organizerId,
            'info',
            'Event Update',
            $body,
            "/notices/{$notice->id}",
            ['category' => 'event', 'notice_id' => (int) $notice->id],
        );
    }

    private function notifyResidentsForNotice(object $notice, string $title): void
    {
        NoticeAudienceService::notifyForNotice($notice, $title);
    }

    private function syncNoticeNotifications(object $notice): void
    {
        $category = $notice->category ?? 'general';

        $label = match ($category) {
            'event'     => 'New Event',
            'emergency' => 'New Alert',
            default     => 'New Notice',
        };

        $summary = trim((string) ($notice->body ?: $notice->title));
        if ($summary === '') {
            $summary = $notice->title;
        }

        DB::table('app_notifications')
            ->where('action_url', "/notices/{$notice->id}")
            ->update([
                'type'       => $category === 'emergency' ? 'warning' : 'info',
                'title'      => $label,
                'body'       => $summary,
                'updated_at' => now(),
            ]);
    }

    private function notifyCommunityAdminsPendingNotice(int $communityId, string $title, string $category): void
    {
        $adminIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereIn('role', ['admin', 'moderator'])
            ->pluck('user_id');

        $label = $this->categoryLabel($category);
        $kind = match ($category) {
            'event'     => 'event',
            'emergency' => 'alert',
            default     => 'notice',
        };
        $href = "/screens/admin-content-review?kind={$kind}";

        foreach ($adminIds as $userId) {
            NotificationService::send(
                (int) $userId,
                'info',
                "{$label} pending approval",
                "A resident submitted \"{$title}\" for review.",
                $href,
                ['category' => $category, 'kind' => $kind],
            );
        }
    }
}
