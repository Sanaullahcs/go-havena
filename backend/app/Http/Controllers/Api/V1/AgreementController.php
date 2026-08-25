<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\NotificationService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AgreementController extends Controller
{
    public const CATEGORIES = [
        'lease',
        'pet',
        'parking',
        'amenity',
        'maintenance',
        'guest',
        'general',
    ];

    /* ── helpers ─────────────────────────────────────────────── */

    private function resolveCommunityId(Request $request, $user): int
    {
        if ($this->isPlatformAdmin($user) && $request->filled('community_id')) {
            return (int) $request->community_id;
        }

        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        abort_if(! $membership, 422, 'No approved community membership found.');

        return (int) $membership->community_id;
    }

    private function isCommunityAdmin($user): bool
    {
        return in_array($user->role, ['community_admin', 'admin', 'system_admin'], true)
            || (bool) ($user->is_admin ?? false);
    }

    private function isPlatformAdmin($user): bool
    {
        return in_array($user->role, ['admin', 'system_admin'], true)
            || (bool) ($user->is_admin ?? false);
    }

    private function findAgreement(int $communityId, int $id): object
    {
        $row = DB::table('agreements')
            ->where('community_id', $communityId)
            ->where('id', $id)
            ->first();

        abort_if(! $row, 404, 'Agreement not found.');

        return $row;
    }

    private function recipientCounts(int $agreementId): array
    {
        $rows = DB::table('agreement_recipients')
            ->select('status', DB::raw('COUNT(*) as total'))
            ->where('agreement_id', $agreementId)
            ->groupBy('status')
            ->pluck('total', 'status');

        $pending = (int) ($rows['pending'] ?? 0) + (int) ($rows['viewed'] ?? 0);

        return [
            'total' => (int) $rows->sum(),
            'pending' => $pending,
            'signed' => (int) ($rows['signed'] ?? 0),
            'declined' => (int) ($rows['declined'] ?? 0),
            'viewed' => (int) ($rows['viewed'] ?? 0),
        ];
    }

    private function formatAgreement(object $row, Request $request, ?object $mine = null): array
    {
        $fee = (int) $row->signature_fee_cents;
        $counts = $this->recipientCounts((int) $row->id);
        $payload = [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'title' => $row->title,
            'category' => $row->category,
            'body' => $row->body,
            'cover_message' => $row->cover_message ?? null,
            'status' => $row->status,
            'audience' => $row->audience,
            'is_required' => (bool) ($row->is_required ?? false),
            'signature_fee_cents' => $fee,
            'signature_fee_label' => $fee > 0 ? '$'.number_format($fee / 100, 2) : null,
            'requires_payment' => $fee > 0,
            'due_at' => $row->due_at,
            'sent_at' => $row->sent_at,
            'closed_at' => $row->closed_at,
            'created_by' => (int) $row->created_by,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
            'counts' => $counts,
            'is_overdue' => $row->status === 'sent'
                && $row->due_at
                && now()->greaterThan($row->due_at),
            'is_due_soon' => $row->status === 'sent'
                && $row->due_at
                && now()->lessThanOrEqualTo($row->due_at)
                && now()->diffInHours($row->due_at, false) <= 72,
            'can_edit_content' => $row->status === 'draft'
                || ($row->status === 'sent' && $counts['signed'] === 0),
            'can_reopen' => $row->status === 'closed',
            'can_withdraw' => $row->status === 'sent' && $counts['signed'] === 0,
            'can_extend_due' => $row->status === 'sent',
        ];

        if ($mine) {
            $payload['my_status'] = $mine->status;
            $payload['my_payment_status'] = $mine->payment_status;
            $payload['viewed_at'] = $mine->viewed_at;
            $payload['signed_at'] = $mine->signed_at;
            $payload['declined_at'] = $mine->declined_at;
            $payload['signer_name'] = $mine->signer_name;
            $payload['certificate_id'] = $mine->certificate_id;
            $payload['content_hash'] = $mine->content_hash;
            $payload['signature_url'] = MediaUrl::toPublic($mine->signature_path, $request);
            $payload['can_sign'] = $row->status === 'sent'
                && in_array($mine->status, ['pending', 'viewed'], true)
                && ($fee === 0 || in_array($mine->payment_status, ['paid', 'authorized'], true));
            $payload['can_decline'] = $row->status === 'sent'
                && in_array($mine->status, ['pending', 'viewed'], true)
                && ! (bool) ($row->is_required ?? false);
            $payload['needs_payment'] = $row->status === 'sent'
                && $fee > 0
                && ! in_array($mine->payment_status, ['paid', 'authorized'], true)
                && in_array($mine->status, ['pending', 'viewed'], true);
            $payload['decline_reason'] = $mine->decline_reason ?? null;
        }

        return $payload;
    }

    private function formatRecipient(object $row, Request $request): array
    {
        return [
            'id' => (int) $row->id,
            'user_id' => (int) $row->user_id,
            'name' => $row->display_name ?: $row->name,
            'unit' => $row->unit_number,
            'status' => $row->status,
            'payment_status' => $row->payment_status,
            'viewed_at' => $row->viewed_at,
            'signed_at' => $row->signed_at,
            'declined_at' => $row->declined_at,
            'signer_name' => $row->signer_name,
            'certificate_id' => $row->certificate_id,
            'signature_url' => MediaUrl::toPublic($row->signature_path, $request),
            'decline_reason' => $row->decline_reason ?? null,
            'can_remind' => in_array($row->status, ['pending', 'viewed'], true),
            'can_reopen' => $row->status === 'declined',
            'can_remove' => $row->status !== 'signed',
        ];
    }

    private function approvedResidentIds(int $communityId): array
    {
        return DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->where('users.role', 'resident')
            ->pluck('cm.user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    private function syncRecipients(int $agreementId, int $communityId, string $audience, array $userIds, int $feeCents): void
    {
        $ids = $audience === 'selected'
            ? array_values(array_unique(array_map('intval', $userIds)))
            : $this->approvedResidentIds($communityId);

        $ids = array_values(array_intersect($ids, $this->approvedResidentIds($communityId)));
        abort_if($ids === [], 422, 'Select at least one approved resident.');

        $now = now();
        $payment = $feeCents > 0 ? 'unpaid' : 'not_required';
        $existing = DB::table('agreement_recipients')
            ->where('agreement_id', $agreementId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach ($ids as $uid) {
            if (in_array($uid, $existing, true)) {
                continue;
            }
            DB::table('agreement_recipients')->insert([
                'agreement_id' => $agreementId,
                'user_id' => $uid,
                'status' => 'pending',
                'payment_status' => $payment,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        DB::table('agreement_recipients')
            ->where('agreement_id', $agreementId)
            ->whereNotIn('user_id', $ids)
            ->where('status', '!=', 'signed')
            ->delete();
    }

    private function notifyRecipients(
        object $agreement,
        array $statuses = ['pending'],
        bool $neverViewedOnly = false,
        string $title = 'Agreement to sign',
        ?string $body = null,
        string $type = 'info',
        ?array $onlyUserIds = null,
    ): int {
        $query = DB::table('agreement_recipients')
            ->where('agreement_id', $agreement->id)
            ->whereIn('status', $statuses);

        if ($neverViewedOnly) {
            $query->whereNull('viewed_at');
        }
        if ($onlyUserIds !== null) {
            $query->whereIn('user_id', array_map('intval', $onlyUserIds));
        }

        $userIds = $query->pluck('user_id');
        $due = $agreement->due_at
            ? ' Please sign by '.date('M j, Y', strtotime((string) $agreement->due_at)).'.'
            : '';
        $cover = trim((string) ($agreement->cover_message ?? ''));
        $message = $body ?? trim($agreement->title.($cover !== '' ? ' — '.$cover : '').$due);

        foreach ($userIds as $uid) {
            NotificationService::send(
                (int) $uid,
                $type,
                $title,
                $message,
                '/agreements/'.$agreement->id,
                [
                    'screen' => '/(tabs)/services/agreements/detail',
                    'agreement_id' => (int) $agreement->id,
                    'agreementId' => (int) $agreement->id,
                ],
            );
        }

        return $userIds->count();
    }

    /* ── admin ───────────────────────────────────────────────── */

    public function adminIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);

        $query = DB::table('agreements')->where('community_id', $cid)->orderByDesc('updated_at');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('category') && $request->category !== 'all') {
            $query->where('category', $request->category);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('body', 'like', "%{$search}%");
            });
        }

        $rows = $query->get()->map(fn ($row) => $this->formatAgreement($row, $request));

        $stats = [
            'total' => $rows->count(),
            'draft' => $rows->where('status', 'draft')->count(),
            'sent' => $rows->where('status', 'sent')->count(),
            'awaiting' => $rows->sum(fn ($row) => $row['counts']['pending']),
            'signed' => $rows->sum(fn ($row) => $row['counts']['signed']),
            'overdue' => $rows->where('is_overdue', true)->count(),
            'due_soon' => $rows->where('is_due_soon', true)->count(),
        ];

        return response()->json([
            'data' => $rows->values(),
            'stats' => $stats,
            'categories' => self::CATEGORIES,
        ]);
    }

    public function adminShow(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);

        return response()->json([
            'data' => $this->adminPayload($row, $request),
        ]);
    }

    private function adminPayload(object $row, Request $request): array
    {
        $recipients = DB::table('agreement_recipients as ar')
            ->join('users', 'users.id', '=', 'ar.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('ar.agreement_id', $row->id)
            ->select(
                'ar.*',
                'users.name',
                'profiles.display_name',
                'profiles.unit_number',
            )
            ->orderBy('users.name')
            ->get()
            ->map(fn ($r) => $this->formatRecipient($r, $request));

        return array_merge($this->formatAgreement($row, $request), [
            'recipients' => $recipients,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'in:'.implode(',', self::CATEGORIES)],
            'body' => ['required', 'string', 'min:20'],
            'audience' => ['nullable', 'in:all,selected'],
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer'],
            'signature_fee_cents' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'due_at' => ['nullable', 'date'],
            'is_required' => ['nullable', 'boolean'],
            'cover_message' => ['nullable', 'string', 'max:500'],
            'send' => ['nullable', 'boolean'],
        ]);

        $id = DB::table('agreements')->insertGetId([
            'community_id' => $cid,
            'created_by' => $user->id,
            'title' => trim($validated['title']),
            'category' => $validated['category'] ?? 'general',
            'body' => $validated['body'],
            'cover_message' => isset($validated['cover_message']) ? trim((string) $validated['cover_message']) ?: null : null,
            'status' => 'draft',
            'audience' => $validated['audience'] ?? 'all',
            'is_required' => ! empty($validated['is_required']),
            'signature_fee_cents' => (int) ($validated['signature_fee_cents'] ?? 0),
            'due_at' => $validated['due_at'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if (($validated['audience'] ?? 'all') === 'selected' && ! empty($validated['user_ids'])) {
            $this->syncRecipients(
                $id,
                $cid,
                'selected',
                $validated['user_ids'],
                (int) ($validated['signature_fee_cents'] ?? 0),
            );
        }

        if (! empty($validated['send'])) {
            return $this->send($request, $id);
        }

        return response()->json([
            'data' => $this->formatAgreement($this->findAgreement($cid, $id), $request),
            'message' => 'Draft saved.',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status === 'closed', 422, 'Closed agreements cannot be edited. Reopen it first.');

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'max:160'],
            'category' => ['sometimes', 'string', 'in:'.implode(',', self::CATEGORIES)],
            'body' => ['sometimes', 'string', 'min:20'],
            'cover_message' => ['nullable', 'string', 'max:500'],
            'audience' => ['sometimes', 'in:all,selected'],
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer'],
            'signature_fee_cents' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'due_at' => ['nullable', 'date'],
            'is_required' => ['sometimes', 'boolean'],
            'status' => ['sometimes', 'in:draft,sent,closed'],
            'notify_due_change' => ['nullable', 'boolean'],
        ]);

        $signed = $this->recipientCounts($id)['signed'];
        $locked = ['title', 'body', 'category', 'signature_fee_cents', 'is_required'];
        if ($signed > 0) {
            foreach ($locked as $field) {
                abort_if(array_key_exists($field, $validated), 422, 'Signed agreements cannot change the document text, fee, or required setting.');
            }
        }

        $payload = ['updated_at' => now()];
        foreach (['title', 'category', 'body', 'cover_message', 'audience', 'signature_fee_cents', 'due_at', 'is_required'] as $field) {
            if (array_key_exists($field, $validated)) {
                $value = $validated[$field];
                if ($field === 'title' || $field === 'cover_message') {
                    $value = trim((string) $value);
                    $value = $value === '' ? ($field === 'cover_message' ? null : $value) : $value;
                }
                $payload[$field] = $value;
            }
        }
        $closing = ($validated['status'] ?? null) === 'closed' && $row->status !== 'closed';
        if ($closing) {
            $payload['status'] = 'closed';
            $payload['closed_at'] = now();
        }

        $dueChanged = array_key_exists('due_at', $validated)
            && (($validated['due_at'] ?? null) ? date('Y-m-d', strtotime((string) $validated['due_at'])) : null)
                !== ($row->due_at ? date('Y-m-d', strtotime((string) $row->due_at)) : null);

        DB::table('agreements')->where('id', $id)->update($payload);
        $updated = $this->findAgreement($cid, $id);

        if ($signed === 0 && $updated->audience === 'selected' && array_key_exists('user_ids', $validated)) {
            $this->syncRecipients(
                $id,
                $cid,
                'selected',
                $validated['user_ids'] ?? [],
                (int) $updated->signature_fee_cents,
            );
            $updated = $this->findAgreement($cid, $id);
        }

        if ($closing) {
            $this->notifyRecipients(
                $updated,
                ['pending', 'viewed'],
                false,
                'Agreement closed',
                $updated->title.' is no longer accepting signatures.',
                'warning',
            );
        } elseif ($dueChanged && ! empty($validated['notify_due_change']) && $updated->status === 'sent') {
            $this->notifyRecipients(
                $updated,
                ['pending', 'viewed'],
                false,
                'Signing deadline updated',
                $updated->title.' now has a new due date.',
            );
        }

        return response()->json([
            'data' => $this->adminPayload($updated, $request),
            'message' => $closing ? 'Agreement closed.' : 'Agreement updated.',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($this->recipientCounts($id)['signed'] > 0, 422, 'Signed agreements cannot be deleted.');

        DB::table('agreement_recipients')->where('agreement_id', $id)->delete();
        DB::table('agreements')->where('id', $id)->delete();

        return response()->json(['message' => 'Agreement deleted.']);
    }

    public function send(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status === 'closed', 422, 'Closed agreements cannot be sent.');

        $validated = $request->validate([
            'audience' => ['nullable', 'in:all,selected'],
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer'],
        ]);

        $audience = $validated['audience'] ?? $row->audience;
        $userIds = $validated['user_ids'] ?? [];
        if ($audience === 'selected' && $userIds === []) {
            $userIds = DB::table('agreement_recipients')
                ->where('agreement_id', $id)
                ->pluck('user_id')
                ->map(fn ($uid) => (int) $uid)
                ->all();
        }
        $this->syncRecipients(
            $id,
            $cid,
            $audience,
            $userIds,
            (int) $row->signature_fee_cents,
        );

        DB::table('agreements')->where('id', $id)->update([
            'status' => 'sent',
            'audience' => $audience,
            'sent_at' => now(),
            'updated_at' => now(),
        ]);

        $updated = $this->findAgreement($cid, $id);
        $notified = $this->notifyRecipients($updated, ['pending'], true);

        return response()->json([
            'data' => $this->adminPayload($updated, $request),
            'message' => $row->status === 'sent'
                ? ($notified ? 'New residents were added and notified.' : 'Recipient list is up to date.')
                : 'Agreement sent for signature.',
        ]);
    }

    public function remind(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status !== 'sent', 422, 'Only sent agreements can be reminded.');

        $validated = $request->validate([
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer'],
        ]);

        $notified = $this->notifyRecipients(
            $row,
            ['pending', 'viewed'],
            false,
            'Reminder: agreement to sign',
            null,
            'info',
            $validated['user_ids'] ?? null,
        );

        abort_if($notified === 0, 422, 'Everyone who can still sign has already finished.');

        return response()->json([
            'data' => $this->adminPayload($row, $request),
            'message' => $notified === 1
                ? 'Reminder sent to 1 resident.'
                : 'Reminder sent to '.$notified.' residents.',
        ]);
    }

    public function duplicate(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);

        $copyId = DB::table('agreements')->insertGetId([
            'community_id' => $cid,
            'created_by' => $user->id,
            'title' => Str::limit(trim($row->title).' (copy)', 160, ''),
            'category' => $row->category,
            'body' => $row->body,
            'cover_message' => $row->cover_message ?? null,
            'status' => 'draft',
            'audience' => $row->audience,
            'is_required' => (bool) ($row->is_required ?? false),
            'signature_fee_cents' => (int) $row->signature_fee_cents,
            'due_at' => $row->due_at,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => $this->formatAgreement($this->findAgreement($cid, $copyId), $request),
            'message' => 'Draft copy created.',
        ], 201);
    }

    public function reopen(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status !== 'closed', 422, 'Only closed agreements can be reopened.');

        DB::table('agreements')->where('id', $id)->update([
            'status' => 'sent',
            'closed_at' => null,
            'updated_at' => now(),
        ]);

        $updated = $this->findAgreement($cid, $id);
        $this->notifyRecipients(
            $updated,
            ['pending', 'viewed'],
            false,
            'Agreement reopened',
            $updated->title.' is open for signature again.',
        );

        return response()->json([
            'data' => $this->adminPayload($updated, $request),
            'message' => 'Agreement reopened for remaining unsigned residents.',
        ]);
    }

    public function withdraw(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status !== 'sent', 422, 'Only sent agreements can be withdrawn.');
        abort_if($this->recipientCounts($id)['signed'] > 0, 422, 'An agreement with signatures on file cannot be withdrawn. Close it instead.');

        DB::table('agreements')->where('id', $id)->update([
            'status' => 'draft',
            'updated_at' => now(),
        ]);

        return response()->json([
            'data' => $this->adminPayload($this->findAgreement($cid, $id), $request),
            'message' => 'Agreement withdrawn to draft. Residents will no longer see it until you send it again.',
        ]);
    }

    public function reopenRecipient(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status !== 'sent', 422, 'Reopen the agreement before inviting this resident to sign again.');

        $recipient = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $userId)
            ->first();
        abort_if(! $recipient, 404, 'Recipient not found.');
        abort_if($recipient->status === 'signed', 422, 'A signed certificate cannot be reopened.');
        abort_if($recipient->status !== 'declined', 422, 'Only declined recipients can be invited to sign again.');

        $fee = (int) $row->signature_fee_cents;
        DB::table('agreement_recipients')->where('id', $recipient->id)->update([
            'status' => 'pending',
            'declined_at' => null,
            'decline_reason' => null,
            'payment_status' => $fee > 0 ? 'unpaid' : 'not_required',
            'paid_at' => null,
            'updated_at' => now(),
        ]);

        $this->notifyRecipients(
            $row,
            ['pending'],
            false,
            'Agreement reopened for you',
            $row->title.' is available for your signature again.',
            'info',
            [$userId],
        );

        return response()->json([
            'data' => $this->adminPayload($row, $request),
            'message' => 'This resident can sign again.',
        ]);
    }

    public function removeRecipient(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->isCommunityAdmin($user), 403, 'Community admin access required.');
        $cid = $this->resolveCommunityId($request, $user);
        $this->findAgreement($cid, $id);

        $recipient = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $userId)
            ->first();
        abort_if(! $recipient, 404, 'Recipient not found.');
        abort_if($recipient->status === 'signed', 422, 'A signed certificate cannot be removed.');

        DB::table('agreement_recipients')->where('id', $recipient->id)->delete();

        return response()->json([
            'data' => $this->adminPayload($this->findAgreement($cid, $id), $request),
            'message' => 'Recipient removed.',
        ]);
    }

    /* ── resident ────────────────────────────────────────────── */

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $cid = $this->resolveCommunityId($request, $user);

        $rows = DB::table('agreements as a')
            ->join('agreement_recipients as ar', 'ar.agreement_id', '=', 'a.id')
            ->where('a.community_id', $cid)
            ->where('ar.user_id', $user->id)
            ->where('a.status', '!=', 'draft')
            ->orderByRaw("FIELD(ar.status, 'pending', 'viewed', 'signed', 'declined')")
            ->orderByDesc('a.sent_at')
            ->select('a.*', 'ar.status as my_status')
            ->get();

        $data = $rows->map(function ($row) use ($request, $user) {
            $mine = DB::table('agreement_recipients')
                ->where('agreement_id', $row->id)
                ->where('user_id', $user->id)
                ->first();

            return $this->formatAgreement($row, $request, $mine);
        });

        return response()->json([
            'data' => $data->values(),
            'stats' => [
                'awaiting' => $data->whereIn('my_status', ['pending', 'viewed'])->count(),
                'signed' => $data->where('my_status', 'signed')->count(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);

        if ($this->isCommunityAdmin($user)) {
            return $this->adminShow($request, $id);
        }

        $mine = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $user->id)
            ->first();
        abort_if(! $mine, 404, 'Agreement not found.');

        if ($mine->status === 'pending') {
            DB::table('agreement_recipients')->where('id', $mine->id)->update([
                'status' => 'viewed',
                'viewed_at' => now(),
                'updated_at' => now(),
            ]);
            $mine->status = 'viewed';
            $mine->viewed_at = now();
        }

        return response()->json([
            'data' => $this->formatAgreement($row, $request, $mine),
        ]);
    }

    public function authorizeFee(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        $mine = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $user->id)
            ->first();
        abort_if(! $mine, 404, 'Agreement not found.');
        abort_if($row->status !== 'sent', 422, 'This agreement is not open for signature.');
        abort_if(! in_array($mine->status, ['pending', 'viewed'], true), 422, 'This agreement is no longer awaiting signature.');

        if ((int) $row->signature_fee_cents === 0) {
            return response()->json(['data' => $this->formatAgreement($row, $request, $mine)]);
        }

        DB::table('agreement_recipients')->where('id', $mine->id)->update([
            'payment_status' => 'authorized',
            'paid_at' => now(),
            'updated_at' => now(),
        ]);
        $mine->payment_status = 'authorized';

        return response()->json([
            'data' => $this->formatAgreement($row, $request, $mine),
            'message' => 'Signature fee authorized.',
        ]);
    }

    public function sign(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);
        abort_if($row->status !== 'sent', 422, 'This agreement is not open for signature.');

        $mine = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $user->id)
            ->first();
        abort_if(! $mine, 404, 'Agreement not found.');
        abort_if($mine->status === 'signed', 422, 'You have already signed this agreement.');
        abort_if($mine->status === 'declined', 422, 'You declined this agreement.');

        $validated = $request->validate([
            'signer_name' => ['required', 'string', 'min:3', 'max:120'],
            'signature' => ['required', 'string'],
            'accepted_terms' => ['accepted'],
        ]);

        $fee = (int) $row->signature_fee_cents;
        if ($fee > 0 && ! in_array($mine->payment_status, ['paid', 'authorized'], true)) {
            abort(422, 'Authorize the signature fee before signing.');
        }

        $raw = $validated['signature'];
        if (str_contains($raw, 'base64,')) {
            $raw = explode('base64,', $raw, 2)[1];
        }
        $bytes = base64_decode($raw, true);
        abort_if($bytes === false || strlen($bytes) < 80, 422, 'Draw a complete signature.');

        $relative = '/storage/signatures/'.$id.'-'.$user->id.'-'.Str::lower(Str::ulid()).'.png';
        Storage::disk('public')->put(ltrim(str_replace('/storage/', '', $relative), '/'), $bytes);

        $signedAt = now();
        $certificateId = (string) Str::ulid();
        $hash = hash('sha256', implode('|', [
            $row->id,
            $row->title,
            $row->body,
            $user->id,
            trim($validated['signer_name']),
            $certificateId,
            $signedAt->toIso8601String(),
        ]));

        DB::table('agreement_recipients')->where('id', $mine->id)->update([
            'status' => 'signed',
            'signed_at' => $signedAt,
            'viewed_at' => $mine->viewed_at ?: $signedAt,
            'signer_name' => trim($validated['signer_name']),
            'signature_path' => $relative,
            'signer_ip' => substr((string) $request->ip(), 0, 64),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
            'content_hash' => $hash,
            'certificate_id' => $certificateId,
            'updated_at' => $signedAt,
        ]);

        $mine = DB::table('agreement_recipients')->where('id', $mine->id)->first();

        if ((int) $row->created_by !== (int) $user->id) {
            NotificationService::send(
                (int) $row->created_by,
                'success',
                'Agreement signed',
                trim($validated['signer_name']).' signed “'.$row->title.'”.',
                '/admin/agreements/'.$row->id,
                [
                    'screen' => '/(tabs)/services/agreements/detail',
                    'agreement_id' => (int) $row->id,
                    'agreementId' => (int) $row->id,
                ],
            );
        }

        return response()->json([
            'data' => $this->formatAgreement($row, $request, $mine),
            'message' => 'Digital signature recorded.',
        ]);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $cid = $this->resolveCommunityId($request, $user);
        $row = $this->findAgreement($cid, $id);

        $mine = DB::table('agreement_recipients')
            ->where('agreement_id', $id)
            ->where('user_id', $user->id)
            ->first();
        abort_if(! $mine, 404, 'Agreement not found.');
        abort_if($row->status !== 'sent', 422, 'This agreement is not open for signature.');
        abort_if((bool) ($row->is_required ?? false), 422, 'This required agreement cannot be declined.');
        abort_if($mine->status === 'signed', 422, 'A signed agreement cannot be declined.');
        abort_if($mine->status === 'declined', 422, 'You already declined this agreement.');

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        DB::table('agreement_recipients')->where('id', $mine->id)->update([
            'status' => 'declined',
            'declined_at' => now(),
            'decline_reason' => $validated['reason'] ?? null,
            'updated_at' => now(),
        ]);
        $mine = DB::table('agreement_recipients')->where('id', $mine->id)->first();

        if ((int) $row->created_by !== (int) $user->id) {
            $reason = trim((string) ($validated['reason'] ?? ''));
            NotificationService::send(
                (int) $row->created_by,
                'warning',
                'Agreement declined',
                ($user->name ?: 'A resident').' declined “'.$row->title.'”.'.($reason !== '' ? ' '.$reason : ''),
                '/admin/agreements/'.$row->id,
                [
                    'screen' => '/(tabs)/services/agreements/detail',
                    'agreement_id' => (int) $row->id,
                    'agreementId' => (int) $row->id,
                ],
            );
        }

        return response()->json([
            'data' => $this->formatAgreement($row, $request, $mine),
            'message' => 'Agreement declined.',
        ]);
    }
}
