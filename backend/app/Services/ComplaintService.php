<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ComplaintService
{
    public const MAINTENANCE_CATEGORIES = ['plumbing', 'electrical', 'cleaning', 'lifts', 'parking', 'other'];

    public const TECHNICAL_CATEGORIES = ['app_bug', 'account', 'login', 'payment', 'other'];

    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public const STATUSES = [
        'submitted',
        'in_review',
        'in_progress',
        'waiting_on_resident',
        'resolved',
        'reopened',
        'closed',
        'cancelled',
    ];

    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'submitted' => ['in_review', 'cancelled'],
        'in_review' => ['in_progress', 'waiting_on_resident', 'cancelled'],
        'in_progress' => ['waiting_on_resident', 'resolved', 'cancelled'],
        'waiting_on_resident' => ['in_progress', 'resolved', 'cancelled'],
        'resolved' => ['closed', 'reopened'],
        'reopened' => ['in_review', 'in_progress', 'cancelled'],
        'closed' => [],
        'cancelled' => [],
    ];

    /** @var list<string> */
    private const RESIDENT_TARGETS = ['cancelled', 'closed', 'reopened'];

    public function __construct(private readonly CommunityFeatureService $features) {}

    public function residentUnits(User $user): array
    {
        $communityId = UserActingContextService::currentCommunityId($user);
        if (! $communityId) {
            return [];
        }

        return DB::table('unit_residents')
            ->join('units', 'units.id', '=', 'unit_residents.unit_id')
            ->where('unit_residents.user_id', $user->id)
            ->where('unit_residents.community_id', $communityId)
            ->where('unit_residents.status', 'active')
            ->whereNull('unit_residents.left_at')
            ->orderBy('units.unit_number')
            ->get(['units.id', 'units.unit_number', 'units.community_id'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'unit_number' => $row->unit_number,
                'community_id' => (int) $row->community_id,
            ])
            ->all();
    }

    public function create(User $user, array $input, array $files = []): array
    {
        $type = (string) ($input['type'] ?? '');
        abort_unless(in_array($type, ['maintenance', 'technical'], true), 422, 'Choose a complaint type.');
        $this->assertCanFile($user, $type);

        $category = (string) ($input['category'] ?? '');
        $allowed = $type === 'maintenance' ? self::MAINTENANCE_CATEGORIES : self::TECHNICAL_CATEGORIES;
        abort_unless(in_array($category, $allowed, true), 422, 'Choose a valid category for this complaint type.');

        $priority = (string) ($input['priority'] ?? 'normal');
        abort_unless(in_array($priority, self::PRIORITIES, true), 422, 'Choose a valid priority.');

        $communityId = null;
        $unitId = null;
        $unitNumber = null;
        if ($type === 'maintenance') {
            $communityId = UserActingContextService::currentCommunityId($user);
            abort_unless($communityId, 403, 'An approved community membership is required for maintenance complaints.');
            if (! $this->features->isEnabled($communityId, 'complaints')) {
                abort(403, 'Maintenance complaints are turned off for this community.');
            }
            $this->assertApprovedMember($user, $communityId);
            [$unitId, $unitNumber] = $this->resolveOwnedUnit($user, $communityId, isset($input['unit_id']) ? (int) $input['unit_id'] : null);
        } elseif (UserActingContextService::currentCommunityId($user)) {
            $communityId = UserActingContextService::currentCommunityId($user);
            if (! empty($input['unit_id'])) {
                try {
                    [$unitId, $unitNumber] = $this->resolveOwnedUnit($user, (int) $communityId, (int) $input['unit_id']);
                } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                    $unitId = null;
                    $unitNumber = null;
                }
            }
        }

        $routedTo = $type === 'maintenance' ? 'community_admin' : 'system_admin';
        $name = $this->displayName($user);

        $id = DB::transaction(function () use ($user, $input, $type, $routedTo, $communityId, $unitId, $unitNumber, $category, $priority, $name, $files) {
            $id = DB::table('complaints')->insertGetId([
                'reference' => 'PENDING',
                'type' => $type,
                'routed_to' => $routedTo,
                'community_id' => $communityId,
                'unit_id' => $unitId,
                'unit_number_snapshot' => $unitNumber,
                'reporter_user_id' => $user->id,
                'reporter_name_snapshot' => $name,
                'category' => $category,
                'priority' => $priority,
                'title' => trim((string) $input['title']),
                'description' => trim((string) $input['description']),
                'status' => 'submitted',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $reference = 'CMP-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT);
            DB::table('complaints')->where('id', $id)->update(['reference' => $reference]);
            $this->event($id, $user->id, 'created', null, 'submitted', 'Complaint submitted.');
            foreach ($files as $file) {
                if ($file instanceof UploadedFile) {
                    $this->storeFile($id, null, $user, $file);
                }
            }

            return $id;
        });

        $complaint = $this->find($id);
        $this->notifyQueue($complaint, 'New complaint', $complaint->reference.' was submitted.', $user->id);
        ActivityLogService::recordStatusChange(
            'complaint_submitted',
            'Complaint',
            $id,
            null,
            'submitted',
            'Status',
            $complaint->title,
            $user->id,
            ['reference' => $complaint->reference, 'type' => $type],
        );

        return $this->present($complaint, $user, false);
    }

    public function showForResident(User $user, int $id): array
    {
        return $this->show($user, $id, false);
    }

    public function showForAdmin(User $user, int $id): array
    {
        return $this->show($user, $id, true);
    }

    public function residentIndex(User $user, Request $request): array
    {
        $query = DB::table('complaints')->where('reporter_user_id', $user->id)->whereNull('deleted_at');
        $this->applyFilters($query, $request);
        $counts = $this->counts(clone $query);
        if ($request->filled('status') && $request->string('status')->toString() !== 'all') {
            $query->where('status', $request->string('status')->toString());
        }

        return $this->paginate($query, $request, $user, false, $counts);
    }

    public function adminIndex(User $user, Request $request): array
    {
        $query = DB::table('complaints')->whereNull('deleted_at');
        $this->scopeAdmin($query, $user);
        $this->applyFilters($query, $request);
        $counts = $this->counts(clone $query);
        if ($request->filled('status') && $request->string('status')->toString() !== 'all') {
            $query->where('status', $request->string('status')->toString());
        }

        return $this->paginate($query, $request, $user, true, $counts);
    }

    public function show(User $user, int $id, bool $asAdmin = false): array
    {
        $complaint = $this->visibleComplaint($user, $id);

        return $this->present($complaint, $user, $asAdmin && $this->isQueueAdmin($user, $complaint));
    }

    public function addMessage(User $user, int $id, string $body, string $visibility, array $files = [], bool $asAdmin = false): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        $admin = $asAdmin && $this->isQueueAdmin($user, $complaint);
        abort_if(in_array($complaint->status, ['closed', 'cancelled'], true), 422, 'This complaint is no longer open for messages.');
        if ($visibility === 'internal') {
            abort_unless($admin, 403, 'Internal notes are only available to the assigned support team.');
        } else {
            $visibility = 'public';
        }

        $messageId = DB::table('complaint_messages')->insertGetId([
            'complaint_id' => $id,
            'sender_id' => $user->id,
            'body' => trim($body),
            'visibility' => $visibility,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('complaints')->where('id', $id)->update(['updated_at' => now()]);
        foreach ($files as $file) {
            if ($file instanceof UploadedFile) {
                $this->storeFile($id, $messageId, $user, $file);
            }
        }
        $this->event($id, $user->id, $visibility === 'internal' ? 'internal_note' : 'message', $complaint->status, $complaint->status, null);

        if ($visibility === 'public') {
            if ((int) $complaint->reporter_user_id === (int) $user->id) {
                $this->notifyQueue($complaint, 'New complaint reply', $complaint->reference.' has a new message.', $user->id);
            } else {
                $this->notifyUser((int) $complaint->reporter_user_id, $complaint, 'New reply on your complaint', 'Support replied on '.$complaint->reference.'.', false);
            }
        }

        return $this->show($user, $id, $asAdmin);
    }

    public function transition(User $user, int $id, string $to, ?string $note = null, bool $asAdmin = false): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        $admin = $asAdmin && $this->isQueueAdmin($user, $complaint);
        $from = (string) $complaint->status;
        abort_unless(in_array($to, self::TRANSITIONS[$from] ?? [], true), 422, 'That status change is not available.');
        if (! $admin) {
            abort_unless((int) $complaint->reporter_user_id === (int) $user->id, 403, 'You cannot update this complaint.');
            abort_unless(in_array($to, self::RESIDENT_TARGETS, true), 403, 'You cannot set that status.');
            if ($to === 'cancelled') {
                abort_unless(in_array($from, ['submitted', 'in_review'], true), 422, 'This complaint can no longer be cancelled.');
            }
            if ($to === 'closed' || $to === 'reopened') {
                abort_unless($from === 'resolved', 422, 'Only a resolved complaint can be confirmed or reopened.');
            }
        }

        $updates = ['status' => $to, 'updated_at' => now()];
        if ($to === 'resolved') {
            $updates['resolved_at'] = now();
        }
        if ($to === 'closed') {
            $updates['closed_at'] = now();
        }
        if ($to === 'cancelled') {
            $updates['cancelled_at'] = now();
        }
        DB::table('complaints')->where('id', $id)->update($updates);
        $this->event($id, $user->id, 'status_changed', $from, $to, $note);

        $fresh = $this->find($id);
        $label = $this->statusLabel($to);
        if ((int) $fresh->reporter_user_id !== (int) $user->id) {
            $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', false);
        } else {
            $this->notifyQueue($fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', $user->id);
        }
        ActivityLogService::recordStatusChange('complaint_status_changed', 'Complaint', $id, $from, $to, 'Status', $fresh->title, (int) $fresh->reporter_user_id);

        return $this->present($fresh, $user, $admin);
    }

    public function assign(User $user, int $id, int $assigneeId): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        abort_unless($this->isQueueAdmin($user, $complaint), 403, 'You cannot assign this complaint.');
        $allowed = collect($this->assignees($complaint))->pluck('id')->all();
        abort_unless(in_array($assigneeId, $allowed, true), 422, 'Choose a staff member who can handle this complaint.');
        DB::table('complaints')->where('id', $id)->update([
            'assigned_to_user_id' => $assigneeId,
            'updated_at' => now(),
        ]);
        $assignee = User::query()->find($assigneeId);
        $this->event($id, $user->id, 'assigned', $complaint->status, $complaint->status, $assignee?->name);
        $fresh = $this->find($id);
        if ((int) $assigneeId !== (int) $user->id) {
            $this->notifyUser($assigneeId, $fresh, 'Complaint assigned to you', $fresh->reference.' was assigned to you.', true);
        }

        return $this->present($fresh, $user, true);
    }

    public function feedback(User $user, int $id, int $rating, ?string $comment): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        abort_unless((int) $complaint->reporter_user_id === (int) $user->id, 403, 'Only the resident can leave feedback.');
        abort_unless($complaint->status === 'resolved' || $complaint->status === 'closed', 422, 'Feedback is available after the complaint is resolved.');
        abort_unless($rating >= 1 && $rating <= 5, 422, 'Choose a rating from 1 to 5.');
        DB::table('complaints')->where('id', $id)->update([
            'feedback_rating' => $rating,
            'feedback_comment' => $comment ? trim($comment) : null,
            'updated_at' => now(),
        ]);
        $this->event($id, $user->id, 'feedback', $complaint->status, $complaint->status, $comment);

        return $this->show($user, $id, false);
    }

    public function download(User $user, int $complaintId, int $attachmentId, bool $asAdmin = false): StreamedResponse
    {
        $this->visibleComplaint($user, $complaintId);
        $file = DB::table('complaint_attachments')->where('complaint_id', $complaintId)->where('id', $attachmentId)->first();
        abort_unless($file, 404, 'Attachment not found.');
        $complaint = $this->find($complaintId);
        $admin = $asAdmin && $this->isQueueAdmin($user, $complaint);
        if ($file->message_id) {
            $visibility = DB::table('complaint_messages')->where('id', $file->message_id)->value('visibility');
            abort_if($visibility === 'internal' && ! $admin, 403, 'You cannot open this attachment.');
        }
        abort_unless(Storage::disk($file->disk)->exists($file->file_path), 404, 'Attachment not found.');

        return Storage::disk($file->disk)->download($file->file_path, $file->file_name);
    }

    public function assigneesFor(User $user, int $id): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        abort_unless($this->isQueueAdmin($user, $complaint), 403, 'You cannot view assignees for this complaint.');

        return $this->assignees($complaint);
    }

    private function paginate($query, Request $request, User $user, bool $admin, array $counts): array
    {
        $perPage = min(50, max(1, (int) $request->input('per_page', 20)));
        $page = $query->orderByDesc('updated_at')->paginate($perPage);
        $data = collect($page->items())->map(fn ($row) => $this->summary($row, $user, $admin))->values();

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'counts' => $counts,
            ],
        ];
    }

    private function applyFilters($query, Request $request): void
    {
        if ($request->filled('search')) {
            $search = '%'.$request->string('search')->toString().'%';
            $query->where(function ($inner) use ($search) {
                $inner->where('title', 'like', $search)
                    ->orWhere('reference', 'like', $search)
                    ->orWhere('description', 'like', $search)
                    ->orWhere('reporter_name_snapshot', 'like', $search)
                    ->orWhere('unit_number_snapshot', 'like', $search);
            });
        }
        if ($request->filled('category') && $request->string('category')->toString() !== 'all') {
            $query->where('category', $request->string('category')->toString());
        }
        if ($request->filled('priority') && $request->string('priority')->toString() !== 'all') {
            $query->where('priority', $request->string('priority')->toString());
        }
    }

    private function counts($query): array
    {
        $base = $query;
        $counts = ['all' => (clone $base)->count()];
        foreach (self::STATUSES as $status) {
            $counts[$status] = (clone $base)->where('status', $status)->count();
        }

        return $counts;
    }

    private function scopeAdmin($query, User $user): void
    {
        if (AdminRoleService::isSystemAdmin($user)) {
            $query->where('routed_to', 'system_admin');

            return;
        }
        $communityId = UserActingContextService::requireCurrentCommunityId($user);
        $query->where('routed_to', 'community_admin')->where('community_id', $communityId);
    }

    private function visibleComplaint(User $user, int $id): object
    {
        $complaint = $this->find($id);
        if ((int) $complaint->reporter_user_id === (int) $user->id && ! $this->isQueueAdmin($user, $complaint)) {
            return $complaint;
        }
        abort_unless($this->isQueueAdmin($user, $complaint) || (int) $complaint->reporter_user_id === (int) $user->id, 404, 'Complaint not found.');

        return $complaint;
    }

    private function isQueueAdmin(User $user, object $complaint): bool
    {
        if (AdminRoleService::isResidentMode($user)) {
            return false;
        }
        if ($complaint->routed_to === 'system_admin') {
            return AdminRoleService::isSystemAdmin($user);
        }
        if (! AdminRoleService::isActiveCommunityAdmin($user) && ! AdminRoleService::isSystemAdmin($user)) {
            return false;
        }
        if (AdminRoleService::isSystemAdmin($user)) {
            return false;
        }
        $communityId = UserActingContextService::currentCommunityId($user);

        return $communityId && (int) $communityId === (int) $complaint->community_id;
    }

    private function assertCanFile(User $user, string $type): void
    {
        abort_if(($user->role ?? '') === 'guest', 403, 'Guests cannot submit complaints.');
        abort_if(($user->status ?? '') === 'suspended', 403, 'Suspended accounts cannot submit complaints.');
        if ($type === 'maintenance') {
            abort_if(AdminRoleService::isSystemAdmin($user), 422, 'Use a resident account to submit a maintenance complaint.');
        }
    }

    private function assertApprovedMember(User $user, int $communityId): void
    {
        $ok = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'approved')
            ->exists();
        abort_unless($ok, 403, 'An approved community membership is required for maintenance complaints.');
    }

    /** @return array{0: int, 1: string} */
    private function resolveOwnedUnit(User $user, int $communityId, ?int $unitId): array
    {
        $units = DB::table('unit_residents')
            ->join('units', 'units.id', '=', 'unit_residents.unit_id')
            ->where('unit_residents.user_id', $user->id)
            ->where('unit_residents.community_id', $communityId)
            ->where('unit_residents.status', 'active')
            ->whereNull('unit_residents.left_at')
            ->get(['units.id', 'units.unit_number']);
        abort_if($units->isEmpty(), 422, 'Choose a unit that belongs to you in this community.');
        if (! $unitId) {
            abort_if($units->count() !== 1, 422, 'Choose the unit this complaint is about.');
            $unit = $units->first();

            return [(int) $unit->id, (string) $unit->unit_number];
        }
        $match = $units->firstWhere('id', $unitId);
        abort_unless($match, 422, 'Choose a unit that belongs to you in this community.');

        return [(int) $match->id, (string) $match->unit_number];
    }

    private function storeFile(int $complaintId, ?int $messageId, User $user, UploadedFile $file): void
    {
        $path = $file->store("complaints/{$complaintId}", 'local');
        DB::table('complaint_attachments')->insert([
            'complaint_id' => $complaintId,
            'message_id' => $messageId,
            'uploaded_by' => $user->id,
            'disk' => 'local',
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => (int) $file->getSize(),
            'mime_type' => $file->getClientMimeType(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->event($complaintId, $user->id, 'attachment', null, null, $file->getClientOriginalName());
    }

    private function event(int $complaintId, ?int $actorId, string $action, ?string $from, ?string $to, ?string $note): void
    {
        DB::table('complaint_events')->insert([
            'complaint_id' => $complaintId,
            'actor_id' => $actorId,
            'action' => $action,
            'from_status' => $from,
            'to_status' => $to,
            'note' => $note,
            'created_at' => now(),
        ]);
    }

    private function find(int $id): object
    {
        $row = DB::table('complaints')->where('id', $id)->whereNull('deleted_at')->first();
        abort_unless($row, 404, 'Complaint not found.');

        return $row;
    }

    private function present(object $complaint, User $user, bool $admin): array
    {
        $summary = $this->summary($complaint, $user, $admin);
        $messages = DB::table('complaint_messages')->where('complaint_id', $complaint->id)->orderBy('id')->get();
        if (! $admin) {
            $messages = $messages->where('visibility', 'public')->values();
        }
        $senderIds = $messages->pluck('sender_id')->unique()->all();
        $names = $senderIds === [] ? collect() : DB::table('users')->whereIn('id', $senderIds)->pluck('name', 'id');
        $attachments = DB::table('complaint_attachments')->where('complaint_id', $complaint->id)->orderBy('id')->get();
        if (! $admin) {
            $internalIds = DB::table('complaint_messages')->where('complaint_id', $complaint->id)->where('visibility', 'internal')->pluck('id');
            $attachments = $attachments->reject(fn ($file) => $file->message_id && $internalIds->contains($file->message_id))->values();
        }
        $events = DB::table('complaint_events')->where('complaint_id', $complaint->id)->orderBy('id')->get();
        if (! $admin) {
            $events = $events->reject(fn ($event) => $event->action === 'internal_note')->values();
        }

        $summary['description'] = $complaint->description;
        $summary['feedback_rating'] = $complaint->feedback_rating ? (int) $complaint->feedback_rating : null;
        $summary['feedback_comment'] = $complaint->feedback_comment;
        $summary['allowed_transitions'] = $this->allowedTransitions($complaint, $user, $admin);
        $summary['messages'] = $messages->map(fn ($message) => [
            'id' => (int) $message->id,
            'sender_id' => (int) $message->sender_id,
            'sender_name' => $names[$message->sender_id] ?? 'User',
            'body' => $message->body,
            'visibility' => $message->visibility,
            'created_at' => $message->created_at,
        ])->values()->all();
        $summary['attachments'] = $attachments->map(fn ($file) => [
            'id' => (int) $file->id,
            'message_id' => $file->message_id ? (int) $file->message_id : null,
            'file_name' => $file->file_name,
            'file_size' => (int) $file->file_size,
            'mime_type' => $file->mime_type,
            'created_at' => $file->created_at,
        ])->values()->all();
        $summary['events'] = $events->map(fn ($event) => [
            'id' => (int) $event->id,
            'action' => $event->action,
            'from_status' => $event->from_status,
            'to_status' => $event->to_status,
            'note' => $event->note,
            'created_at' => $event->created_at,
        ])->values()->all();
        if ($admin) {
            $summary['assignees'] = $this->assignees($complaint);
        }

        return $summary;
    }

    private function summary(object $complaint, User $user, bool $admin): array
    {
        $assignee = $complaint->assigned_to_user_id
            ? DB::table('users')->where('id', $complaint->assigned_to_user_id)->value('name')
            : null;

        return [
            'id' => (int) $complaint->id,
            'reference' => $complaint->reference,
            'type' => $complaint->type,
            'routed_to' => $complaint->routed_to,
            'community_id' => $complaint->community_id ? (int) $complaint->community_id : null,
            'unit_id' => $complaint->unit_id ? (int) $complaint->unit_id : null,
            'unit_number' => $complaint->unit_number_snapshot,
            'reporter_user_id' => (int) $complaint->reporter_user_id,
            'reporter_name' => $complaint->reporter_name_snapshot,
            'category' => $complaint->category,
            'category_label' => $this->categoryLabel($complaint->category),
            'priority' => $complaint->priority,
            'title' => $complaint->title,
            'status' => $complaint->status,
            'status_label' => $this->statusLabel($complaint->status),
            'assigned_to_user_id' => $complaint->assigned_to_user_id ? (int) $complaint->assigned_to_user_id : null,
            'assigned_to_name' => $assignee,
            'support_team' => $complaint->routed_to === 'system_admin' ? 'System Admin' : 'Community Admin',
            'allowed_transitions' => $this->allowedTransitions($complaint, $user, $admin),
            'created_at' => $complaint->created_at,
            'updated_at' => $complaint->updated_at,
            'resolved_at' => $complaint->resolved_at,
            'can_manage' => $admin,
        ];
    }

    private function allowedTransitions(object $complaint, User $user, bool $admin): array
    {
        $next = self::TRANSITIONS[$complaint->status] ?? [];
        if ($admin) {
            return array_values($next);
        }
        if ((int) $complaint->reporter_user_id !== (int) $user->id) {
            return [];
        }

        return array_values(array_intersect($next, self::RESIDENT_TARGETS));
    }

    private function assignees(object $complaint): array
    {
        if ($complaint->routed_to === 'system_admin') {
            return DB::table('users')
                ->whereIn('role', ['system_admin', 'admin'])
                ->where('status', 'active')
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name])
                ->all();
        }

        return DB::table('community_memberships')
            ->join('users', 'users.id', '=', 'community_memberships.user_id')
            ->where('community_memberships.community_id', $complaint->community_id)
            ->where('community_memberships.role', 'admin')
            ->where('community_memberships.status', 'approved')
            ->where('users.role', 'community_admin')
            ->where('users.community_admin_status', 'approved')
            ->where('users.status', 'active')
            ->orderBy('users.name')
            ->get(['users.id', 'users.name'])
            ->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name])
            ->all();
    }

    private function notifyQueue(object $complaint, string $title, string $body, int $exceptUserId): void
    {
        $ids = collect($this->assignees($complaint))->pluck('id');
        if ($complaint->assigned_to_user_id) {
            $ids->prepend((int) $complaint->assigned_to_user_id);
        }
        foreach ($ids->unique() as $userId) {
            if ((int) $userId === $exceptUserId) {
                continue;
            }
            $this->notifyUser((int) $userId, $complaint, $title, $body, true);
        }
    }

    private function notifyUser(int $userId, object $complaint, string $title, string $body, bool $admin): void
    {
        $action = $admin
            ? ($complaint->routed_to === 'system_admin'
                ? '/admin/support-complaints?complaint='.$complaint->id
                : '/admin/complaints?complaint='.$complaint->id)
            : '/screens/complaints/detail?id='.$complaint->id;
        NotificationService::send($userId, 'complaint', $title, $body, $action, [
            'kind' => 'complaint',
            'complaint_id' => (int) $complaint->id,
            'audience' => $admin ? 'admin' : 'resident',
            'community_id' => $complaint->community_id ? (int) $complaint->community_id : null,
        ], $complaint->community_id ? (int) $complaint->community_id : null);
    }

    private function displayName(User $user): string
    {
        $profile = DB::table('profiles')->where('user_id', $user->id)->value('display_name');

        return trim((string) ($profile ?: $user->name ?: 'Resident'));
    }

    private function statusLabel(string $status): string
    {
        return match ($status) {
            'in_review' => 'In Review',
            'in_progress' => 'In Progress',
            'waiting_on_resident' => 'Waiting on Resident',
            'reopened' => 'Reopened',
            default => ucfirst($status),
        };
    }

    private function categoryLabel(string $category): string
    {
        return match ($category) {
            'app_bug' => 'App Bug',
            'lifts' => 'Lifts',
            default => ucfirst(str_replace('_', ' ', $category)),
        };
    }
}
