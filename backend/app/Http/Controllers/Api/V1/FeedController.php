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
use App\Services\PushNotificationService;
use App\Support\MediaUrl;
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

        $query = $this->basePostQuery($communityId)
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

        $pageItems = $this->hydrateEngagementCounts($posts->items());
        $items = collect($pageItems)->map(fn ($p) => $this->formatPost($p, $likedPostIds, $user->id));

        if (\App\Services\GuestAccessService::isGuest($user)) {
            \App\Services\GuestActivityService::logView($user, 'feed');
        }

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
            'body'       => 'required_without:content|string|max:2000',
            'content'    => 'required_without:body|string|max:2000',
            'category'   => 'nullable|in:general,event,update,help,announcement',
            'image_url'  => 'nullable|string|max:512',
        ]);

        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json(['message' => 'No approved community membership found.'], 422);
        }

        $body = $request->input('body') ?? $request->input('content');

        $id = DB::table('posts')->insertGetId([
            'community_id'   => $communityId,
            'user_id'        => $user->id,
            'body'           => $body,
            'category'       => $request->category ?? 'general',
            'image_url'      => MediaUrl::normalize($request->image_url),
            'status'         => 'approved',
            'approved_by'    => $user->id,
            'approved_at'    => now(),
            'likes_count'    => 0,
            'comments_count' => 0,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        ActivityLogService::user(
            'post_created',
            'Published a community post',
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

        return response()->json([
            'data'    => $this->formatPost($post, [], $user->id),
            'message' => 'Post published to your community feed.',
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

        $data = ['updated_at' => now()];

        if ($request->has('body') || $request->has('content')) {
            $data['body'] = $request->input('body') ?? $request->input('content');
        }

        if ($request->has('category')) {
            $data['category'] = $request->category ?? 'general';
        }

        if ($request->boolean('remove_image')) {
            $data['image_url'] = null;
        } elseif ($request->filled('image_url')) {
            $data['image_url'] = MediaUrl::normalize($request->image_url);
        }

        DB::table('posts')->where('id', $id)->update($data);

        ActivityLogService::user(
            'post_updated',
            'Updated a community post',
            'Post',
            $id,
            'info',
            null,
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
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
            )
            ->where('posts.id', $id)
            ->whereNull('posts.deleted_at');

        if ($communityId) {
            $query->where('posts.community_id', $communityId);
        }

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

        [$post] = $this->hydrateEngagementCounts([$post]);

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

    /** GET /v1/feed/{id}/comments */
    public function comments(int $id, Request $request): JsonResponse
    {
        $post = $this->findApprovedPostForMember($id, $request);
        if (! $post) {
            return response()->json(['message' => 'Post not found or not yet approved'], 404);
        }

        $comments = $this->commentQuery()
            ->where('post_comments.post_id', $id)
            ->whereNull('post_comments.deleted_at')
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

    /** GET /v1/admin/posts */
    public function adminIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityScope = $this->resolveAdminCommunityScope($user, $request);

        $query = DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->leftJoin('communities', 'communities.id', '=', 'posts.community_id')
            ->select(
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
                'communities.name as community_name',
            )
            ->whereNull('posts.deleted_at');

        if ($communityScope) {
            $query->where('posts.community_id', $communityScope);
        } elseif ($request->input('community_id') !== 'all' && $request->filled('community_id')) {
            $query->where('posts.community_id', (int) $request->community_id);
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('posts.status', $request->status);
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

        $stats = [
            'total'    => (int) DB::table('posts')->whereNull('deleted_at')->count(),
            'pending'  => (int) DB::table('posts')->whereNull('deleted_at')->where('status', 'pending')->count(),
            'approved' => (int) DB::table('posts')->whereNull('deleted_at')->where('status', 'approved')->count(),
            'rejected' => (int) DB::table('posts')->whereNull('deleted_at')->where('status', 'rejected')->count(),
        ];

        $pageItems = $this->hydrateEngagementCounts($posts->items());

        return response()->json([
            'data' => collect($pageItems)->map(fn ($p) => $this->formatPost($p, [], auth()->id()))->values(),
            'meta' => [
                'current_page' => $posts->currentPage(),
                'last_page'    => $posts->lastPage(),
                'total'        => $posts->total(),
                'per_page'     => $posts->perPage(),
                'stats'        => $stats,
            ],
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

        return response()->json([
            'message' => $wasPublished ? 'Post removed from the community feed' : 'Post rejected',
        ]);
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

        return $query->first();
    }

    private function basePostQuery(int $communityId)
    {
        return DB::table('posts')
            ->join('users', 'users.id', '=', 'posts.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'posts.user_id')
            ->select(
                'posts.*',
                DB::raw('COALESCE(profiles.display_name, users.name) as author_name'),
                'profiles.avatar_url as author_avatar',
                'profiles.unit_number as author_unit',
            )
            ->where('posts.community_id', $communityId)
            ->whereNull('posts.deleted_at');
    }

    private function formatPost(object $post, array $likedPostIds, int $userId): array
    {
        $categoryLabels = collect(self::TOPICS)->pluck('label', 'id');

        return [
            'id'             => (int) $post->id,
            'community_id'   => (int) $post->community_id,
            'community_name' => $post->community_name ?? null,
            'user_id'        => (int) $post->user_id,
            'body'           => $post->body,
            'content'        => $post->body,
            'category'       => $post->category,
            'status'         => $post->status ?? 'approved',
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
                'avatar'       => MediaUrl::toPublic($post->author_avatar ?? null, request()),
                'location'     => $post->author_unit ? 'Unit '.$post->author_unit : null,
            ],
            'liked_by_me'    => in_array($post->id, $likedPostIds, true),
            'is_mine'        => (int) $post->user_id === $userId,
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

        return $user->memberships()
            ->where('status', 'approved')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->value('community_id');
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

    private function storeImage(UploadedFile $file): string
    {
        $path = $file->store('posts', 'public');

        return Storage::url($path);
    }

    private function notifyPostCreated(int $communityId, int $authorId, int $postId, string $body): void
    {
        $recipientIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->where('user_id', '!=', $authorId)
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
