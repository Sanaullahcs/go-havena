<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AdminRoleService;
use App\Services\NotificationService;
use App\Services\UserBlockService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MessageController extends Controller
{
    /** GET /conversations */
    public function conversations(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $query = DB::table('conversations as c')
            ->join('conversation_participants as cp', 'cp.conversation_id', '=', 'c.id')
            ->join('conversation_participants as cp2', 'cp2.conversation_id', '=', 'c.id')
            ->join('users as u', 'u.id', '=', 'cp2.user_id')
            ->leftJoin('profiles as op', 'op.user_id', '=', 'u.id')
            ->leftJoin('listings as l', 'l.id', '=', 'c.listing_id')
            ->leftJoin('messages as m', function ($join) {
                $join->on('m.conversation_id', '=', 'c.id')
                     ->whereRaw('m.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL)');
            })
            ->where('cp.user_id', $user->id)
            ->where('cp2.user_id', '!=', $user->id);

        $blockedPeerIds = UserBlockService::blockedEitherWayIdsFor((int) $user->id);
        if ($blockedPeerIds !== []) {
            $query->whereNotIn('u.id', $blockedPeerIds);
        }

        if ($communityId) {
            $communityIds = $this->resolveConversationCommunityIds($request, $user, $communityId);

            $query->leftJoin('community_memberships as ocm', function ($join) use ($communityId) {
                $join->on('ocm.user_id', '=', 'u.id')
                    ->where('ocm.community_id', $communityId)
                    ->where('ocm.status', 'approved');
            });

            $query->where(function ($scoped) use ($communityIds) {
                $scoped->where(function ($listingScoped) use ($communityIds) {
                    $listingScoped->whereNotNull('c.listing_id')
                        ->whereIn('l.community_id', $communityIds);
                })->orWhere(function ($neighborScoped) use ($communityIds) {
                    $neighborScoped->whereNull('c.listing_id')
                        ->whereExists(function ($sub) use ($communityIds) {
                            $sub->from('community_memberships as cm')
                                ->whereColumn('cm.user_id', 'cp2.user_id')
                                ->whereIn('cm.community_id', $communityIds)
                                ->where('cm.status', 'approved');
                        });
                });
            });
        } else {
            $query->leftJoin('community_memberships as ocm', function ($join) {
                $join->on('ocm.user_id', '=', 'u.id')
                    ->where('ocm.status', 'approved')
                    ->whereRaw('ocm.id = (
                        SELECT MAX(cmx.id) FROM community_memberships cmx
                        WHERE cmx.user_id = u.id AND cmx.status = \'approved\'
                    )');
            });
        }

        $conversations = $query
            ->select([
                'c.id',
                'c.type',
                'c.title',
                'c.listing_id',
                'u.name as other_name',
                'u.id as other_id',
                'u.role as other_account_role',
                'op.avatar_url as other_avatar_url',
                'ocm.role as other_membership_role',
                'cp.unread_count',
                'm.body as last_message',
                'm.type as last_message_type',
                'm.created_at as last_message_at',
                'l.title as listing_title',
                'l.price as listing_price',
                'l.images as listing_images',
            ])
            ->orderByDesc(DB::raw('COALESCE(m.created_at, c.updated_at, c.created_at)'))
            ->get()
            ->map(fn ($row) => $this->formatConversation($row));

        return response()->json(['data' => $conversations]);
    }

    /** GET /conversations/unread-count */
    public function unreadCount(Request $request): JsonResponse
    {
        $count = (int) DB::table('conversation_participants')
            ->where('user_id', $request->user()->id)
            ->sum('unread_count');

        return response()->json(['data' => ['unread_count' => $count]]);
    }

    /** GET /conversations/{id}/messages */
    public function messages(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $participant = DB::table('conversation_participants')
            ->where('conversation_id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (! $participant) {
            return response()->json(['message' => 'Not a participant.'], 403);
        }

        $peerId = DB::table('conversation_participants')
            ->where('conversation_id', $id)
            ->where('user_id', '!=', $user->id)
            ->value('user_id');
        if ($peerId && UserBlockService::isBlockedEitherWay((int) $user->id, (int) $peerId)) {
            return response()->json(['message' => 'You cannot interact with this user.'], 422);
        }

        $limit = min(max((int) ($request->limit ?? 25), 1), 50);
        $beforeId = $request->filled('before_id') ? (int) $request->before_id : null;

        $query = DB::table('messages as m')
            ->join('users as u', 'u.id', '=', 'm.sender_id')
            ->where('m.conversation_id', $id)
            ->whereNull('m.deleted_at');

        if ($beforeId) {
            $query->where('m.id', '<', $beforeId);
        }

        $rows = $query
            ->select(['m.id', 'm.body', 'm.type', 'm.metadata', 'm.created_at', 'u.id as sender_id', 'u.name as sender_name'])
            ->orderByDesc('m.id')
            ->limit($limit)
            ->get();

        $messages = $rows->reverse()->values()->map(fn ($row) => $this->formatMessage($row));

        $oldestId = $rows->last()?->id;
        $hasMore = $oldestId
            ? DB::table('messages')
                ->where('conversation_id', $id)
                ->whereNull('deleted_at')
                ->where('id', '<', $oldestId)
                ->exists()
            : false;

        // Mark read only when viewing the latest page (not while paginating history).
        if (! $beforeId) {
            DB::table('conversation_participants')
                ->where('conversation_id', $id)
                ->where('user_id', $user->id)
                ->update(['unread_count' => 0, 'last_read_at' => now()]);
        }

        $conversation = DB::table('conversations as c')
            ->leftJoin('listings as l', 'l.id', '=', 'c.listing_id')
            ->where('c.id', $id)
            ->select([
                'c.id',
                'c.title',
                'c.listing_id',
                'l.title as listing_title',
                'l.price as listing_price',
                'l.images as listing_images',
            ])
            ->first();

        $peer = $this->resolveConversationPeer($id, $user->id, $this->resolveCommunityId($request, $user));

        return response()->json([
            'data'    => $messages,
            'meta'    => [
                'conversation' => $conversation ? $this->formatListingContext($conversation) : null,
                'peer'         => $peer,
                'has_more'     => $hasMore,
            ],
        ]);
    }

    /** POST /conversations/{id}/messages */
    public function send(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $participant = DB::table('conversation_participants')
            ->where('conversation_id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (! $participant) {
            return response()->json(['message' => 'Not a participant.'], 403);
        }

        $peerId = DB::table('conversation_participants')
            ->where('conversation_id', $id)
            ->where('user_id', '!=', $user->id)
            ->value('user_id');
        if ($peerId) {
            UserBlockService::assertCanInteract((int) $user->id, (int) $peerId);
        }

        $message = $this->insertMessage($id, $user->id, $validated['body'], 'text');

        $conversation = DB::table('conversations')->where('id', $id)->first();
        $recipientId = DB::table('conversation_participants')
            ->where('conversation_id', $id)
            ->where('user_id', '!=', $user->id)
            ->value('user_id');

        if ($recipientId) {
            $senderName = $this->senderDisplayName($user);
            NotificationService::send(
                (int) $recipientId,
                'info',
                'New message',
                $senderName.' sent you a message.',
                $this->conversationActionUrl(
                    $id,
                    $conversation?->listing_id ? (int) $conversation->listing_id : null,
                    $senderName,
                ),
                [
                    'kind'        => 'message',
                    'actor_name'  => $senderName,
                ],
            );
        }

        return response()->json(['data' => $message], 201);
    }

    /** POST /conversations — start or get DM (optionally tied to a listing) */
    public function startConversation(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'recipient_id' => ['required', 'integer', 'exists:users,id'],
            'listing_id'   => ['nullable', 'integer', 'exists:listings,id'],
            'message'      => ['nullable', 'string', 'max:2000'],
            'offer_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $recipientId = (int) $validated['recipient_id'];
        $listingId = isset($validated['listing_id']) ? (int) $validated['listing_id'] : null;
        $message = trim($validated['message'] ?? '');
        $offerAmount = array_key_exists('offer_amount', $validated) ? $validated['offer_amount'] : null;

        if ($recipientId === (int) $user->id) {
            return response()->json(['message' => 'You cannot message yourself.'], 422);
        }

        UserBlockService::assertCanInteract((int) $user->id, $recipientId);

        $communityId = $this->resolveCommunityId($request, $user);
        if (! $communityId) {
            return response()->json(['message' => 'You must belong to a community to start a conversation.'], 403);
        }

        if (! $this->userIsApprovedMember($recipientId, $communityId)) {
            return response()->json(['message' => 'That neighbor is not in your community.'], 403);
        }

        $listing = null;
        if ($listingId) {
            $listing = DB::table('listings')
                ->where('id', $listingId)
                ->whereNull('deleted_at')
                ->first();

            if (! $listing) {
                return response()->json(['message' => 'Listing not found.'], 404);
            }

            if ((int) $listing->community_id !== $communityId) {
                return response()->json(['message' => 'Listing not found.'], 404);
            }

            if ((int) $listing->user_id !== $recipientId) {
                return response()->json(['message' => 'This listing does not belong to that seller.'], 422);
            }

            if ($listing->status === 'sold') {
                return response()->json(['message' => 'This listing has been sold.'], 422);
            }
        }

        $convId = $this->findExistingConversation((int) $user->id, $recipientId, $listingId);

        if (! $convId) {
        $convId = DB::table('conversations')->insertGetId([
            'type'       => 'direct',
                'title'      => $listing?->title,
                'listing_id' => $listingId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('conversation_participants')->insert([
                ['conversation_id' => $convId, 'user_id' => $user->id, 'created_at' => now(), 'updated_at' => now()],
                ['conversation_id' => $convId, 'user_id' => $recipientId, 'created_at' => now(), 'updated_at' => now()],
            ]);
        }

        $createdMessage = null;

        if ($offerAmount !== null) {
            $offerBody = 'Sent an offer of $'.number_format((float) $offerAmount, 2);
            if ($message !== '') {
                $offerBody .= "\n\n".$message;
            }

            $metadata = [
                'listing_id'    => $listingId,
                'listing_title' => $listing?->title,
                'listing_price' => $listing?->price,
                'offer_amount'  => (float) $offerAmount,
                'currency'      => 'USD',
            ];

            $createdMessage = $this->insertMessage($convId, $user->id, $offerBody, 'offer', $metadata);

            $senderName = $this->senderDisplayName($user);
            NotificationService::send(
                $recipientId,
                'info',
                'New offer received',
                $senderName.' offered $'.number_format((float) $offerAmount, 2).' on "'.$listing?->title.'".',
                $this->conversationActionUrl($convId, $listingId, $senderName),
                [
                    'kind'       => 'message',
                    'actor_name' => $senderName,
                ],
            );
        } elseif ($message !== '') {
            $createdMessage = $this->insertMessage($convId, $user->id, $message, 'text');

            $about = $listing?->title ? ' about "'.$listing->title.'"' : '';
            $senderName = $this->senderDisplayName($user);
            NotificationService::send(
                $recipientId,
                'info',
                'New message',
                $senderName.' sent you a message'.$about.'.',
                $this->conversationActionUrl($convId, $listingId, $senderName),
                [
                    'kind'       => 'message',
                    'actor_name' => $senderName,
                ],
            );
        }

        return response()->json([
            'data' => [
                'conversation_id' => $convId,
                'message'         => $createdMessage,
                'listing'         => $listing ? $this->formatListingRow($listing) : null,
            ],
        ], $createdMessage ? 201 : 200);
    }

    /** GET /community-members — neighbors in the user's community available to message */
    public function communityMembers(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json(['data' => []]);
        }

        $query = DB::table('community_memberships as cm')
            ->join('users as u', 'u.id', '=', 'cm.user_id')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->where('u.id', '!=', $user->id)
            ->where('u.status', 'active')
            ->whereNotIn('u.role', ['system_admin', 'admin']);

        $blockedPeerIds = UserBlockService::blockedEitherWayIdsFor((int) $user->id);
        if ($blockedPeerIds !== []) {
            $query->whereNotIn('u.id', $blockedPeerIds);
        }

        $query
            ->select([
                'u.id',
                'u.name',
                'p.display_name',
                'p.avatar_url',
                'p.unit_number',
                'cm.role',
            ])
            ->orderBy('u.name');

        if ($request->filled('search')) {
            $term = '%'.$request->search.'%';
            $query->where(function ($q) use ($term) {
                $q->where('u.name', 'like', $term)
                    ->orWhere('p.display_name', 'like', $term)
                    ->orWhere('p.unit_number', 'like', $term);
            });
        }

        $members = $query
            ->limit(min((int) ($request->limit ?? 50), 100))
            ->get()
            ->map(fn ($row) => [
                'id'         => (int) $row->id,
                'name'       => $row->display_name ?: $row->name,
                'avatar_url' => MediaUrl::toPublic($row->avatar_url, $request),
                'unit'       => $row->unit_number,
                'role'       => $row->role,
            ]);

        return response()->json(['data' => $members]);
    }

    private function findExistingConversation(int $userId, int $recipientId, ?int $listingId): ?int
    {
        $query = DB::table('conversation_participants as a')
            ->join('conversation_participants as b', 'b.conversation_id', '=', 'a.conversation_id')
            ->join('conversations as c', 'c.id', '=', 'a.conversation_id')
            ->where('a.user_id', $userId)
            ->where('b.user_id', $recipientId)
            ->where('c.type', 'direct');

        if ($listingId) {
            $query->where('c.listing_id', $listingId);
        } else {
            $query->whereNull('c.listing_id');
        }

        return $query->value('a.conversation_id');
    }

    private function insertMessage(int $conversationId, int $senderId, string $body, string $type, ?array $metadata = null): array
    {
        $msgId = DB::table('messages')->insertGetId([
            'conversation_id' => $conversationId,
            'sender_id'       => $senderId,
            'body'            => $body,
            'type'            => $type,
            'metadata'        => $metadata ? json_encode($metadata) : null,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)
            ->where('user_id', '!=', $senderId)
            ->increment('unread_count');

        $row = DB::table('messages as m')
            ->join('users as u', 'u.id', '=', 'm.sender_id')
            ->where('m.id', $msgId)
            ->select(['m.id', 'm.body', 'm.type', 'm.metadata', 'm.created_at', 'u.id as sender_id', 'u.name as sender_name'])
            ->first();

        return $this->formatMessage($row);
    }

    private function formatConversation(object $row): array
    {
        $listing = $this->formatListingContext($row);
        $role = $this->resolvePeerRole(
            $row->other_membership_role ?? null,
            $row->other_account_role ?? null,
        );

        return [
            'id'                => (int) $row->id,
            'type'              => $row->type,
            'kind'              => $row->listing_id ? 'listing' : 'neighbor',
            'title'             => $row->title,
            'listing_id'        => $row->listing_id ? (int) $row->listing_id : null,
            'other_id'          => (int) $row->other_id,
            'other_name'        => $row->other_name,
            'other_avatar_url'  => MediaUrl::toPublic($row->other_avatar_url ?? null, request()),
            'other_role'        => $role,
            'unread_count'      => (int) ($row->unread_count ?? 0),
            'last_message'      => $row->last_message,
            'last_message_type' => $row->last_message_type,
            'last_message_at'   => $row->last_message_at,
            'listing'           => $listing,
        ];
    }

    /** Normalize peer role for chat UI: admin | resident */
    private function resolvePeerRole(?string $membershipRole, ?string $accountRole): string
    {
        if (in_array($membershipRole, ['admin', 'moderator'], true)) {
            return 'admin';
        }

        if (in_array($accountRole, ['community_admin', 'admin', 'moderator'], true)) {
            return 'admin';
        }

        return 'resident';
    }

    private function resolveConversationPeer(int $conversationId, int $viewerId, ?int $communityId): ?array
    {
        $query = DB::table('conversation_participants as cp')
            ->join('users as u', 'u.id', '=', 'cp.user_id')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->where('cp.conversation_id', $conversationId)
            ->where('cp.user_id', '!=', $viewerId);

        if ($communityId) {
            $query->leftJoin('community_memberships as ocm', function ($join) use ($communityId) {
                $join->on('ocm.user_id', '=', 'u.id')
                    ->where('ocm.community_id', $communityId)
                    ->where('ocm.status', 'approved');
            });
        } else {
            $query->leftJoin('community_memberships as ocm', function ($join) {
                $join->on('ocm.user_id', '=', 'u.id')
                    ->where('ocm.status', 'approved')
                    ->whereRaw('ocm.id = (
                        SELECT MAX(cmx.id) FROM community_memberships cmx
                        WHERE cmx.user_id = u.id AND cmx.status = \'approved\'
                    )');
            });
        }

        $row = $query
            ->select([
                'u.id',
                'u.name',
                'u.role as account_role',
                'p.display_name',
                'p.avatar_url',
                'ocm.role as membership_role',
            ])
            ->first();

        if (! $row) {
            return null;
        }

        return [
            'id'         => (int) $row->id,
            'name'       => $row->display_name ?: $row->name,
            'avatar_url' => MediaUrl::toPublic($row->avatar_url ?? null, request()),
            'role'       => $this->resolvePeerRole($row->membership_role ?? null, $row->account_role ?? null),
        ];
    }

    private function formatMessage(object $row): array
    {
        $metadata = $row->metadata ? json_decode($row->metadata, true) : null;

        return [
            'id'          => (int) $row->id,
            'body'        => $row->body,
            'content'     => $row->body,
            'type'        => $row->type,
            'metadata'    => is_array($metadata) ? $metadata : null,
            'created_at'  => $row->created_at,
            'sender_id'   => (int) $row->sender_id,
            'sender_name' => $row->sender_name,
        ];
    }

    private function formatListingContext(object $row): ?array
    {
        if (! $row->listing_id) {
            return null;
        }

        return [
            'id'        => (int) $row->listing_id,
            'title'     => $row->listing_title ?? $row->title,
            'price'     => $row->listing_price,
            'image_url' => $this->firstListingImage($row->listing_images ?? null),
        ];
    }

    private function formatListingRow(object $listing): array
    {
        return [
            'id'        => (int) $listing->id,
            'title'     => $listing->title,
            'price'     => $listing->price,
            'image_url' => $this->firstListingImage($listing->images ?? null),
        ];
    }

    private function firstListingImage(?string $json): ?string
    {
        if (! $json) {
            return null;
        }

        $images = json_decode($json, true);
        if (! is_array($images) || empty($images[0])) {
            return null;
        }

        return MediaUrl::toPublic(is_string($images[0]) ? $images[0] : null, request());
    }

    private function conversationActionUrl(int $conversationId, ?int $listingId = null, ?string $peerName = null): string
    {
        $url = '/screens/messages/chat?conversationId='.$conversationId;
        if ($listingId) {
            $url .= '&listingId='.$listingId;
        }
        if ($peerName) {
            $url .= '&recipientName='.rawurlencode($peerName);
        }

        return $url;
    }

    private function senderDisplayName(object $user): string
    {
        $displayName = DB::table('profiles')
            ->where('user_id', $user->id)
            ->value('display_name');

        $name = trim((string) ($displayName ?: $user->name));

        return $name !== '' ? $name : 'Neighbor';
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
            ->whereIn('role', ['admin', 'moderator'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->value('community_id')
            ?? $user->memberships()
                ->where('status', 'approved')
                ->orderByDesc('updated_at')
                ->orderByDesc('id')
                ->value('community_id');
    }

    /** @return list<int> */
    private function resolveConversationCommunityIds(Request $request, User $user, int $activeCommunityId): array
    {
        if (AdminRoleService::isCommunityAdminRole($user)) {
            $managed = $user->memberships()
                ->where('status', 'approved')
                ->whereIn('role', ['admin', 'moderator'])
                ->pluck('community_id')
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            if ($managed !== []) {
                return $managed;
            }
        }

        return [$activeCommunityId];
    }

    private function userIsApprovedMember(int $userId, int $communityId): bool
    {
        return DB::table('community_memberships')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();
    }
}
