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
        'not_resolved',
        'resolved',
        'reopened',
        'closed',
        'cancelled',
    ];

    /** @var array<string, list<string>> */
    private const TRANSITIONS = [
        'submitted' => ['in_review', 'cancelled'],
        'in_review' => ['in_progress', 'waiting_on_resident', 'not_resolved', 'cancelled'],
        'in_progress' => ['waiting_on_resident', 'not_resolved', 'resolved', 'cancelled'],
        'waiting_on_resident' => ['in_progress', 'not_resolved', 'resolved', 'cancelled'],
        'not_resolved' => ['in_review', 'in_progress', 'resolved', 'cancelled'],
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
        app(ComplaintMailer::class)->submitted($complaint);
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

        $payload = $this->paginate($query, $request, $user, true, $counts);
        $payload['meta']['staff_revision'] = $this->staffRosterRevision($user);

        return $payload;
    }

    public function show(User $user, int $id, bool $asAdmin = false): array
    {
        $complaint = $this->visibleComplaint($user, $id);

        return $this->present($complaint, $user, $asAdmin && $this->isQueueAdmin($user, $complaint));
    }

    public function addMessage(User $user, int $id, string $body, string $visibility, array $files = [], bool $asAdmin = false, string $mailKind = 'message'): array
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
                $this->notifyQueue($complaint, 'New complaint reply', $complaint->reference.' has a new message.', $user->id, true);
            } else {
                $this->notifyUser((int) $complaint->reporter_user_id, $complaint, 'New reply on your complaint', 'There is an update on '.$complaint->reference.'.', false, true);
                if ($this->isAssignedStaff($user, $complaint)) {
                    $this->notifyQueue($complaint, 'Staff work update', $complaint->reference.' has a work update.', $user->id, true);
                }
            }
            $this->notifyAssignedStaff($complaint, $user, 'New complaint message', 'There is an update on '.$complaint->reference.'.', true);
            $freshComplaint = $this->find($id);
            if ($mailKind === 'work_update') {
                app(ComplaintMailer::class)->workUpdated($freshComplaint, $user, (int) $messageId, trim($body));
            } else {
                app(ComplaintMailer::class)->messageReceived($freshComplaint, $user, (int) $messageId, trim($body));
            }
        }

        return $this->show($user, $id, $asAdmin);
    }

    public function transition(User $user, int $id, string $to, ?string $note = null, bool $asAdmin = false): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        $admin = $asAdmin && $this->isQueueAdmin($user, $complaint);
        $byStaff = $this->isAssignedStaff($user, $complaint) && ! $admin;
        $from = (string) $complaint->status;
        if ($admin && $this->communityStaffOwnsStatus($complaint)) {
            abort(403, 'Assigned staff update the work status. Reassign the complaint if someone else should take it.');
        }
        if ($byStaff) {
            abort_unless(in_array($to, $this->staffTransitions($complaint), true), 422, 'That status change is not available.');
            if (in_array($to, ['resolved', 'not_resolved'], true) && mb_strlen(trim((string) $note)) < 3) {
                abort(422, $to === 'resolved'
                    ? 'Add a completion note before marking this complaint resolved.'
                    : 'Add a note explaining why this complaint is not resolved.');
            }
        } else {
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
        }

        $eventId = DB::transaction(function () use ($id, $user, $from, $to, $note) {
            $locked = DB::table('complaints')->where('id', $id)->lockForUpdate()->first();
            abort_unless($locked && $locked->status === $from, 409, 'This complaint was updated by someone else. Refresh and try again.');
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

            return $this->event($id, $user->id, 'status_changed', $from, $to, $note);
        });

        $fresh = $this->find($id);
        $label = $this->statusLabel($to);
        if ((int) $fresh->reporter_user_id !== (int) $user->id) {
            $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', false);
        }
        if ($byStaff || (int) $fresh->reporter_user_id === (int) $user->id) {
            $this->notifyQueue($fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', $user->id);
        }
        if ($fresh->assigned_to_user_id && (int) $fresh->assigned_to_user_id !== (int) $user->id) {
            $this->notifyUser((int) $fresh->assigned_to_user_id, $fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', false, false, 'staff');
        }
        app(ComplaintMailer::class)->statusChanged($fresh, $from, $to, $user, $eventId, $note, $byStaff);
        ActivityLogService::recordStatusChange('complaint_status_changed', 'Complaint', $id, $from, $to, 'Status', $fresh->title, (int) $fresh->reporter_user_id);

        return $this->present($fresh, $user, $admin || $byStaff);
    }

    public function staffTransition(User $user, int $id, string $to, ?string $note = null): array
    {
        $complaint = $this->assignedComplaint($user, $id);
        abort_unless($this->assignmentAccepted($complaint, $user), 422, 'Accept the assignment before updating its status.');

        return $this->transition($user, $complaint->id, $to, $note, false);
    }

    public function assign(User $user, int $id, int $assigneeId): array
    {
        $complaint = $this->visibleComplaint($user, $id);
        abort_unless($this->isQueueAdmin($user, $complaint), 403, 'You cannot assign this complaint.');
        if ($assigneeId <= 0) {
            return $this->clearAssignment($user, $complaint);
        }
        if ($complaint->type !== 'maintenance') {
            return $this->assignTechnical($user, $complaint, $assigneeId);
        }
        $allowed = collect($this->assignees($complaint))->keyBy('id');
        $choice = $allowed->get($assigneeId);
        abort_unless($choice, 422, 'Choose an active staff member for this community.');
        abort_if(in_array($complaint->status, ['closed', 'cancelled'], true), 422, 'This complaint can no longer be assigned.');

        $previousUserId = $complaint->assigned_to_user_id ? (int) $complaint->assigned_to_user_id : null;
        $reassigned = $previousUserId && $previousUserId !== $assigneeId;
        $eventId = DB::transaction(function () use ($complaint, $user, $assigneeId, $choice, $reassigned, $previousUserId) {
            $locked = DB::table('complaints')->where('id', $complaint->id)->lockForUpdate()->first();
            abort_unless($locked, 404, 'Complaint not found.');
            DB::table('complaints')->where('id', $complaint->id)->update([
                'assigned_to_user_id' => $assigneeId,
                'assigned_staff_id' => $choice['staff_id'],
                'updated_at' => now(),
            ]);
            DB::table('complaint_assignments')->insert([
                'complaint_id' => $complaint->id,
                'staff_id' => $choice['staff_id'],
                'user_id' => $assigneeId,
                'assigned_by' => $user->id,
                'action' => $reassigned ? 'reassigned' : 'assigned',
                'note' => $choice['name'],
                'created_at' => now(),
            ]);

            return $this->event($complaint->id, $user->id, $reassigned ? 'reassigned' : 'assigned', $locked->status, $locked->status, $choice['name']);
        });

        $fresh = $this->find($id);
        $this->notifyUser($assigneeId, $fresh, 'Complaint assigned to you', $fresh->reference.' was assigned to you.', false, false, 'staff');
        if ((int) $fresh->reporter_user_id !== $assigneeId) {
            $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Staff assigned', $fresh->reference.' was assigned to '.$choice['name'].'.', false);
        }
        if ($reassigned && $previousUserId) {
            $this->notifyUser($previousUserId, $fresh, 'Assignment updated', $fresh->reference.' was reassigned.', false);
        }
        app(ComplaintMailer::class)->assigned($fresh, $user, $eventId, $reassigned);

        return $this->present($fresh, $user, true);
    }

    private function clearAssignment(User $user, object $complaint): array
    {
        abort_unless($complaint->type === 'maintenance', 422, 'This complaint is not assigned to community staff.');
        abort_if(in_array($complaint->status, ['closed', 'cancelled'], true), 422, 'This complaint can no longer be assigned.');
        if (! $complaint->assigned_to_user_id && ! $complaint->assigned_staff_id) {
            return $this->present($complaint, $user, true);
        }

        $previousUserId = $complaint->assigned_to_user_id ? (int) $complaint->assigned_to_user_id : null;
        $eventId = DB::transaction(function () use ($complaint, $user) {
            $locked = DB::table('complaints')->where('id', $complaint->id)->lockForUpdate()->first();
            abort_unless($locked, 404, 'Complaint not found.');
            DB::table('complaints')->where('id', $complaint->id)->update([
                'assigned_to_user_id' => null,
                'assigned_staff_id' => null,
                'updated_at' => now(),
            ]);
            if ($locked->assigned_to_user_id) {
                DB::table('complaint_assignments')->insert([
                    'complaint_id' => $complaint->id,
                    'staff_id' => $locked->assigned_staff_id,
                    'user_id' => $locked->assigned_to_user_id,
                    'assigned_by' => $user->id,
                    'action' => 'unassigned',
                    'note' => null,
                    'created_at' => now(),
                ]);
            }

            return $this->event($complaint->id, $user->id, 'unassigned', $locked->status, $locked->status, null);
        });

        $fresh = $this->find($complaint->id);
        if ($previousUserId) {
            $this->notifyUser($previousUserId, $fresh, 'Assignment removed', $fresh->reference.' is no longer assigned to you.', false, false, 'staff');
        }
        if ($previousUserId !== (int) $fresh->reporter_user_id) {
            $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Assignment removed', $fresh->reference.' is waiting for a staff member.', false);
        }
        app(ComplaintMailer::class)->assignmentCleared($fresh, $user, $eventId, $previousUserId);

        return $this->present($fresh, $user, true);
    }

    public function releaseStaffAssignments(User $admin, object $staff): int
    {
        $rows = DB::table('complaints')
            ->where('assigned_staff_id', $staff->id)
            ->where('community_id', $staff->community_id)
            ->where('type', 'maintenance')
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['closed', 'cancelled'])
            ->get();

        foreach ($rows as $complaint) {
            $previousUserId = $complaint->assigned_to_user_id ? (int) $complaint->assigned_to_user_id : null;
            $eventId = DB::transaction(function () use ($complaint, $admin) {
                $locked = DB::table('complaints')->where('id', $complaint->id)->lockForUpdate()->first();
                if (! $locked || ! $locked->assigned_staff_id) {
                    return 0;
                }
                DB::table('complaints')->where('id', $complaint->id)->update([
                    'assigned_to_user_id' => null,
                    'assigned_staff_id' => null,
                    'updated_at' => now(),
                ]);
                DB::table('complaint_assignments')->insert([
                    'complaint_id' => $complaint->id,
                    'staff_id' => $locked->assigned_staff_id,
                    'user_id' => $locked->assigned_to_user_id,
                    'assigned_by' => $admin->id,
                    'action' => 'unassigned',
                    'note' => 'Staff access removed',
                    'created_at' => now(),
                ]);

                return $this->event($complaint->id, $admin->id, 'unassigned', $locked->status, $locked->status, 'Staff access removed');
            });
            if (! $eventId) {
                continue;
            }
            $fresh = $this->find($complaint->id);
            if ($previousUserId && $previousUserId !== (int) $admin->id) {
                $this->notifyUser($previousUserId, $fresh, 'Assignment removed', $fresh->reference.' is no longer assigned to you.', false, false, 'staff');
            }
            if ($previousUserId !== (int) $fresh->reporter_user_id) {
                $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Assignment removed', $fresh->reference.' is waiting for a staff member.', false);
            }
            app(ComplaintMailer::class)->assignmentCleared($fresh, $admin, $eventId, $previousUserId);
        }

        if ($rows->isNotEmpty()) {
            $count = $rows->count();
            $noun = $count === 1 ? 'complaint needs' : 'complaints need';
            foreach ($this->queueAdminIds($rows->first()) as $adminId) {
                NotificationService::send(
                    (int) $adminId,
                    'complaint',
                    'Staff assignments need review',
                    $staff->name.' no longer has staff access. '.$count.' open '.$noun.' a new staff member.',
                    '/admin/complaints',
                    [
                        'kind' => 'complaint',
                        'audience' => 'admin',
                        'community_id' => (int) $staff->community_id,
                    ],
                    (int) $staff->community_id,
                );
            }
        }

        return $rows->count();
    }

    private function assignTechnical(User $user, object $complaint, int $assigneeId): array
    {
        $allowed = collect($this->assignees($complaint))->pluck('id')->all();
        abort_unless(in_array($assigneeId, $allowed, true), 422, 'Choose a system administrator for this complaint.');
        DB::table('complaints')->where('id', $complaint->id)->update([
            'assigned_to_user_id' => $assigneeId,
            'assigned_staff_id' => null,
            'updated_at' => now(),
        ]);
        $assignee = User::query()->find($assigneeId);
        $this->event($complaint->id, $user->id, 'assigned', $complaint->status, $complaint->status, $assignee?->name);

        return $this->present($this->find($complaint->id), $user, true);
    }

    public function respondToAssignment(User $user, int $id, string $decision, ?string $note = null): array
    {
        $complaint = $this->assignedComplaint($user, $id);
        abort_unless(in_array($decision, ['accept', 'decline'], true), 422, 'Choose accept or decline.');
        if ($decision === 'decline') {
            $from = (string) $complaint->status;
            $to = in_array($from, ['submitted', 'in_review', 'reopened'], true) ? 'submitted' : $from;
            $statusEventId = DB::transaction(function () use ($complaint, $user, $note, $from, $to) {
                DB::table('complaints')->where('id', $complaint->id)->update([
                    'assigned_to_user_id' => null,
                    'assigned_staff_id' => null,
                    'status' => $to,
                    'updated_at' => now(),
                ]);
                DB::table('complaint_assignments')->insert([
                    'complaint_id' => $complaint->id,
                    'staff_id' => $complaint->assigned_staff_id,
                    'user_id' => $user->id,
                    'assigned_by' => $user->id,
                    'action' => 'declined',
                    'note' => $note,
                    'created_at' => now(),
                ]);
                $this->event($complaint->id, $user->id, 'declined', $from, $to, $note);

                return $to === $from ? 0 : $this->event($complaint->id, $user->id, 'status_changed', $from, $to, $note);
            });
            $fresh = $this->find($id);
            $payload = $this->staffPayload($fresh, $user);
            $this->afterResponse(function () use ($fresh, $user, $from, $to, $statusEventId, $note) {
                if ($statusEventId) {
                    app(ComplaintMailer::class)->statusChanged($fresh, $from, $to, $user, $statusEventId, $note, true);
                }
                $this->notifyQueue($fresh, 'Assignment declined', $fresh->reference.' was declined by staff.', $user->id);
                if ((int) $fresh->reporter_user_id !== (int) $user->id) {
                    $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Assignment update', $fresh->reference.' is waiting for a new staff member.', false);
                }
            });

            return $payload;
        }

        $from = (string) $complaint->status;
        $to = in_array($from, ['submitted', 'reopened'], true) ? 'in_review' : $from;
        [$acceptedEventId, $statusEventId] = DB::transaction(function () use ($complaint, $user, $note, $from, $to) {
            DB::table('complaint_assignments')->insert([
                'complaint_id' => $complaint->id,
                'staff_id' => $complaint->assigned_staff_id,
                'user_id' => $user->id,
                'assigned_by' => $user->id,
                'action' => 'accepted',
                'note' => $note,
                'created_at' => now(),
            ]);
            $acceptedEventId = $this->event($complaint->id, $user->id, 'accepted', $from, $from, $note);
            if ($to === $from) {
                return [$acceptedEventId, 0];
            }
            DB::table('complaints')->where('id', $complaint->id)->update([
                'status' => $to,
                'updated_at' => now(),
            ]);

            return [$acceptedEventId, $this->event($complaint->id, $user->id, 'status_changed', $from, $to, 'Assignment accepted')];
        });
        $fresh = $this->find($id);
        $payload = $this->staffPayload($fresh, $user);
        $label = $this->statusLabel($to);
        $this->afterResponse(function () use ($fresh, $user, $acceptedEventId, $statusEventId, $label, $note) {
            if ($statusEventId) {
                if ((int) $fresh->reporter_user_id !== (int) $user->id) {
                    $this->notifyUser((int) $fresh->reporter_user_id, $fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', false);
                }
                $this->notifyQueue($fresh, 'Complaint '.$label, $fresh->reference.' is now '.$label.'.', $user->id);
            }
            app(ComplaintMailer::class)->assignmentAccepted($fresh, $user, $acceptedEventId, $note);
        });

        return $payload;
    }

    public function staffIndex(User $user, Request $request): array
    {
        $access = app(CommunityStaffService::class)->access($user);
        $communityIds = collect($access['communities'])->pluck('id');
        abort_if($communityIds->isEmpty(), 403, 'You do not have active staff access.');
        $requestedCommunity = (int) $request->input('community_id', 0);
        if ($requestedCommunity > 0) {
            abort_unless($communityIds->contains($requestedCommunity), 403, 'You do not have staff access in that community.');
        }

        $query = DB::table('complaints')
            ->where('assigned_to_user_id', $user->id)
            ->whereIn('community_id', $communityIds->all())
            ->where('type', 'maintenance')
            ->whereNull('deleted_at');
        if ($requestedCommunity > 0) {
            $query->where('community_id', $requestedCommunity);
        }
        $this->applyFilters($query, $request);
        $counts = $this->counts(clone $query);
        $statusFilter = $request->string('status')->toString();
        if ($request->filled('status') && $statusFilter !== 'all') {
            if ($statusFilter === 'assigned') {
                $query->whereIn('status', ['submitted', 'in_review', 'reopened']);
            } elseif ($statusFilter === 'completed') {
                $query->whereIn('status', ['resolved', 'closed']);
            } else {
                $query->where('status', $statusFilter);
            }
        }

        $payload = $this->paginate($query, $request, $user, false, $counts);
        $ids = collect($payload['data'])->pluck('id')->all();
        $assignedAt = $ids === [] ? collect() : DB::table('complaint_assignments')
            ->whereIn('complaint_id', $ids)
            ->where('user_id', $user->id)
            ->whereIn('action', ['assigned', 'reassigned'])
            ->selectRaw('complaint_id, MAX(created_at) as assigned_at')
            ->groupBy('complaint_id')
            ->pluck('assigned_at', 'complaint_id');
        $previews = $ids === [] ? collect() : DB::table('complaint_messages')
            ->select('complaint_id', 'body', 'created_at')
            ->whereIn('id', function ($inner) use ($ids) {
                $inner->selectRaw('MAX(id)')
                    ->from('complaint_messages')
                    ->where('visibility', 'public')
                    ->whereIn('complaint_id', $ids)
                    ->groupBy('complaint_id');
            })
            ->get()
            ->keyBy('complaint_id');
        $reporterIds = collect($payload['data'])->pluck('reporter_user_id')->unique()->filter()->all();
        $phones = $reporterIds === [] ? collect() : DB::table('users')->whereIn('id', $reporterIds)->pluck('phone', 'id');
        $payload['data'] = collect($payload['data'])->map(function (array $row) use ($assignedAt, $previews, $phones) {
            $preview = $previews[$row['id']] ?? null;
            $row['assigned_at'] = $assignedAt[$row['id']] ?? null;
            $row['last_message'] = $preview->body ?? null;
            $row['last_message_at'] = $preview->created_at ?? null;
            $row['reporter_phone'] = $this->dialablePhone($phones[$row['reporter_user_id']] ?? null);

            return $row;
        })->all();
        $payload['meta']['communities'] = $access['communities'];
        $payload['meta']['summary'] = [
            'assigned' => ($counts['submitted'] ?? 0) + ($counts['in_review'] ?? 0) + ($counts['reopened'] ?? 0),
            'in_progress' => $counts['in_progress'] ?? 0,
            'waiting_on_resident' => $counts['waiting_on_resident'] ?? 0,
            'resolved' => $counts['resolved'] ?? 0,
            'completed' => ($counts['resolved'] ?? 0) + ($counts['closed'] ?? 0),
        ];

        return $payload;
    }

    public function staffShow(User $user, int $id): array
    {
        return $this->staffPayload($this->assignedComplaint($user, $id), $user);
    }

    public function staffUpdate(User $user, int $id, string $body, array $files = []): array
    {
        $complaint = $this->assignedComplaint($user, $id);
        abort_unless($this->assignmentAccepted($complaint, $user), 422, 'Accept the assignment before adding a work update.');
        abort_if(in_array($complaint->status, ['closed', 'cancelled'], true), 422, 'This complaint is no longer open for updates.');

        return $this->addMessage($user, $complaint->id, $body, 'public', $files, false, 'work_update');
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
        $data = collect($page->items())->map(fn ($row) => $this->summary($row, $user, $admin))->values()->all();
        $data = $this->decorateWorkflow($data);
        $unread = $this->unreadCounts($user, array_column($data, 'id'));
        $data = collect($data)->map(function (array $row) use ($unread) {
            $row['unread_count'] = (int) ($unread[$row['id']] ?? 0);

            return $row;
        })->values();

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
                    ->orWhere('unit_number_snapshot', 'like', $search)
                    ->orWhereIn('community_id', DB::table('communities')->select('id')->where('name', 'like', $search));
            });
        }
        if ($request->filled('category') && $request->string('category')->toString() !== 'all') {
            $query->where('category', $request->string('category')->toString());
        }
        if ($request->filled('priority') && $request->string('priority')->toString() !== 'all') {
            $query->where('priority', $request->string('priority')->toString());
        }
        if ($request->filled('date_from') && preg_match('/^\d{4}-\d{2}-\d{2}$/', $request->string('date_from')->toString())) {
            $query->whereDate('created_at', '>=', $request->string('date_from')->toString());
        }
        if ($request->filled('date_to') && preg_match('/^\d{4}-\d{2}-\d{2}$/', $request->string('date_to')->toString())) {
            $query->whereDate('created_at', '<=', $request->string('date_to')->toString());
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

    private function staffRosterRevision(User $user): ?string
    {
        if (AdminRoleService::isSystemAdmin($user)) {
            return null;
        }
        $communityId = UserActingContextService::requireCurrentCommunityId($user);
        $stamp = DB::table('community_staff')->where('community_id', $communityId)->max('updated_at');

        return $stamp ? (string) $stamp : null;
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
        if ($this->isAssignedStaff($user, $complaint)) {
            return $complaint;
        }
        if ((int) $complaint->reporter_user_id === (int) $user->id && ! $this->isQueueAdmin($user, $complaint)) {
            return $complaint;
        }
        abort_unless($this->isQueueAdmin($user, $complaint) || (int) $complaint->reporter_user_id === (int) $user->id, 404, 'Complaint not found.');

        return $complaint;
    }

    private function communityStaffOwnsStatus(object $complaint): bool
    {
        return $complaint->type === 'maintenance' && $complaint->routed_to === 'community_admin';
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

    private function afterResponse(\Closure $callback): void
    {
        app()->terminating(function () use ($callback) {
            try {
                $callback();
            } catch (\Throwable $error) {
                \Illuminate\Support\Facades\Log::warning('Complaint follow-up failed after the response was sent.', [
                    'error' => $error->getMessage(),
                ]);
            }
        });
    }

    private function event(int $complaintId, ?int $actorId, string $action, ?string $from, ?string $to, ?string $note): int
    {
        return (int) DB::table('complaint_events')->insertGetId([
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
        $summary = $this->decorateWorkflow([$this->summary($complaint, $user, $admin)])[0];
        $summary['unread_count'] = (int) ($this->unreadCounts($user, [(int) $complaint->id])[(int) $complaint->id] ?? 0);
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
        $actorIds = $events->pluck('actor_id')->filter()->unique()->all();
        $actorNames = $actorIds === [] ? collect() : DB::table('users')->whereIn('id', $actorIds)->pluck('name', 'id');

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
            'actor_name' => $event->actor_id ? ($actorNames[$event->actor_id] ?? null) : null,
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
            'assigned_staff_id' => isset($complaint->assigned_staff_id) && $complaint->assigned_staff_id ? (int) $complaint->assigned_staff_id : null,
            'assigned_to_name' => $assignee,
            'assigned_staff_label' => $this->assignedStaffLabel($complaint),
            'support_team' => $complaint->routed_to === 'system_admin' ? 'System Admin' : 'Community Admin',
            'community_name' => $complaint->community_id
                ? (string) (DB::table('communities')->where('id', $complaint->community_id)->value('name') ?? '')
                : null,
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
            if ($this->communityStaffOwnsStatus($complaint)) {
                return [];
            }

            return array_values($next);
        }
        if ($this->isAssignedStaff($user, $complaint)) {
            return $this->staffTransitions($complaint);
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

        if (! $complaint->community_id) {
            return [];
        }
        $match = CommunityStaffService::CATEGORY_MATCH[$complaint->category] ?? null;
        $rows = DB::table('community_staff')
            ->where('community_id', $complaint->community_id)
            ->where('status', 'active')
            ->where('availability', 'available')
            ->whereNotNull('activated_at')
            ->orderBy('name')
            ->get();
        $staff = app(CommunityStaffService::class);

        return $rows->map(function ($row) use ($match, $staff) {
            $skills = json_decode((string) $row->specializations, true) ?: [];
            $matched = $match && in_array($match, $skills, true);

            return [
                'id' => (int) $row->user_id,
                'staff_id' => (int) $row->id,
                'name' => $row->name,
                'label' => $row->name.' · '.$staff->skillLabel($skills),
                'specializations' => $skills,
                'matched' => $matched,
                'activated' => true,
                'availability' => $row->availability,
            ];
        })->sortByDesc('matched')->values()->all();
    }

    /** @return list<string> */
    private function staffTransitions(object $complaint): array
    {
        $current = $this->staffStatusKey((string) $complaint->status);
        if ($current === null || in_array($complaint->status, ['resolved', 'closed', 'cancelled'], true)) {
            return [];
        }

        $targets = [
            'pending' => 'in_review',
            'in_progress' => 'in_progress',
            'not_resolved' => 'not_resolved',
            'resolved' => 'resolved',
        ];
        $next = [];
        foreach ($targets as $key => $status) {
            if ($key !== $current) {
                $next[] = $status;
            }
        }

        return $next;
    }

    private function staffStatusKey(string $status): ?string
    {
        return match ($status) {
            'submitted', 'in_review', 'reopened' => 'pending',
            'in_progress' => 'in_progress',
            'waiting_on_resident', 'not_resolved' => 'not_resolved',
            'resolved', 'closed' => 'resolved',
            default => null,
        };
    }

    private function dialablePhone(mixed $phone): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '') {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 7 || strlen($digits) > 15) {
            return null;
        }

        return str_starts_with($phone, '+') ? '+'.$digits : $digits;
    }

    private function isAssignedStaff(User $user, object $complaint): bool
    {
        if (! $complaint->assigned_staff_id || (int) $complaint->assigned_to_user_id !== (int) $user->id) {
            return false;
        }

        return DB::table('community_staff')
            ->where('id', $complaint->assigned_staff_id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereNotNull('activated_at')
            ->exists();
    }

    private function assignedComplaint(User $user, int $id): object
    {
        $complaint = $this->find($id);
        abort_unless($this->isAssignedStaff($user, $complaint), 404, 'Complaint not found.');

        return $complaint;
    }

    private function staffPayload(object $complaint, User $user): array
    {
        $payload = $this->present($complaint, $user, false);
        $accepted = $this->assignmentAccepted($complaint, $user);
        $payload['assignment_state'] = $accepted ? 'accepted' : 'pending';
        $payload['allowed_transitions'] = $accepted ? $this->staffTransitions($complaint) : [];
        $payload['can_manage'] = false;
        $payload['assigned_at'] = DB::table('complaint_assignments')
            ->where('complaint_id', $complaint->id)
            ->where('user_id', $user->id)
            ->whereIn('action', ['assigned', 'reassigned'])
            ->orderByDesc('id')
            ->value('created_at');
        $reporter = DB::table('users')->where('id', $complaint->reporter_user_id)->first(['email', 'phone']);
        $community = $complaint->community_id
            ? DB::table('communities')->where('id', $complaint->community_id)->first(['address', 'region'])
            : null;
        $payload['reporter_email'] = $reporter && $reporter->email ? (string) $reporter->email : null;
        $payload['reporter_phone'] = $this->dialablePhone($reporter->phone ?? null);
        $payload['community_address'] = $community && $community->address ? (string) $community->address : null;
        $payload['community_region'] = $community && $community->region ? (string) $community->region : null;

        return $payload;
    }

    private function assignmentAccepted(object $complaint, User $user): bool
    {
        $action = DB::table('complaint_assignments')
            ->where('complaint_id', $complaint->id)
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->value('action');

        return $action === 'accepted';
    }

    private function assignedStaffLabel(object $complaint): ?string
    {
        if (! isset($complaint->assigned_staff_id) || ! $complaint->assigned_staff_id) {
            return $complaint->assigned_to_user_id
                ? (DB::table('users')->where('id', $complaint->assigned_to_user_id)->value('name') ?: null)
                : null;
        }
        $row = DB::table('community_staff')->where('id', $complaint->assigned_staff_id)->first();
        if (! $row) {
            return null;
        }
        $skills = json_decode((string) $row->specializations, true) ?: [];

        return $row->name.' · '.app(CommunityStaffService::class)->skillLabel($skills);
    }

    public function markRead(User $user, int $id): array
    {
        $this->visibleComplaint($user, $id);
        $last = (int) DB::table('complaint_messages')
            ->where('complaint_id', $id)
            ->where('visibility', 'public')
            ->max('id');
        DB::table('complaint_reads')->updateOrInsert(
            ['complaint_id' => $id, 'user_id' => $user->id],
            ['last_message_id' => $last, 'read_at' => now()],
        );

        return ['unread_count' => 0];
    }

    /** @param list<int> $complaintIds
     * @return array<int, int>
     */
    private function unreadCounts(User $user, array $complaintIds): array
    {
        $complaintIds = array_values(array_filter(array_map('intval', $complaintIds)));
        if ($complaintIds === []) {
            return [];
        }
        $reads = DB::table('complaint_reads')
            ->where('user_id', $user->id)
            ->whereIn('complaint_id', $complaintIds)
            ->pluck('last_message_id', 'complaint_id');
        $counts = [];
        $rows = DB::table('complaint_messages')
            ->whereIn('complaint_id', $complaintIds)
            ->where('visibility', 'public')
            ->where('sender_id', '!=', $user->id)
            ->get(['id', 'complaint_id']);
        foreach ($rows as $row) {
            if ((int) $row->id <= (int) ($reads[$row->complaint_id] ?? 0)) {
                continue;
            }
            $counts[(int) $row->complaint_id] = ($counts[(int) $row->complaint_id] ?? 0) + 1;
        }

        return $counts;
    }

    private function notifyQueue(object $complaint, string $title, string $body, int $exceptUserId, bool $openChat = false): void
    {
        foreach ($this->queueAdminIds($complaint) as $userId) {
            if ((int) $userId === $exceptUserId) {
                continue;
            }
            $this->notifyUser((int) $userId, $complaint, $title, $body, true, $openChat);
        }
    }

    /** @return list<int> */
    private function queueAdminIds(object $complaint): array
    {
        if ($complaint->routed_to === 'system_admin') {
            return DB::table('users')
                ->whereIn('role', ['system_admin', 'admin'])
                ->where('status', 'active')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }
        if (! $complaint->community_id) {
            return [];
        }

        return DB::table('community_memberships')
            ->join('users', 'users.id', '=', 'community_memberships.user_id')
            ->where('community_memberships.community_id', $complaint->community_id)
            ->where('community_memberships.role', 'admin')
            ->where('community_memberships.status', 'approved')
            ->where('users.role', 'community_admin')
            ->where('users.status', 'active')
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function notifyAssignedStaff(object $complaint, User $sender, string $title, string $body, bool $openChat = false): void
    {
        $staffUserId = $complaint->assigned_to_user_id ? (int) $complaint->assigned_to_user_id : 0;
        if ($staffUserId === 0 || $staffUserId === (int) $sender->id || $staffUserId === (int) $complaint->reporter_user_id) {
            return;
        }
        if (! $this->staffRecordActive($staffUserId, $complaint)) {
            return;
        }
        $this->notifyUser($staffUserId, $complaint, $title, $body, false, $openChat, 'staff');
    }

    private function staffRecordActive(int $userId, object $complaint): bool
    {
        if (! $complaint->assigned_staff_id) {
            return false;
        }

        return DB::table('community_staff')
            ->where('id', $complaint->assigned_staff_id)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->whereNotNull('activated_at')
            ->exists();
    }

    private function notifyUser(int $userId, object $complaint, string $title, string $body, bool $admin, bool $openChat = false, ?string $audience = null): void
    {
        $audience = $audience ?: ($admin ? 'admin' : 'resident');
        if ($audience === 'staff') {
            $action = '/screens/staff-tasks/detail?id='.$complaint->id.($openChat ? '&chat=1' : '');
        } elseif ($admin) {
            $path = $complaint->routed_to === 'system_admin' ? '/admin/support-complaints' : '/admin/complaints';
            $action = $path.'?complaint='.$complaint->id.($openChat ? '&chat=1' : '');
        } else {
            $action = $openChat
                ? '/screens/complaints/chat?id='.$complaint->id
                : '/screens/complaints/detail?id='.$complaint->id;
        }
        NotificationService::send($userId, 'complaint', $title, $body, $action, [
            'kind' => 'complaint',
            'complaint_id' => (int) $complaint->id,
            'audience' => $audience,
            'community_id' => $complaint->community_id ? (int) $complaint->community_id : null,
        ], $complaint->community_id ? (int) $complaint->community_id : null);
    }

    private function displayName(User $user): string
    {
        $profile = DB::table('profiles')->where('user_id', $user->id)->value('display_name');

        return trim((string) ($profile ?: $user->name ?: 'Resident'));
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function decorateWorkflow(array $rows): array
    {
        $wanted = [];
        foreach ($rows as $row) {
            if (! empty($row['assigned_to_user_id'])) {
                $wanted[(int) $row['id']] = (int) $row['assigned_to_user_id'];
            }
        }
        $actions = [];
        if ($wanted !== []) {
            $records = DB::table('complaint_assignments')
                ->whereIn('complaint_id', array_keys($wanted))
                ->orderByDesc('id')
                ->get(['complaint_id', 'user_id', 'action']);
            foreach ($records as $record) {
                $id = (int) $record->complaint_id;
                if (isset($actions[$id]) || (int) $record->user_id !== ($wanted[$id] ?? 0)) {
                    continue;
                }
                $actions[$id] = (string) $record->action;
            }
        }

        return array_map(function (array $row) use ($actions) {
            $status = (string) $row['status'];
            $accepted = ($actions[(int) $row['id']] ?? null) === 'accepted';
            if (! empty($row['assigned_to_user_id']) && ! $accepted && in_array($status, ['submitted', 'reopened', 'in_review'], true)) {
                $row['workflow_status'] = 'requested';
                $row['status_label'] = 'Requested';

                return $row;
            }
            [$workflow, $label] = match ($status) {
                'submitted' => ['open', 'Open'],
                'in_review' => ['pending', 'Pending'],
                'in_progress' => ['in_progress', 'In Progress'],
                'not_resolved' => ['not_resolved', 'Not Resolved'],
                'waiting_on_resident' => ['waiting_on_resident', 'Waiting on Resident'],
                'resolved' => ['resolved', 'Resolved'],
                'closed' => ['closed', 'Closed'],
                'cancelled' => ['cancelled', 'Cancelled'],
                'reopened' => ['reopened', 'Reopened'],
                default => [$status, ucfirst(str_replace('_', ' ', $status))],
            };
            $row['workflow_status'] = $workflow;
            $row['status_label'] = $label;

            return $row;
        }, $rows);
    }

    private function statusLabel(string $status): string
    {
        return match ($status) {
            'submitted' => 'Open',
            'in_review' => 'Pending',
            'in_progress' => 'In Progress',
            'waiting_on_resident' => 'Waiting on Resident',
            'not_resolved' => 'Not Resolved',
            'resolved' => 'Resolved',
            'closed' => 'Closed',
            'cancelled' => 'Cancelled',
            'reopened' => 'Reopened',
            default => ucfirst(str_replace('_', ' ', $status)),
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
