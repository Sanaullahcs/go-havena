<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\BlocksGuestReads;
use App\Http\Controllers\Concerns\BlocksGuestWrites;
use App\Services\AdminRoleService;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\FcmNotificationService;
use App\Services\NotificationService;
use App\Services\PostReportModeration;
use App\Services\PushNotificationService;
use App\Services\UserActingContextService;
use App\Services\UserBlockService;
use App\Support\MediaUrl;
use App\Support\ReportTypes;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class FeedController extends Controller
{
    use BlocksGuestReads;
    use BlocksGuestWrites;

    /** Max nesting depth for replies (0 = top-level). Depth 2 = reply-to-reply. */
    private const MAX_COMMENT_DEPTH = 2;

    private const TOPICS = [
        ['id' => 'general', 'label' => 'Recommendations'],
        ['id' => 'event', 'label' => 'Events'],
        ['id' => 'help', 'label' => 'Help'],
        ['id' => 'update', 'label' => 'Neighborhood'],
        ['id' => 'announcement', 'label' => 'Announcements'],
    ];

    /** GET /v1/feed/topics */
    public function topics(): JsonResponse
    {
        return response()->json(['data' => self::TOPICS]);
    }

    /** GET /v1/feed — all posts in the member's community (not limited to the current user). */
    public function index(Request $request): JsonResponse
    {
        $this->assertGuestCanRead($request, 'feed');
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page'    => 1,
                    'total'        => 0,
                    'community_id' => null,
                    'reason'       => 'no_approved_membership',
                ],
            ]);
        }

        $query = $this->basePostQuery($communityId);
        $this->excludeBlockedAuthors($query, (int) $user->id, 'posts.user_id');
        $this->excludePostsReportedByViewer($query, (int) $user->id);
        $query
            ->where(function ($w) use ($user) {
                $w->where('posts.status', 'approved')
                    ->orWhere(function ($w2) use ($user) {
                        $w2->where('posts.status', 'pending')
                            ->where('posts.user_id', $user->id);
                    });
            });

        if ($request->filled('category') && $request->category !== 'all') {
            $query->where('posts.category', $request->category);
        }

        if ($request->filled('q')) {
            $term = '%'.$request->q.'%';
            $query->where(function ($w) use ($term) {
                $w->where('posts.body', 'like', $term)
                    ->orWhere('users.name', 'like', $term)
                    ->orWhere('profiles.display_name', 'like', $term);
            });
        }

        if ($request->boolean('mine')) {
            $query->where('posts.user_id', $user->id);
        }

        $posts = $query->orderByDesc('posts.created_at')
            ->paginate(min((int) ($request->per_page ?? 10), 50));

        $likedPostIds = DB::table('post_likes')
            ->where('user_id', $user->id)
            ->pluck('post_id')
            ->all();

        $pageItems = $this->hydratePolls(
            $this->hydrateEngagementCounts($posts->items()),
            (int) $user->id,
        );
        $items = collect($pageItems)->map(fn ($p) => $this->formatPost($p, $likedPostIds, $user->id));

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $posts->currentPage(),
                'last_page'    => $posts->lastPage(),
                'total'        => $posts->total(),
                'community_id' => $communityId,
            ],
        ]);
    }

    /** POST /v1/feed */
    public function store(Request $request): JsonResponse
    {
        $this->assertNotGuestWrite($request, 'create_post');

        $request->validate([
            'body'       => 'required_without_all:content,poll|string|max:2000',
            'content'    => 'required_without_all:body,poll|string|max:2000',
            'body_es'    => 'nullable|string|max:2000',
            'body_ar'    => 'nullable|string|max:2000',
            'category'   => 'nullable|in:general,event,update,help,announcement,poll',
            'image_url'  => 'nullable|string|max:512',
            'poll'       => 'required_if:category,poll|array',
            'poll.question' => 'required_if:category,poll|string|max:200',
            'poll.description' => 'nullable|string|max:500',
            'poll.duration_days' => 'required_if:category,poll|integer|in:1,3,7',
            'poll.options' => 'required_if:category,poll|array|min:2|max:4',
            'poll.options.*' => 'required|string|max:80',
        ], [
            'poll.description.max' => 'Short description must be 500 characters or fewer.',
        ]);

        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json(['message' => 'No approved community membership found.'], 422);
        }

        $isPoll = $request->input('category') === 'poll';

        $pollOptions = [];
        if ($isPoll) {
            $pollOptions = $this->normalizePollOptions($request->input('poll.options', []));
            if (count($pollOptions) < 2) {
                return response()->json(['message' => 'A poll needs at least 2 different options.'], 422);
            }
        }

        $body = $isPoll
            ? trim((string) $request->input('poll.question'))
            : ($request->input('body') ?? $request->input('content'));

        $id = DB::transaction(function () use ($request, $user, $communityId, $body, $isPoll, $pollOptions) {
            $id = DB::table('posts')->insertGetId([
                'community_id'   => $communityId,
                'user_id'        => $user->id,
                'body'           => $body,
                'body_es'        => $isPoll ? null : $request->input('body_es'),
                'body_ar'        => $isPoll ? null : $request->input('body_ar'),
                'category'       => $request->category ?? 'general',
                'image_url'      => $isPoll ? null : MediaUrl::normalize($request->image_url),
                'status'         => 'approved',
                'approved_by'    => $user->id,
                'approved_at'    => now(),
                'likes_count'    => 0,
                'comments_count' => 0,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            if ($isPoll) {
                $duration = (int) $request->input('poll.duration_days');
                $description = trim((string) $request->input('poll.description', ''));
                $pollId = DB::table('polls')->insertGetId([
                    'post_id'        => $id,
                    'question'       => $body,
                    'description'    => $description !== '' ? $description : null,
                    'duration_days'  => $duration,
                    'ends_at'        => now()->addDays($duration),
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
                foreach ($pollOptions as $position => $label) {
                    DB::table('poll_options')->insert([
                        'poll_id'    => $pollId,
                        'label'      => $label,
                        'position'   => $position,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            return $id;
        });

        ActivityLogService::user(
            'post_created',
            $isPoll ? 'Published a community poll' : 'Published a community post',
            'Post',
            $id,
            'info',
            null,
            ['related_item' => \Illuminate\Support\Str::limit($body, 80)],
        );

        $this->notifyPostCreated((int) $communityId, (int) $user->id, (int) $id, (string) $body);

        $post = $this->basePostQuery($communityId)
            ->where('posts.id', $id)
            ->first();
        [$post] = $this->hydratePolls([$post], (int) $user->id);

        return response()->json([
            'data'    => $this->formatPost($post, [], $user->id),
            'message' => $isPoll
                ? 'Poll published to your community feed.'
                : 'Post published to your community feed.',
        ], 201);
    }

    /** POST /v1/feed/upload-image */
    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate(['image' => 'required|image|max:5120']);

        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json(['message' => 'No approved community membership found.'], 422);
        }

        $relative = $this->storeImage($request->file('image'));

        return response()->json([
            'data'    => ['image_url' => MediaUrl::toPublic($relative, $request)],
            'message' => 'Image uploaded',
        ]);
    }

    /** POST /v1/feed/{id}/vote — one vote per resident, replaceable until the poll ends. */
    public function vote(Request $request, int $id): JsonResponse
    {
        $this->assertNotGuestWrite($request, 'vote_poll');

        $request->validate([
            'option_id' => 'required|integer',
        ]);

        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);
        if (! $communityId) {
            return response()->json(['message' => 'No approved community membership found.'], 422);
        }

        $post = DB::table('posts')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->where('category', 'poll')
            ->where('status', 'approved')
            ->whereNull('deleted_at')
            ->first();

        if (! $post) {
            return response()->json(['message' => 'Poll not found'], 404);
        }

        $poll = DB::table('polls')->where('post_id', $post->id)->first();
        if (! $poll) {
            return response()->json(['message' => 'Poll not found'], 404);
        }

        if (Carbon::parse($poll->ends_at)->lte(now())) {
            return response()->json(['message' => 'This poll is closed.'], 422);
        }

        $option = DB::table('poll_options')
            ->where('id', (int) $request->input('option_id'))
            ->where('poll_id', $poll->id)
            ->first();

        if (! $option) {
            return response()->json(['message' => 'That option is not part of this poll.'], 422);
        }

        $replaced = false;
        DB::transaction(function () use ($poll, $option, $user, &$replaced) {
            $existing = DB::table('poll_votes')
                ->where('poll_id', $poll->id)
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                if ((int) $existing->option_id === (int) $option->id) {
                    return;
                }

                DB::table('poll_votes')->where('id', $existing->id)->update([
                    'option_id' => $option->id,
                ]);
                $replaced = true;

                return;
            }

            try {
                DB::table('poll_votes')->insert([
                    'poll_id'    => $poll->id,
                    'option_id'  => $option->id,
                    'user_id'    => $user->id,
                    'created_at' => now(),
                ]);
            } catch (UniqueConstraintViolationException) {
                DB::table('poll_votes')
                    ->where('poll_id', $poll->id)
                    ->where('user_id', $user->id)
                    ->update(['option_id' => $option->id]);
                $replaced = true;
            }
        });

        $fresh = $this->basePostQuery($communityId)->where('posts.id', $id)->first();
        [$fresh] = $this->hydratePolls($this->hydrateEngagementCounts([$fresh]), (int) $user->id);

        return response()->json([
            'data'    => $this->formatPost($fresh, [], $user->id),
            'message' => $replaced ? 'Vote updated.' : 'Vote recorded.',
        ]);
    }

    /** DELETE /v1/feed/{id} */
    public function destroy(int $id): JsonResponse
    {
        $post = DB::table('posts')->where('id', $id)->where('user_id', auth()->id())->first();
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yours'], 403);
        }

        DB::table('posts')->where('id', $id)->update(['deleted_at' => now()]);

        ActivityLogService::user(
            'post_deleted',
            'Deleted a community post',
            'Post',
            $id,
            'info',
            null,
            ['related_item' => \Illuminate\Support\Str::limit((string) ($post->body ?? ''), 80)],
        );

        return response()->json(['message' => 'Post deleted']);
    }

    /** PUT /v1/feed/{id} — author can edit their own post */
    public function update(Request $request, int $id): JsonResponse
    {
        $this->assertNotGuestWrite($request, 'update_post');

        $request->validate([
            'body'         => 'sometimes|required_without:content|string|max:2000',
            'content'      => 'sometimes|required_without:body|string|max:2000',
            'body_es'      => 'nullable|string|max:2000',
            'body_ar'      => 'nullable|string|max:2000',
            'category'     => 'nullable|in:general,event,update,help,announcement',
            'image_url'    => 'nullable|string|max:512',
            'remove_image' => 'nullable|boolean',
        ]);

        $user = $request->user();
        $post = DB::table('posts')
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->first();

        if (! $post) {
            return response()->json(['message' => 'Post not found or not yours'], 403);
        }

        if (($post->category ?? '') === 'poll' || $request->input('category') === 'poll') {
            return response()->json(['message' => 'Polls cannot be edited.'], 422);
        }

        $data = ['updated_at' => now()];

        if ($request->has('body') || $request->has('content')) {
            $data['body'] = $request->input('body') ?? $request->input('content');
        }

        if ($request->has('body_es')) {
            $data['body_es'] = $request->input('body_es');
        }
        if ($request->has('body_ar')) {
            $data['body_ar'] = $request->input('body_ar');
        }

        if ($request->has('category')) {
            $data['category'] = $request->category ?? 'general';
        }

        if ($request->boolean('remove_image')) {
            $data['image_url'] = null;
        } elseif ($request->filled('image_url')) {
            $data['image_url'] = MediaUrl::normalize($request->image_url);
        }

        $fields = ['body', 'body_es', 'body_ar', 'category', 'image_url'];
        $before = ActivityLogService::snapshot($post, $fields);
        DB::table('posts')->where('id', $id)->update($data);
        $fresh = (object) array_merge((array) $post, $data);

        ActivityLogService::recordUpdate(
            'post_updated',
            'Post',
            $id,
            $before,
            ActivityLogService::snapshot($fresh, $fields),
            [],
            null,
            (int) $user->id,
            ['related_item' => \Illuminate\Support\Str::limit((string) ($data['body'] ?? $post->body ?? ''), 80)],
        );

        $fresh = $this->basePostQuery((int) $post->community_id)
            ->where('posts.id', $id)
            ->first();

        if ($fresh) {
            [$fresh] = $this->hydrateEngagementCounts([$fresh]);
        }

        return response()->json([
            'data'    => $fresh ? $this->formatPost($fresh, [], $user->id) : null,
            'message' => 'Post updated.',
        ]);
    }

    /** GET /v1/feed/{id} */
    public function show(int $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $query = DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->select(
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'users.role as author_role',
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
            )
            ->where('posts.id', $id)
            ->whereNull('posts.deleted_at');

        if ($communityId) {
            $query->where('posts.community_id', $communityId);
        }

        $this->excludeBlockedAuthors($query, (int) $user->id, 'posts.user_id');
        $this->excludePostsReportedByViewer($query, (int) $user->id);

        $query->where(function ($w) use ($user) {
            $w->where('posts.status', 'approved')
                ->orWhere(function ($w2) use ($user) {
                    $w2->where('posts.user_id', $user->id)
                        ->whereIn('posts.status', ['pending', 'rejected']);
                });
        });

        $post = $query->first();

        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $likedPostIds = DB::table('post_likes')
            ->where('user_id', $user->id)
            ->where('post_id', $id)
            ->pluck('post_id')
            ->all();

        [$post] = $this->hydratePolls($this->hydrateEngagementCounts([$post]), (int) $user->id);

        return response()->json([
            'data' => $this->formatPost($post, $likedPostIds, $user->id),
        ]);
    }

    /** POST /v1/feed/{id}/like */
    public function like(int $id, Request $request): JsonResponse
    {
        $post = $this->findApprovedPostForMember($id, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $userId = auth()->id();
        UserBlockService::assertCanInteract((int) $userId, (int) $post->user_id);
        $exists = DB::table('post_likes')->where('user_id', $userId)->where('post_id', $id)->exists();

        if ($exists) {
            DB::table('post_likes')->where('user_id', $userId)->where('post_id', $id)->delete();
            DB::table('posts')->where('id', $id)->decrement('likes_count');
            $liked = false;
        } else {
            DB::table('post_likes')->insert(['user_id' => $userId, 'post_id' => $id, 'created_at' => now()]);
            DB::table('posts')->where('id', $id)->increment('likes_count');
            $liked = true;
            $this->notifyPostLiked($post, $userId);
        }

        $likesCount = (int) DB::table('posts')->where('id', $id)->value('likes_count');

        ActivityLogService::user(
            $liked ? 'post_liked' : 'post_unliked',
            $liked ? 'Liked a community post' : 'Removed like from a community post',
            'Post',
            $id,
            'info',
            null,
            ['related_item' => \Illuminate\Support\Str::limit((string) ($post->body ?? ''), 80)],
        );

        return response()->json([
            'liked'       => $liked,
            'likes_count' => $likesCount,
            'message'     => $liked ? 'Post liked' : 'Post unliked',
        ]);
    }

    /** POST /v1/feed/{id}/report — resident reports a community post (does not hide content) */
    public function reportPost(int $id, Request $request): JsonResponse
    {
        $this->assertNotGuestWrite($request, 'report_post');

        $request->validate(ReportTypes::requestRules());

        $post = $this->findApprovedPostForMember($id, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $userId = (int) auth()->id();
        if ((int) $post->user_id === $userId) {
            return response()->json(['message' => 'You cannot report your own post'], 422);
        }

        if (! UserBlockService::canReportContentAuthor((int) $post->user_id, (int) $post->community_id)) {
            return response()->json(['message' => 'You cannot report posts from community admins.'], 422);
        }

        if ((bool) ($post->is_sensitive ?? false)) {
            return response()->json(['message' => 'This post is already marked as sensitive content'], 422);
        }

        $alreadyReported = DB::table('post_reports')
            ->where('post_id', $id)
            ->where('reporter_id', $userId)
            ->where('source', 'resident');
        if (Schema::hasColumn('post_reports', 'comment_id')) {
            $alreadyReported->whereNull('comment_id');
        }
        $alreadyReported = $alreadyReported->exists();

        if ($alreadyReported) {
            return response()->json(['message' => 'You have already reported this post'], 422);
        }

        [$type, $reason] = ReportTypes::resolvePayload($request);
        $queue = PostReportModeration::reviewQueueForUser((int) $post->user_id);

        $payload = [
            'post_id'     => $id,
            'reporter_id' => $userId,
            'reason'      => $reason,
            'source'      => 'resident',
            'type'        => $type,
            'created_at'  => now(),
            'updated_at'  => now(),
        ];
        if (Schema::hasColumn('post_reports', 'reported_user_id')) {
            $payload['reported_user_id'] = (int) $post->user_id;
        }
        if (Schema::hasColumn('post_reports', 'status')) {
            $payload['status'] = PostReportModeration::PENDING;
            $payload['review_queue'] = $queue;
        }

        DB::table('post_reports')->insert($payload);

        ActivityLogService::user(
            'post_reported_by_resident',
            'Reported community post #'.$id,
            'Post',
            $id,
            'warning',
            null,
            [
                'reason' => \Illuminate\Support\Str::limit($reason, 120),
                'status' => PostReportModeration::PENDING,
                'review_queue' => $queue,
            ],
        );

        PostReportModeration::notifyReviewers($post, $userId, (int) $post->user_id);

        $reportsCount = (int) DB::table('post_reports')->where('post_id', $id)->count();
        $residentReportsCount = (int) DB::table('post_reports')
            ->where('post_id', $id)
            ->where('source', 'resident')
            ->count();

        return response()->json([
            'message' => $queue === PostReportModeration::QUEUE_SYSTEM
                ? 'Report submitted. It is pending review by a system admin.'
                : 'Report submitted. It is pending review.',
            'data'    => [
                'post_id'                => $id,
                'is_sensitive'           => false,
                'status'                 => PostReportModeration::PENDING,
                'review_queue'           => $queue,
                'reports_count'          => $reportsCount,
                'resident_reports_count' => $residentReportsCount,
                'report_status'          => 'reported',
            ],
        ], 201);
    }

    /** GET /v1/feed/{id}/comments */
    public function comments(int $id, Request $request): JsonResponse
    {
        $post = $this->findApprovedPostForMember($id, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $comments = $this->commentQuery()
            ->where('post_comments.post_id', $id)
            ->whereNull('post_comments.deleted_at');
        $this->excludeBlockedAuthors($comments, (int) $request->user()->id, 'post_comments.user_id');
        $comments = $comments
            ->orderBy('post_comments.created_at')
            ->get();

        $formatted = $this->formatCommentsWithDepth($comments, $request->user()->id);

        return response()->json(['data' => $formatted]);
    }

    /** POST /v1/feed/{postId}/comments/{commentId}/like */
    public function likeComment(int $postId, int $commentId, Request $request): JsonResponse
    {
        $post = $this->findApprovedPostForMember($postId, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $comment = DB::table('post_comments')
            ->where('id', $commentId)
            ->where('post_id', $postId)
            ->whereNull('deleted_at')
            ->first();

        if (! $comment) {
            return response()->json(['message' => 'Comment not found'], 404);
        }

        $userId = auth()->id();
        UserBlockService::assertCanInteract((int) $userId, (int) $comment->user_id);
        $exists = DB::table('comment_likes')
            ->where('user_id', $userId)
            ->where('comment_id', $commentId)
            ->exists();

        if ($exists) {
            DB::table('comment_likes')
                ->where('user_id', $userId)
                ->where('comment_id', $commentId)
                ->delete();

            ActivityLogService::user(
                'comment_unliked',
                'Removed like from a comment',
                'Post',
                $postId,
                'info',
                null,
                ['related_item' => 'Comment #'.$commentId],
            );

            return response()->json([
                'liked'       => false,
                'likes_count' => (int) DB::table('comment_likes')->where('comment_id', $commentId)->count(),
                'message'     => 'Comment unliked',
            ]);
        }

        DB::table('comment_likes')->insert([
            'user_id'    => $userId,
            'comment_id' => $commentId,
            'created_at' => now(),
        ]);

        $this->notifyCommentLiked($comment, $userId);

        ActivityLogService::user(
            'comment_liked',
            'Liked a community post comment',
            'Post',
            $postId,
            'info',
            null,
            [
                'related_item' => 'Comment #'.$commentId,
                'comment_preview' => \Illuminate\Support\Str::limit((string) ($comment->body ?? ''), 80),
            ],
        );

        return response()->json([
            'liked'       => true,
            'likes_count' => (int) DB::table('comment_likes')->where('comment_id', $commentId)->count(),
            'message'     => 'Comment liked',
        ]);
    }

    /** POST /v1/feed/{id}/comments */
    public function addComment(int $id, Request $request): JsonResponse
    {
        $post = $this->findApprovedPostForMember($id, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $request->validate([
            'body'      => 'required_without:content|string|max:1000',
            'content'   => 'required_without:body|string|max:1000',
            'parent_id' => 'nullable|integer|min:1',
        ]);

        UserBlockService::assertCanInteract((int) auth()->id(), (int) $post->user_id);

        $body = $request->input('body') ?? $request->input('content');
        $parentId = $request->filled('parent_id') ? (int) $request->input('parent_id') : null;
        $parent = null;

        if ($parentId) {
            $parent = DB::table('post_comments')
                ->where('id', $parentId)
                ->where('post_id', $id)
                ->whereNull('deleted_at')
                ->first();

            if (! $parent) {
                return response()->json(['message' => 'Parent comment not found'], 422);
            }

            UserBlockService::assertCanInteract((int) auth()->id(), (int) $parent->user_id);

            $parentDepth = $this->commentDepth((int) $parent->id, (int) $id);
            if ($parentDepth >= self::MAX_COMMENT_DEPTH) {
                // Cap nesting: attach beside the deepest allowed parent (FB/IG style).
                $parentId = $parent->parent_id ? (int) $parent->parent_id : (int) $parent->id;
                $parent = DB::table('post_comments')->where('id', $parentId)->first() ?? $parent;
            }
        }

        $payload = [
            'post_id'    => $id,
            'user_id'    => auth()->id(),
            'body'       => $body,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('post_comments', 'parent_id')) {
            $payload['parent_id'] = $parentId;
        }

        $commentId = DB::table('post_comments')->insertGetId($payload);

        DB::table('posts')->where('id', $id)->increment('comments_count');

        $this->notifyPostCommented($post, auth()->id(), $body, $parent);

        ActivityLogService::user(
            'post_commented',
            $parentId ? 'Replied to a community post comment' : 'Commented on a community post',
            'Post',
            $id,
            'info',
            null,
            [
                'related_item' => \Illuminate\Support\Str::limit((string) ($post->body ?? ''), 80),
                'comment_preview' => \Illuminate\Support\Str::limit($body, 80),
                'parent_id' => $parentId,
            ],
        );

        $comment = $this->commentQuery()
            ->where('post_comments.id', $commentId)
            ->first();

        $depth = $parentId ? min($this->commentDepth($commentId, $id), self::MAX_COMMENT_DEPTH) : 0;

        return response()->json([
            'data'           => $this->formatComment($comment, auth()->id(), $depth, $parent),
            'comments_count' => (int) DB::table('posts')->where('id', $id)->value('comments_count'),
            'message'        => $parentId ? 'Reply added' : 'Comment added',
        ], 201);
    }

    /** DELETE /v1/feed/{postId}/comments/{commentId} */
    public function deleteComment(int $postId, int $commentId): JsonResponse
    {
        $comment = DB::table('post_comments')
            ->where('id', $commentId)
            ->where('post_id', $postId)
            ->where('user_id', auth()->id())
            ->first();

        if (! $comment) {
            return response()->json(['message' => 'Comment not found or not yours'], 403);
        }

        if (Schema::hasColumn('post_comments', 'parent_id')) {
            // Keep replies visible by attaching them to the deleted comment's parent.
            DB::table('post_comments')
                ->where('parent_id', $commentId)
                ->whereNull('deleted_at')
                ->update([
                    'parent_id'  => $comment->parent_id ?? null,
                    'updated_at' => now(),
                ]);
        }

        DB::table('post_comments')->where('id', $commentId)->update(['deleted_at' => now()]);
        DB::table('posts')->where('id', $postId)->decrement('comments_count');

        ActivityLogService::user(
            'comment_deleted',
            'Deleted a comment on a community post',
            'Post',
            $postId,
            'info',
            null,
            ['related_item' => 'Post #'.$postId],
        );

        return response()->json(['message' => 'Comment deleted']);
    }

    /** POST /v1/feed/{postId}/comments/{commentId}/report — resident reports a comment for admin review. */
    public function reportComment(int $postId, int $commentId, Request $request): JsonResponse
    {
        $this->assertNotGuestWrite($request, 'report_comment');

        $request->validate(ReportTypes::requestRules());

        $post = $this->findApprovedPostForMember($postId, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $comment = DB::table('post_comments')
            ->where('id', $commentId)
            ->where('post_id', $postId)
            ->whereNull('deleted_at')
            ->first();

        if (! $comment) {
            return response()->json(['message' => 'Comment not found'], 404);
        }

        $userId = (int) auth()->id();
        if ((int) $comment->user_id === $userId) {
            return response()->json(['message' => 'You cannot report your own comment'], 422);
        }

        $alreadyReported = DB::table('post_reports')
            ->where('reporter_id', $userId)
            ->where('source', 'resident');
        if (Schema::hasColumn('post_reports', 'comment_id')) {
            $alreadyReported->where('comment_id', $commentId);
        } else {
            $alreadyReported->where('post_id', $postId)->where('reason', 'like', '%comment #'.$commentId.'%');
        }
        if ($alreadyReported->exists()) {
            return response()->json(['message' => 'You have already reported this comment'], 422);
        }

        [$type, $reason] = ReportTypes::resolvePayload($request);
        $queue = PostReportModeration::reviewQueueForUser((int) $comment->user_id);

        $payload = [
            'post_id'     => $postId,
            'reporter_id' => $userId,
            'reason'      => $reason,
            'source'      => 'resident',
            'type'        => $type,
            'created_at'  => now(),
            'updated_at'  => now(),
        ];
        if (Schema::hasColumn('post_reports', 'comment_id')) {
            $payload['comment_id'] = $commentId;
        }
        if (Schema::hasColumn('post_reports', 'reported_user_id')) {
            $payload['reported_user_id'] = (int) $comment->user_id;
        }
        if (Schema::hasColumn('post_reports', 'status')) {
            $payload['status'] = PostReportModeration::PENDING;
            $payload['review_queue'] = $queue;
        }

        DB::table('post_reports')->insert($payload);

        ActivityLogService::user(
            'comment_reported_by_resident',
            'Reported community comment #'.$commentId,
            'Post',
            $postId,
            'warning',
            null,
            [
                'comment_id' => $commentId,
                'reported_user_id' => (int) $comment->user_id,
                'reason' => \Illuminate\Support\Str::limit($reason, 120),
                'status' => PostReportModeration::PENDING,
                'review_queue' => $queue,
            ],
        );

        PostReportModeration::notifyReviewers($post, $userId, (int) $comment->user_id);

        $reportsCount = (int) DB::table('post_reports')->where('post_id', $postId)->count();
        $residentReportsCount = (int) DB::table('post_reports')
            ->where('post_id', $postId)
            ->where('source', 'resident')
            ->count();

        return response()->json([
            'message' => $queue === PostReportModeration::QUEUE_SYSTEM
                ? 'Report submitted. It is pending review by a system admin.'
                : 'Report submitted. It is pending review.',
            'data'    => [
                'post_id'                => $postId,
                'comment_id'             => $commentId,
                'reported_user_id'       => (int) $comment->user_id,
                'status'                 => PostReportModeration::PENDING,
                'review_queue'           => $queue,
                'reports_count'          => $reportsCount,
                'resident_reports_count' => $residentReportsCount,
                'report_status'          => 'reported',
            ],
        ], 201);
    }

    /** GET /v1/admin/posts */
    public function adminIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityScope = $this->resolveAdminCommunityScope($user, $request);

        $query = DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'posts.community_id')
            ->select(array_merge([
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'users.role as author_role',
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
                'communities.name as community_name',
            ], $this->postReportSelectExpressions()))
            ->whereNull('posts.deleted_at');

        if ($communityScope) {
            $query->where('posts.community_id', $communityScope);
        } elseif ($request->input('community_id') !== 'all' && $request->filled('community_id')) {
            $query->where('posts.community_id', (int) $request->community_id);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('posts.status', $request->status);
        } else {
            $query->where('posts.status', 'approved');
        }

        if ($request->filled('search')) {
            $term = '%'.$request->search.'%';
            $query->where(function ($w) use ($term) {
                $w->where('posts.body', 'like', $term)
                    ->orWhere('users.name', 'like', $term)
                    ->orWhere('profiles.display_name', 'like', $term)
                    ->orWhere('communities.name', 'like', $term);
            });
        }

        $posts = $query->orderByDesc('posts.created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        $stats = $this->adminPostStats($communityScope, $request);

        $pageItems = $this->hydratePolls(
            $this->hydrateEngagementCounts($posts->items()),
            (int) $user->id,
        );

        return response()->json([
            'data' => collect($pageItems)->map(function ($p) use ($user) {
                return PostReportModeration::presentForAdmin(
                    $this->formatPost($p, [], (int) $user->id),
                    $p,
                    $user,
                );
            })->values(),
            'meta' => [
                'current_page' => $posts->currentPage(),
                'last_page'    => $posts->lastPage(),
                'total'        => $posts->total(),
                'per_page'     => $posts->perPage(),
                'stats'        => $stats,
            ],
        ]);
    }

    /** GET /v1/admin/posts/{id} — live engagement + comments for moderation view */
    public function adminShow(int $id): JsonResponse
    {
        $post = DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'posts.community_id')
            ->select(array_merge([
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'users.role as author_role',
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
                'communities.name as community_name',
            ], $this->postReportSelectExpressions()))
            ->where('posts.id', $id)
            ->whereNull('posts.deleted_at')
            ->first();

        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);

        $userId = (int) auth()->id();
        [$post] = $this->hydratePolls($this->hydrateEngagementCounts([$post]), $userId);

        $comments = $this->commentQuery()
            ->where('post_comments.post_id', $id)
            ->whereNull('post_comments.deleted_at')
            ->orderBy('post_comments.created_at')
            ->get();

        return response()->json([
            'data'     => PostReportModeration::presentForAdmin($this->formatPost($post, [], $userId), $post, auth()->user()),
            'comments' => $this->formatCommentsWithDepth($comments, $userId),
        ]);
    }

    /** PATCH /v1/admin/posts/{id}/approve */
    public function adminApprove(int $id): JsonResponse
    {
        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);

        $wasRejected = ($post->status ?? '') === 'rejected';
        $wasNotLive = ($post->status ?? '') !== 'approved';

        DB::table('posts')->where('id', $id)->update([
            'status'           => 'approved',
            'approved_by'      => auth()->id(),
            'approved_at'      => now(),
            'rejection_reason' => null,
            'updated_at'       => now(),
        ]);

        $communityName = DB::table('communities')->where('id', $post->community_id)->value('name') ?? 'your community';
        ActivityLogService::user(
            $wasRejected ? 'post_reapproved' : 'post_approved',
            ($wasRejected ? 'Re-approved' : 'Approved').' community post #'.$id,
            'Post',
            $id,
        );
        if ((int) $post->user_id !== (int) auth()->id()) {
        NotificationService::send(
            $post->user_id,
            'success',
            $wasRejected ? 'Post re-approved' : 'Post approved',
            "Your post is now live in {$communityName}.",
            $this->postCommentsActionUrl((int) $id),
            [
                'kind'    => 'post_moderation',
                'post_id' => (int) $id,
            ],
        );
        }

        if ($wasNotLive) {
            $this->notifyPostCreated(
                (int) $post->community_id,
                (int) $post->user_id,
                (int) $id,
                (string) ($post->body ?? ''),
            );
        }

        return response()->json([
            'message' => $wasRejected ? 'Post re-approved and published to the community feed' : 'Post approved and published to the community feed',
        ]);
    }

    /** PATCH /v1/admin/posts/{id}/reject */
    public function adminReject(int $id, Request $request): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:500']);

        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);

        $wasPublished = ($post->status ?? '') === 'approved';

        DB::table('posts')->where('id', $id)->update([
            'status'            => 'rejected',
            'rejection_reason'  => $request->reason,
            'approved_by'       => null,
            'approved_at'       => null,
            'updated_at'        => now(),
        ]);

        ActivityLogService::user(
            'post_rejected',
            ($wasPublished ? 'Unpublished' : 'Rejected').' community post #'.$id,
            'Post',
            $id,
            'warning',
        );
        if ((int) $post->user_id !== (int) auth()->id()) {
        NotificationService::send(
            $post->user_id,
            'warning',
            $wasPublished ? 'Post removed from feed' : 'Post not approved',
            $request->reason
                ? "Your post was not approved: {$request->reason}"
                : ($wasPublished
                    ? 'Your post was removed from the community feed by a community administrator.'
                    : 'Your post was not approved. Please review community guidelines and try again.'),
            $this->postCommentsActionUrl((int) $id),
            [
                'kind'    => 'post_moderation',
                'post_id' => (int) $id,
            ],
        );
        }

        return response()->json([
            'message' => $wasPublished ? 'Post removed from the community feed' : 'Post rejected',
        ]);
    }

    /** DELETE /v1/admin/posts/{id} — remove a live post from the community feed */
    public function adminDestroy(int $id): JsonResponse
    {
        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);
        $this->assertCanRemovePost($post);

        $actorId = (int) auth()->id();
        $reporterIds = PostReportModeration::resolveOpenReports($id, 'removed', $actorId, true);

        DB::table('posts')->where('id', $id)->update([
            'deleted_at' => now(),
            'updated_at' => now(),
        ]);

        ActivityLogService::user(
            'post_deleted',
            'Removed community post #'.$id,
            'Post',
            $id,
            'warning',
            null,
            ['resolution' => 'removed'],
        );

        PostReportModeration::notifyAuthorOfModeration($post, $actorId, 'removed');
        foreach ($reporterIds as $reporterId) {
            if ($reporterId === $actorId) {
                continue;
            }
            PostReportModeration::notifyReporter($reporterId, $id, (int) $post->community_id, 'removed');
        }

        return response()->json(['message' => 'Post deleted from the community feed']);
    }

    /** POST /v1/admin/posts/{id}/report — mark post sensitive and log admin report */
    public function adminReportPost(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|min:8|max:500',
            'type'   => ReportTypes::requestRules()['type'],
        ]);

        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);
        $this->assertCanMarkSensitive($post);

        $reporterId = (int) auth()->id();
        $reason = trim((string) $request->reason);
        $type = $request->input('type', 'other');
        $queue = PostReportModeration::reviewQueueForUser((int) $post->user_id);

        $adminReport = [
            'post_id'     => $id,
            'reporter_id' => $reporterId,
            'reason'      => $reason,
            'source'      => 'admin',
            'type'        => $type,
            'created_at'  => now(),
            'updated_at'  => now(),
        ];
        if (Schema::hasColumn('post_reports', 'status')) {
            $adminReport['status'] = PostReportModeration::RESOLVED;
            $adminReport['resolution'] = 'marked_sensitive';
            $adminReport['review_queue'] = $queue;
            $adminReport['resolved_by'] = $reporterId;
            $adminReport['resolved_at'] = now();
        }
        if (Schema::hasColumn('post_reports', 'reported_user_id')) {
            $adminReport['reported_user_id'] = (int) $post->user_id;
        }

        DB::table('post_reports')->insert($adminReport);

        DB::table('posts')->where('id', $id)->update([
            'is_sensitive' => true,
            'updated_at'   => now(),
        ]);

        $reporterIds = PostReportModeration::resolveOpenReports($id, 'marked_sensitive', $reporterId, false);

        ActivityLogService::user(
            'post_reported',
            'Marked community post #'.$id.' as sensitive content',
            'Post',
            $id,
            'warning',
            null,
            ['reason' => \Illuminate\Support\Str::limit($reason, 120)],
        );

        PostReportModeration::notifyAuthorOfModeration($post, $reporterId, 'marked_sensitive');
        foreach ($reporterIds as $residentReporterId) {
            if ($residentReporterId === $reporterId) {
                continue;
            }
            PostReportModeration::notifyReporter($residentReporterId, $id, (int) $post->community_id, 'marked_sensitive');
        }

        $reportsCount = (int) DB::table('post_reports')->where('post_id', $id)->count();
        $residentReportsCount = (int) DB::table('post_reports')
            ->where('post_id', $id)
            ->where('source', 'resident')
            ->count();

        return response()->json([
            'message' => 'Post marked as sensitive for resident app users.',
            'data'    => [
                'post_id'                => $id,
                'is_sensitive'           => true,
                'reports_count'          => $reportsCount,
                'resident_reports_count' => $residentReportsCount,
                'report_status'          => 'sensitive',
            ],
        ]);
    }

    /** GET /v1/admin/posts/{id}/reports — list reports submitted for a post */
    public function adminPostReports(int $id): JsonResponse
    {
        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);
        if (! PostReportModeration::canReview(auth()->user(), $post)) {
            return response()->json(['message' => 'Reports on community admin posts are reviewed by a system admin.'], 403);
        }

        $query = DB::table('post_reports')
            ->join('users', 'users.id', '=', 'post_reports.reporter_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'post_reports.reporter_id')
            ->select(
                'post_reports.id',
                'post_reports.post_id',
                'post_reports.reporter_id',
                'post_reports.reason',
                'post_reports.source',
                'post_reports.type',
                'post_reports.created_at',
                'users.role as reporter_role',
                DB::raw('COALESCE(profiles.display_name, users.name) as reporter_name'),
            )
            ->where('post_reports.post_id', $id)
            ->orderByDesc('post_reports.created_at');

        if (Schema::hasColumn('post_reports', 'status')) {
            $query->addSelect(
                'post_reports.status',
                'post_reports.resolution',
                'post_reports.review_queue',
                'post_reports.resolved_at',
            );
        }

        if (! AdminRoleService::isSystemAdmin(auth()->user()) && Schema::hasColumn('post_reports', 'review_queue')) {
            $query->where(function ($inner) {
                $inner->where('post_reports.review_queue', PostReportModeration::QUEUE_COMMUNITY)
                    ->orWhereNull('post_reports.review_queue');
            });
        }

        if (Schema::hasColumn('post_reports', 'comment_id')) {
            $query->leftJoin('post_comments', 'post_comments.id', '=', 'post_reports.comment_id')
                ->leftJoin('users as comment_authors', 'comment_authors.id', '=', 'post_comments.user_id')
                ->leftJoin('profiles as comment_author_profiles', 'comment_author_profiles.user_id', '=', 'post_comments.user_id')
                ->addSelect(
                    'post_reports.comment_id',
                    'post_comments.body as comment_body',
                    DB::raw('COALESCE(comment_author_profiles.display_name, comment_authors.name) as comment_author_name'),
                );
        }

        if (Schema::hasColumn('post_reports', 'reported_user_id')) {
            $query->addSelect('post_reports.reported_user_id');
        }

        $reports = $query->get();

        return response()->json([
            'data' => $reports->map(fn ($report) => [
                'id'                  => (int) $report->id,
                'post_id'             => (int) $report->post_id,
                'comment_id'          => $report->comment_id ? (int) $report->comment_id : null,
                'target'              => $report->comment_id ? 'comment' : 'post',
                'reporter_id'         => (int) $report->reporter_id,
                'reporter_name'       => $report->reporter_name,
                'reporter_role'       => $report->reporter_role,
                'reported_user_id'    => $report->reported_user_id ? (int) $report->reported_user_id : null,
                'comment_author_name' => $report->comment_author_name,
                'comment_body'        => $report->comment_body,
                'source'              => $report->source ?? 'resident',
                'type'                => $report->type,
                'status'              => $report->status ?? PostReportModeration::PENDING,
                'resolution'          => $report->resolution ?? null,
                'review_queue'        => $report->review_queue ?? PostReportModeration::QUEUE_COMMUNITY,
                'reason'              => $report->reason,
                'created_at'          => $this->formatTimestamp($report->created_at),
                'resolved_at'         => isset($report->resolved_at) && $report->resolved_at
                    ? $this->formatTimestamp($report->resolved_at)
                    : null,
            ])->values(),
            'meta' => [
                'total' => $reports->count(),
            ],
        ]);
    }

    /** POST /v1/admin/posts/{id}/reports/{reportId}/dismiss */
    public function adminDismissPostReport(int $id, int $reportId): JsonResponse
    {
        $post = $this->findPostForAdmin($id);
        if (! $post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $this->assertCanModeratePost($post);
        if (! PostReportModeration::canReview(auth()->user(), $post)) {
            return response()->json(['message' => 'Reports on community admin posts are reviewed by a system admin.'], 403);
        }

        $report = DB::table('post_reports')
            ->where('id', $reportId)
            ->where('post_id', $id)
            ->first();

        if (! $report) {
            return response()->json(['message' => 'Report not found'], 404);
        }

        if (Schema::hasColumn('post_reports', 'review_queue')
            && ($report->review_queue ?? PostReportModeration::QUEUE_COMMUNITY) === PostReportModeration::QUEUE_SYSTEM
            && ! AdminRoleService::isSystemAdmin(auth()->user())) {
            return response()->json(['message' => 'Reports on community admin posts are reviewed by a system admin.'], 403);
        }

        $status = $report->status ?? PostReportModeration::PENDING;
        if ($status !== PostReportModeration::PENDING) {
            return response()->json(['message' => 'This report has already been reviewed.'], 422);
        }

        if (Schema::hasColumn('post_reports', 'status')) {
            DB::table('post_reports')->where('id', $reportId)->update([
                'status'      => PostReportModeration::DISMISSED,
                'resolution'  => 'dismissed',
                'resolved_by' => (int) auth()->id(),
                'resolved_at' => now(),
                'updated_at'  => now(),
            ]);
        }

        ActivityLogService::user(
            'post_report_dismissed',
            'Dismissed report #'.$reportId.' on post #'.$id,
            'Post',
            $id,
            'info',
            null,
            [
                'report_id' => $reportId,
                'resolution' => 'dismissed',
            ],
        );

        PostReportModeration::notifyReporter(
            (int) $report->reporter_id,
            $id,
            (int) $post->community_id,
            'dismissed',
        );

        return response()->json([
            'message' => 'Report dismissed. The post was not changed.',
            'data' => [
                'report_id' => $reportId,
                'status' => PostReportModeration::DISMISSED,
                'post_status' => $post->status ?? 'approved',
                'is_sensitive' => (bool) ($post->is_sensitive ?? false),
            ],
        ]);
    }

    /** @return array<int, \Illuminate\Database\Query\Expression|string> */
    private function postReportSelectExpressions(): array
    {
        if (! Schema::hasTable('post_reports')) {
            return [
                DB::raw('0 as reports_count'),
                DB::raw('0 as resident_reports_count'),
            ];
        }

        $expressions = [
            DB::raw('(SELECT COUNT(*) FROM post_reports WHERE post_reports.post_id = posts.id) as reports_count'),
        ];

        if (Schema::hasColumn('post_reports', 'source')) {
            $pending = Schema::hasColumn('post_reports', 'status')
                ? " AND (post_reports.status = 'pending_review' OR post_reports.status IS NULL)"
                : '';
            $expressions[] = DB::raw("(SELECT COUNT(*) FROM post_reports WHERE post_reports.post_id = posts.id AND post_reports.source = 'resident'{$pending}) as resident_reports_count");
        } else {
            // Fallback before source column migration: treat non-sensitive report counts as resident reports.
            $expressions[] = DB::raw('(SELECT COUNT(*) FROM post_reports WHERE post_reports.post_id = posts.id) as resident_reports_count');
        }

        return $expressions;
    }

    private function adminPostStats(?int $communityScope, Request $request): array
    {
        $statsQuery = DB::table('posts')->whereNull('deleted_at');

        if ($communityScope) {
            $statsQuery->where('community_id', $communityScope);
        } elseif ($request->input('community_id') !== 'all' && $request->filled('community_id')) {
            $statsQuery->where('community_id', (int) $request->community_id);
        }

        $publishedQuery = (clone $statsQuery)->where('status', 'approved');
        $published = (clone $publishedQuery)->count();

        $sensitive = 0;
        $reported = 0;

        if (Schema::hasColumn('posts', 'is_sensitive')) {
            $sensitive = (clone $publishedQuery)->where('is_sensitive', true)->count();
        }

        if (Schema::hasTable('post_reports')) {
            $reportedQuery = (clone $publishedQuery);

            if (Schema::hasColumn('posts', 'is_sensitive')) {
                $reportedQuery->where(function ($q) {
                    $q->where('is_sensitive', false)->orWhereNull('is_sensitive');
                });
            }

            $reportedQuery->whereExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('post_reports')
                    ->whereColumn('post_reports.post_id', 'posts.id');

                if (Schema::hasColumn('post_reports', 'source')) {
                    $q->where('post_reports.source', 'resident');
                }
                if (Schema::hasColumn('post_reports', 'status')) {
                    $q->where(function ($inner) {
                        $inner->where('post_reports.status', PostReportModeration::PENDING)
                            ->orWhereNull('post_reports.status');
                    });
                }
            });

            if (! AdminRoleService::isSystemAdmin($request->user())) {
                $reportedQuery->whereNotExists(function ($q) {
                    $q->select(DB::raw(1))
                        ->from('users')
                        ->whereColumn('users.id', 'posts.user_id')
                        ->whereIn('users.role', ['community_admin', 'system_admin', 'admin']);
                });
            }

            $reported = $reportedQuery->count();
        }

        return [
            'total'     => (int) $published,
            'pending'   => 0,
            'approved'  => (int) $published,
            'rejected'  => 0,
            'sensitive' => (int) $sensitive,
            'reported'  => (int) $reported,
        ];
    }

    private function resolveAdminCommunityScope($user, Request $request): ?int
    {
        return AdminRoleService::resolveAdminCommunityScope($user, $request);
    }

    private function findPostForAdmin(int $id): ?object
    {
        return DB::table('posts')->where('id', $id)->whereNull('deleted_at')->first();
    }

    private function assertCanModeratePost(object $post): void
    {
        $user = auth()->user();
        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }

        if (! AdminRoleService::canManageCommunity($user, (int) $post->community_id)) {
            abort(403, 'You cannot moderate posts in this community');
        }
    }

    private function assertCanRemovePost(object $post): void
    {
        $user = auth()->user();
        if (PostReportModeration::canReview($user, $post)) {
            return;
        }

        $isAuthor = (int) $post->user_id === (int) ($user->id ?? 0);
        if ($isAuthor && PostReportModeration::pendingCount((int) $post->id) === 0) {
            return;
        }

        abort(403, 'Reports on community admin posts are reviewed by a system admin.');
    }

    private function assertCanMarkSensitive(object $post): void
    {
        $user = auth()->user();
        if ((bool) ($post->is_sensitive ?? false)) {
            abort(422, 'This post is already marked as sensitive content');
        }

        if (PostReportModeration::canReview($user, $post)) {
            return;
        }

        $isAuthor = (int) $post->user_id === (int) ($user->id ?? 0);
        if ($isAuthor && PostReportModeration::pendingCount((int) $post->id) === 0) {
            return;
        }

        abort(403, 'Reports on community admin posts are reviewed by a system admin.');
    }

    private function findApprovedPostForMember(int $id, ?Request $request = null): ?object
    {
        $user = auth()->user();
        $communityId = $request ? $this->resolveCommunityId($request, $user) : null;

        $query = DB::table('posts')
            ->where('posts.id', $id)
            ->where('posts.status', 'approved')
            ->whereNull('posts.deleted_at');

        if ($communityId) {
            $query->where('posts.community_id', $communityId);
        } else {
            $approvedCommunityIds = $user->memberships()
                ->where('status', 'approved')
                ->pluck('community_id')
                ->all();
            if ($approvedCommunityIds === []) {
                return null;
            }
            $query->whereIn('posts.community_id', $approvedCommunityIds);
        }

        $post = $query->first();
        if ($post && $user && in_array((int) $post->user_id, UserBlockService::hiddenAuthorIdsFor((int) $user->id), true)) {
            return null;
        }

        return $post;
    }

    private function excludeBlockedAuthors($query, int $viewerId, string $authorColumn): void
    {
        $hiddenIds = UserBlockService::hiddenAuthorIdsFor($viewerId);
        if ($hiddenIds !== []) {
            $query->whereNotIn($authorColumn, $hiddenIds);
        }
    }

    /** A resident who reported a post no longer sees it. Other members still do. */
    private function excludePostsReportedByViewer($query, int $viewerId): void
    {
        if (! Schema::hasTable('post_reports')) {
            return;
        }

        $query->whereNotExists(function ($hidden) use ($viewerId) {
            $hidden->select(DB::raw(1))
                ->from('post_reports')
                ->whereColumn('post_reports.post_id', 'posts.id')
                ->where('post_reports.reporter_id', $viewerId);

            if (Schema::hasColumn('post_reports', 'source')) {
                $hidden->where('post_reports.source', 'resident');
            }
            if (Schema::hasColumn('post_reports', 'comment_id')) {
                $hidden->whereNull('post_reports.comment_id');
            }
        });
    }

    private function basePostQuery(int $communityId)
    {
        return DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->select(
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'users.role as author_role',
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
            )
            ->where('posts.community_id', $communityId)
            ->whereNull('posts.deleted_at');
    }

    private function formatPost(object $post, array $likedPostIds, int $userId): array
    {
        $categoryLabels = collect(self::TOPICS)->pluck('label', 'id');
        $categoryLabels->put('poll', 'Poll');
        $isSensitive = (bool) ($post->is_sensitive ?? false);
        $body = $post->body;
        $reportsCount = isset($post->reports_count) ? (int) $post->reports_count : null;
        $residentReportsCount = isset($post->resident_reports_count)
            ? (int) $post->resident_reports_count
            : null;
        if ($isSensitive) {
            $reportStatus = 'sensitive';
        } elseif (($residentReportsCount ?? 0) > 0) {
            $reportStatus = 'reported';
        } else {
            $reportStatus = 'published';
        }

        return [
            'id'             => (int) $post->id,
            'community_id'   => (int) $post->community_id,
            'community_name' => $post->community_name ?? null,
            'user_id'        => (int) $post->user_id,
            'author_role'    => $post->author_role ?? null,
            'can_block'      => UserBlockService::canBlock($userId, (int) $post->user_id, isset($post->community_id) ? (int) $post->community_id : null),
            'can_report'     => UserBlockService::canReportContentAuthor((int) $post->user_id, isset($post->community_id) ? (int) $post->community_id : null),
            'body'           => $body,
            'body_es'        => $post->body_es ?? null,
            'body_ar'        => $post->body_ar ?? null,
            'content'        => $body,
            'category'       => $post->category,
            'status'         => $post->status ?? 'approved',
            'is_sensitive'   => $isSensitive,
            'sensitive_message' => $isSensitive
                ? 'This post has been reported and hidden due to community guidelines.'
                : null,
            'reports_count'  => $reportsCount,
            'resident_reports_count' => $residentReportsCount,
            'report_status'  => $reportStatus,
            'tag'            => $categoryLabels[$post->category] ?? ucfirst($post->category),
            'image_url'      => MediaUrl::toPublic($post->image_url, request()),
            'likes_count'    => (int) $post->likes_count,
            'comments_count' => (int) $post->comments_count,
            'likes'          => (int) $post->likes_count,
            'comments'       => (int) $post->comments_count,
            'created_at'     => $this->formatTimestamp($post->created_at),
            'updated_at'     => $this->formatTimestamp($post->updated_at),
            'author_name'    => $post->author_name,
            'author_avatar'  => MediaUrl::toPublic($post->author_avatar ?? null, request()),
            'author_unit'    => $post->author_unit,
            'user'           => [
                'id'           => (int) $post->user_id,
                'name'         => $post->author_name,
                'display_name' => $post->author_name,
                'role'         => $post->author_role ?? null,
                'avatar'       => MediaUrl::toPublic($post->author_avatar ?? null, request()),
                'location'     => $post->author_unit ? 'Unit '.$post->author_unit : null,
            ],
            'liked_by_me'    => in_array($post->id, $likedPostIds, true),
            'is_mine'        => (int) $post->user_id === $userId,
            'poll'           => ($post->category ?? '') === 'poll' ? ($post->poll_view ?? null) : null,
        ];
    }

    private function formatComment(
        object $comment,
        ?int $userId = null,
        int $depth = 0,
        ?object $parent = null,
    ): array {
        $avatar = MediaUrl::toPublic($comment->author_avatar ?? null, request());
        $parentId = isset($comment->parent_id) && $comment->parent_id !== null
            ? (int) $comment->parent_id
            : null;

        $parentAuthorName = null;
        if ($parent) {
            $parentAuthorName = $this->actorDisplayName((int) $parent->user_id);
        } elseif ($parentId) {
            $parentUserId = (int) (DB::table('post_comments')->where('id', $parentId)->value('user_id') ?? 0);
            if ($parentUserId > 0) {
                $parentAuthorName = $this->actorDisplayName($parentUserId);
            }
        }

        $likesCount = (int) DB::table('comment_likes')->where('comment_id', $comment->id)->count();
        $likedByMe = $userId !== null && DB::table('comment_likes')
            ->where('comment_id', $comment->id)
            ->where('user_id', $userId)
            ->exists();

        return [
            'id'                 => (int) $comment->id,
            'post_id'            => (int) $comment->post_id,
            'parent_id'          => $parentId,
            'depth'              => max(0, min($depth, self::MAX_COMMENT_DEPTH)),
            'user_id'            => (int) $comment->user_id,
            'body'               => $comment->body,
            'content'            => $comment->body,
            'created_at'         => $this->formatTimestamp($comment->created_at),
            'author_name'        => $comment->author_name,
            'author_avatar'      => $avatar,
            'parent_author_name' => $parentAuthorName,
            'likes_count'        => $likesCount,
            'liked_by_me'        => $likedByMe,
            'is_mine'            => $userId !== null && (int) $comment->user_id === $userId,
            'user'               => [
                'id'           => (int) $comment->user_id,
                'name'         => $comment->author_name,
                'display_name' => $comment->author_name,
                'avatar'       => $avatar,
            ],
        ];
    }

    private function commentQuery()
    {
        return DB::table('post_comments')
            ->join('users', 'users.id', '=', 'post_comments.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'post_comments.user_id')
            ->select(
                'post_comments.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'users.role as author_role',
                'profiles.avatar_url as author_avatar',
            );
    }

    /**
     * Flat list ordered for threaded display: parents first, then replies under them.
     *
     * @param  \Illuminate\Support\Collection<int, object>  $comments
     * @return list<array<string, mixed>>
     */
    private function formatCommentsWithDepth($comments, int $userId): array
    {
        $byId = [];
        foreach ($comments as $comment) {
            $byId[(int) $comment->id] = $comment;
        }

        $children = [];
        foreach ($comments as $comment) {
            $parentId = isset($comment->parent_id) && $comment->parent_id !== null
                ? (int) $comment->parent_id
                : null;
            if ($parentId && isset($byId[$parentId])) {
                $children[$parentId][] = $comment;
            }
        }

        $ordered = [];
        $walk = function (object $comment, int $depth) use (&$walk, &$ordered, $children, $userId, $byId): void {
            $parent = isset($comment->parent_id) && isset($byId[(int) $comment->parent_id])
                ? $byId[(int) $comment->parent_id]
                : null;
            $ordered[] = $this->formatComment($comment, $userId, $depth, $parent);
            foreach ($children[(int) $comment->id] ?? [] as $child) {
                $walk($child, min($depth + 1, self::MAX_COMMENT_DEPTH));
            }
        };

        foreach ($comments as $comment) {
            $parentId = isset($comment->parent_id) && $comment->parent_id !== null
                ? (int) $comment->parent_id
                : null;
            if (! $parentId || ! isset($byId[$parentId])) {
                $walk($comment, 0);
            }
        }

        return $ordered;
    }

    private function commentDepth(int $commentId, int $postId): int
    {
        if (! Schema::hasColumn('post_comments', 'parent_id')) {
            return 0;
        }

        $depth = 0;
        $currentId = $commentId;
        $guard = 0;

        while ($guard < 20) {
            $parentId = DB::table('post_comments')
                ->where('id', $currentId)
                ->where('post_id', $postId)
                ->value('parent_id');

            if (! $parentId) {
                break;
            }

            $depth++;
            $currentId = (int) $parentId;
            $guard++;
        }

        return $depth;
    }

    private function resolveCommunityId(Request $request, User $user): ?int
    {
        $approvedIds = $user->memberships()
            ->where('status', 'approved')
            ->pluck('community_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($approvedIds === []) {
            return null;
        }

        if ($request->filled('community_id')) {
            $id = (int) $request->community_id;
            if (in_array($id, $approvedIds, true)) {
                return $id;
            }
        }

        $header = $request->header('X-Community-Id');
        if ($header) {
            $id = (int) $header;
            if (in_array($id, $approvedIds, true)) {
                return $id;
            }
        }

        $current = UserActingContextService::currentCommunityId($user);
        if ($current && in_array($current, $approvedIds, true)) {
            return $current;
        }

        return $approvedIds[0] ?? null;
    }

    private function formatTimestamp(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        return Carbon::parse($value)->toIso8601String();
    }

    /**
     * Replace denormalized likes/comments counters with live row counts
     * (and heal stale counters written by older seed data).
     *
     * @param  iterable<object>  $posts
     * @return list<object>
     */
    private function hydrateEngagementCounts(iterable $posts): array
    {
        $items = collect($posts)->values();
        if ($items->isEmpty()) {
            return [];
        }

        $ids = $items->pluck('id')->map(fn ($id) => (int) $id)->all();

        $likeCounts = DB::table('post_likes')
            ->select('post_id', DB::raw('COUNT(*) as aggregate'))
            ->whereIn('post_id', $ids)
            ->groupBy('post_id')
            ->pluck('aggregate', 'post_id');

        $commentCounts = DB::table('post_comments')
            ->select('post_id', DB::raw('COUNT(*) as aggregate'))
            ->whereIn('post_id', $ids)
            ->whereNull('deleted_at')
            ->groupBy('post_id')
            ->pluck('aggregate', 'post_id');

        $stale = [];

        foreach ($items as $post) {
            $id = (int) $post->id;
            $likes = (int) ($likeCounts[$id] ?? 0);
            $comments = (int) ($commentCounts[$id] ?? 0);

            if ((int) ($post->likes_count ?? 0) !== $likes || (int) ($post->comments_count ?? 0) !== $comments) {
                $stale[$id] = ['likes_count' => $likes, 'comments_count' => $comments];
            }

            $post->likes_count = $likes;
            $post->comments_count = $comments;
        }

        foreach ($stale as $postId => $counts) {
            DB::table('posts')->where('id', $postId)->update($counts);
        }

        return $items->all();
    }

    /**
     * @param  list<mixed>  $options
     * @return list<string>
     */
    private function normalizePollOptions(array $options): array
    {
        $labels = [];
        $seen = [];
        foreach ($options as $option) {
            $label = trim((string) $option);
            if ($label === '') {
                continue;
            }
            $key = mb_strtolower($label);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $labels[] = $label;
            if (count($labels) === 4) {
                break;
            }
        }

        return $labels;
    }

    /**
     * @param  iterable<object>  $posts
     * @return list<object>
     */
    private function hydratePolls(iterable $posts, int $userId): array
    {
        $items = collect($posts)->filter()->values();
        if ($items->isEmpty()) {
            return [];
        }

        $pollPostIds = $items
            ->filter(fn ($post) => ($post->category ?? '') === 'poll')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($pollPostIds === []) {
            return $items->all();
        }

        $polls = DB::table('polls')->whereIn('post_id', $pollPostIds)->get()->keyBy('post_id');
        $pollIds = $polls->pluck('id')->map(fn ($id) => (int) $id)->all();
        $options = $pollIds === []
            ? collect()
            : DB::table('poll_options')->whereIn('poll_id', $pollIds)->orderBy('position')->orderBy('id')->get()->groupBy('poll_id');
        $votes = $pollIds === []
            ? collect()
            : DB::table('poll_votes')->whereIn('poll_id', $pollIds)->get();
        $votesByPoll = $votes->groupBy('poll_id');
        $myVoteByPoll = $votes->where('user_id', $userId)->keyBy('poll_id');

        foreach ($items as $post) {
            if (($post->category ?? '') !== 'poll') {
                continue;
            }
            $poll = $polls->get($post->id);
            if (! $poll) {
                $post->poll_view = null;
                continue;
            }
            $pollOptions = $options->get($poll->id, collect())->values();
            $pollVotes = $votesByPoll->get($poll->id, collect());
            $counts = [];
            foreach ($pollOptions as $option) {
                $counts[] = $pollVotes->where('option_id', $option->id)->count();
            }
            $total = array_sum($counts);
            $closed = Carbon::parse($poll->ends_at)->lte(now());
            $myVote = $myVoteByPoll->get($poll->id);
            $resultsVisible = $closed || $myVote !== null;
            $percents = $resultsVisible ? $this->votePercents($counts, $total) : [];

            $post->poll_view = [
                'question'         => $poll->question,
                'description'      => $poll->description,
                'duration_days'    => (int) $poll->duration_days,
                'ends_at'          => $this->formatTimestamp($poll->ends_at),
                'closed'           => $closed,
                'results_visible'  => $resultsVisible,
                'total_votes'      => $resultsVisible ? $total : null,
                'voted_option_id'  => $myVote ? (int) $myVote->option_id : null,
                'options'          => $pollOptions->values()->map(function ($option, $index) use ($resultsVisible, $counts, $percents) {
                    $row = [
                        'id'    => (int) $option->id,
                        'label' => $option->label,
                    ];
                    if ($resultsVisible) {
                        $row['votes'] = (int) ($counts[$index] ?? 0);
                        $row['percent'] = (int) ($percents[$index] ?? 0);
                    }

                    return $row;
                })->all(),
            ];
        }

        return $items->all();
    }

    /**
     * @param  list<int>  $counts
     * @return list<int>
     */
    private function votePercents(array $counts, int $total): array
    {
        $count = count($counts);
        if ($count === 0 || $total <= 0) {
            return array_fill(0, $count, 0);
        }

        $floors = [];
        $remainders = [];
        $sum = 0;
        foreach ($counts as $index => $votes) {
            $exact = ($votes / $total) * 100;
            $floors[$index] = (int) floor($exact);
            $remainders[$index] = $exact - $floors[$index];
            $sum += $floors[$index];
        }

        $left = 100 - $sum;
        arsort($remainders);
        foreach (array_keys($remainders) as $index) {
            if ($left <= 0) {
                break;
            }
            $floors[$index]++;
            $left--;
        }

        ksort($floors);

        return array_values($floors);
    }

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('posts', 'public');

        return Storage::url($path);
    }

    private function notifyPostCreated(int $communityId, int $authorId, int $postId, string $body): void
    {
        $excludeIds = array_values(array_unique(array_filter([
            $authorId,
            (int) (auth()->id() ?? 0),
        ])));

        $recipientIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->whereNotIn('user_id', $excludeIds)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        if ($recipientIds->isEmpty()) {
            return;
        }

        $actorName = $this->actorDisplayName($authorId);
        $snippet = $this->truncateNotificationText($body, 80);
        $actionUrl = $this->postCommentsActionUrl($postId);
        $notificationBody = $snippet !== ''
            ? "{$actorName} shared a new post: \"{$snippet}\""
            : "{$actorName} shared a new post in your community.";

        foreach ($recipientIds as $recipientId) {
            NotificationService::send(
                $recipientId,
                'info',
                'New community post',
                $notificationBody,
                $actionUrl,
                [
                    'kind'       => 'post_created',
                    'post_id'    => $postId,
                    'actor_id'   => $authorId,
                    'actor_name' => $actorName,
                ],
            );
        }
    }

    private function notifyPostLiked(object $post, int $actorUserId): void
    {
        $recipientId = (int) $post->user_id;
        if ($recipientId === $actorUserId) {
            return;
        }

        $postId = (int) $post->id;
        $actorName = $this->actorDisplayName($actorUserId);
        $actionUrl = $this->postCommentsActionUrl($postId);

        $existing = DB::table('app_notifications')
            ->where('user_id', $recipientId)
            ->whereNull('read_at')
            ->where('action_url', $actionUrl)
            ->where('title', 'Post reaction')
            ->where('created_at', '>=', now()->subDays(7))
            ->orderByDesc('id')
            ->first();

        if ($existing) {
            $data = json_decode($existing->data ?? '{}', true);
            $data = is_array($data) ? $data : [];
            $actorNames = array_values(array_unique(array_merge(
                $data['actor_names'] ?? [],
                [$actorName],
            )));
            $body = $this->formatLikeNotificationBody($actorNames);
            $payload = [
                'kind'        => 'post_like',
                'post_id'     => $postId,
                'actor_names' => array_slice($actorNames, -10),
                'actor_name'  => $actorName,
            ];

            DB::table('app_notifications')->where('id', $existing->id)->update([
                'body'       => $body,
                'data'       => json_encode($payload),
                'updated_at' => now(),
            ]);

            // Keep inbox aggregated, but still push so later likes are not silent.
            $this->pushEngagementNotification($recipientId, 'Post reaction', $body, $actionUrl, $payload);

            return;
        }

        NotificationService::send(
            $recipientId,
            'info',
            'Post reaction',
            "{$actorName} liked your post.",
            $actionUrl,
            [
                'kind'        => 'post_like',
                'post_id'     => $postId,
                'actor_names' => [$actorName],
                'actor_name'  => $actorName,
            ],
        );
    }

    private function notifyCommentLiked(object $comment, int $actorUserId): void
    {
        $commentOwnerId = (int) $comment->user_id;
        if ($commentOwnerId === $actorUserId) {
            return;
        }

        $commentId = (int) $comment->id;
        $postId = (int) $comment->post_id;
        $actorName = $this->actorDisplayName($actorUserId);
        $actionUrl = $this->postCommentsActionUrl($postId);

        NotificationService::send(
            $commentOwnerId,
            'info',
            'Comment reaction',
            "{$actorName} liked your comment.",
            $actionUrl,
            [
                'kind'        => 'comment_like',
                'post_id'     => $postId,
                'comment_id'  => $commentId,
                'actor_id'    => $actorUserId,
                'actor_name'  => $actorName,
            ],
        );
    }

    private function notifyPostCommented(object $post, int $actorUserId, string $commentBody, ?object $parent = null): void
    {
        $postId = (int) $post->id;
        $authorId = (int) $post->user_id;
        $actorName = $this->actorDisplayName($actorUserId);
        $snippet = $this->truncateNotificationText($commentBody, 80);
        $actionUrl = $this->postCommentsActionUrl($postId);

        if ($parent) {
            $parentAuthorId = (int) $parent->user_id;
            $recipients = collect([$parentAuthorId, $authorId])
                ->unique()
                ->reject(fn ($id) => (int) $id === $actorUserId)
                ->values();

            foreach ($recipients as $recipientId) {
                $isParentAuthor = (int) $recipientId === $parentAuthorId;
                if ($isParentAuthor) {
                    $title = 'New reply';
                    $body = $snippet !== ''
                        ? "{$actorName} replied to your comment: \"{$snippet}\""
                        : "{$actorName} replied to your comment.";
                    $kind = 'post_comment_reply';
                } else {
                    $title = 'New comment';
                    $body = $snippet !== ''
                        ? "{$actorName} replied on your post: \"{$snippet}\""
                        : "{$actorName} replied on your post.";
                    $kind = 'post_comment';
                }

                NotificationService::send(
                    (int) $recipientId,
                    'info',
                    $title,
                    $body,
                    $actionUrl,
                    [
                        'kind'              => $kind,
                        'post_id'           => $postId,
                        'parent_comment_id' => (int) $parent->id,
                        'actor_id'          => $actorUserId,
                        'actor_name'        => $actorName,
                    ],
                );
            }

            return;
        }

        $priorCommenterIds = DB::table('post_comments')
            ->where('post_id', $postId)
            ->whereNull('deleted_at')
            ->where('user_id', '!=', $actorUserId)
            ->when(
                Schema::hasColumn('post_comments', 'parent_id'),
                fn ($q) => $q->whereNull('parent_id'),
            )
            ->distinct()
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $recipientIds = collect([$authorId, ...$priorCommenterIds])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->reject(fn ($id) => $id === $actorUserId)
            ->values();

        foreach ($recipientIds as $recipientId) {
            $isAuthor = $recipientId === $authorId;
            $body = $isAuthor
                ? ($snippet !== ''
                    ? "{$actorName} commented on your post: \"{$snippet}\""
                    : "{$actorName} commented on your post.")
                : ($snippet !== ''
                    ? "{$actorName} also commented: \"{$snippet}\""
                    : "{$actorName} also commented on a post you commented on.");

            NotificationService::send(
                $recipientId,
                'info',
                'New comment',
                $body,
                $actionUrl,
                [
                    'kind'       => 'post_comment',
                    'post_id'    => $postId,
                    'actor_id'   => $actorUserId,
                    'actor_name' => $actorName,
                ],
            );
        }
    }

    private function pushEngagementNotification(
        int $userId,
        string $title,
        string $body,
        string $actionUrl,
        array $data,
    ): void {
        $pushData = array_merge($data, [
            'type'       => 'info',
            'action_url' => $actionUrl,
            'actionUrl'  => $actionUrl,
        ]);

        try {
            PushNotificationService::sendToUser($userId, $title, $body, $pushData);
        } catch (\Throwable $e) {
            // Push failures should never block engagement writes.
        }

        try {
            FcmNotificationService::sendToUser($userId, $title, $body, $pushData);
        } catch (\Throwable $e) {
            // Same for FCM.
        }
    }

    private function formatLikeNotificationBody(array $actorNames): string
    {
        $names = array_values(array_filter($actorNames));
        $count = count($names);

        if ($count === 0) {
            return 'Someone liked your post.';
        }

        if ($count === 1) {
            return "{$names[0]} liked your post.";
        }

        if ($count === 2) {
            return "{$names[0]} and {$names[1]} liked your post.";
        }

        $others = $count - 1;

        return "{$names[0]} and {$others} others liked your post.";
    }

    private function actorDisplayName(int $userId): string
    {
        $row = DB::table('users')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.id', $userId)
            ->select(
                'users.name',
                'profiles.display_name',
            )
            ->first();

        $name = trim((string) ($row->display_name ?? $row->name ?? ''));

        return $name !== '' ? $name : 'Someone';
    }

    private function postCommentsActionUrl(int $postId): string
    {
        return "/screens/community-feed/comments?postId={$postId}";
    }

    private function truncateNotificationText(string $text, int $maxLength): string
    {
        $clean = trim(preg_replace('/\s+/', ' ', $text) ?? '');

        if ($clean === '') {
            return '';
        }

        if (mb_strlen($clean) <= $maxLength) {
            return $clean;
        }

        return rtrim(mb_substr($clean, 0, $maxLength - 1)).'…';
    }
}
