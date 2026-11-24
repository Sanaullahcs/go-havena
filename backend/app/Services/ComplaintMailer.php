<?php

namespace App\Services;

use App\Mail\HavenaTransactionalMail;
use App\Models\User;
use App\Services\ContactIdentityService;
use App\Support\AppUrls;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class ComplaintMailer
{
    public function __construct(private readonly LifecycleMailService $mail) {}

    public function submitted(object $complaint): void
    {
        $this->emailParties(
            $complaint,
            'complaint_submitted',
            'complaint:'.$complaint->id.':submitted',
            'Havena Complaint '.$complaint->reference.' submitted',
            'A complaint was submitted',
            $complaint->reference.' was submitted and is now Open.',
            null,
            null,
            null,
            'Open',
            false,
        );
    }

    public function assignmentAccepted(object $complaint, User $actor, int $eventId, ?string $note): void
    {
        $label = $this->statusLabel((string) $complaint->status);
        $this->emailParties(
            $complaint,
            'complaint_accepted',
            'complaint:'.$complaint->id.':accepted:'.$eventId,
            'Havena Complaint '.$complaint->reference.', Assignment Accepted',
            'Assignment accepted',
            trim($actor->name.' accepted '.$complaint->reference.'. The status is now '.$label.'.'),
            $note,
            $actor,
            null,
            $label,
            true,
        );
    }

    public function workUpdated(object $complaint, User $actor, int $messageId, string $note): void
    {
        $label = $this->statusLabel((string) $complaint->status);
        $this->emailParties(
            $complaint,
            'complaint_work_update',
            'complaint:'.$complaint->id.':work:'.$messageId,
            'Havena Complaint '.$complaint->reference.', Work Update',
            'Work update added',
            trim($actor->name.' added a work update on '.$complaint->reference.'.'),
            $note,
            $actor,
            null,
            $label,
            true,
        );
    }

    public function assigned(object $complaint, User $actor, int $eventId, bool $reassigned, ?string $reopenReason = null): void
    {
        $resident = $this->user((int) $complaint->reporter_user_id);
        $staff = $complaint->assigned_to_user_id ? $this->user((int) $complaint->assigned_to_user_id) : null;
        $heading = $reassigned ? 'Complaint reassigned' : 'A staff member was assigned';
        $subject = 'Havena Complaint '.$complaint->reference.', '.($reassigned ? 'Reassigned' : 'Staff Assigned');
        $staffIntro = $complaint->reference.' is now on your task list.';
        if ($reopenReason) {
            $staffIntro .= ' The resident reopened it because: '.$reopenReason;
        }

        if ($resident) {
            $this->send('complaint_assigned', 'complaint:'.$complaint->id.':assigned:'.$eventId.':resident', $resident, $subject, $heading, $this->staffLine($complaint), $complaint, null, $actor, $this->residentLink($complaint));
        }
        if ($staff) {
            $this->send('complaint_assigned_staff', 'complaint:'.$complaint->id.':assigned:'.$eventId.':staff', $staff, $subject, 'A complaint was assigned to you', $staffIntro, $complaint, null, $actor, $this->residentLink($complaint));
        }
    }

    public function assignmentCleared(object $complaint, User $actor, int $eventId, ?int $previousUserId): void
    {
        $subject = 'Havena Complaint '.$complaint->reference.', Assignment Removed';
        $resident = $this->user((int) $complaint->reporter_user_id);
        $staff = $previousUserId ? $this->user($previousUserId) : null;
        if ($resident) {
            $this->send('complaint_unassigned', 'complaint:'.$complaint->id.':unassigned:'.$eventId.':resident', $resident, $subject, 'Staff assignment removed', $complaint->reference.' is waiting for a staff member.', $complaint, null, $actor, $this->residentLink($complaint));
        }
        if ($staff && (! $resident || $staff->id !== $resident->id)) {
            $this->send('complaint_unassigned_staff', 'complaint:'.$complaint->id.':unassigned:'.$eventId.':staff', $staff, $subject, 'Assignment removed', $complaint->reference.' is no longer assigned to you.', $complaint, null, $actor, $this->residentLink($complaint));
        }
    }

    public function statusChanged(object $complaint, string $from, string $to, User $actor, int $eventId, ?string $note, bool $byStaff): void
    {
        if ($from === $to) {
            return;
        }

        $label = $this->statusLabel($to);
        $previous = $this->statusLabel($from);
        $subject = 'Havena Complaint '.$complaint->reference.', Status Updated';
        $intro = 'The status of '.$complaint->reference.' changed from '.$previous.' to '.$label.'.';

        if ($byStaff) {
            $this->emailParties(
                $complaint,
                'complaint_status',
                'complaint:'.$complaint->id.':status:'.$eventId,
                $subject,
                'Complaint status updated',
                $intro,
                $note,
                $actor,
                $previous,
                $label,
                true,
            );

            return;
        }

        $resident = $this->user((int) $complaint->reporter_user_id);
        $staff = $complaint->assigned_to_user_id ? $this->user((int) $complaint->assigned_to_user_id) : null;

        if ($resident && (int) $resident->id !== (int) $actor->id) {
            $this->send('complaint_status', 'complaint:'.$complaint->id.':status:'.$eventId.':resident', $resident, $subject, 'Complaint status updated', $intro, $complaint, $note, $actor, $this->residentLink($complaint), $previous, $label);
        }
        if ($staff && (int) $staff->id !== (int) $actor->id && (! $resident || (int) $staff->id !== (int) $resident->id)) {
            $this->send('complaint_status_staff', 'complaint:'.$complaint->id.':status:'.$eventId.':staff', $staff, $subject, 'Complaint status updated', $intro, $complaint, $note, $actor, $this->residentLink($complaint), $previous, $label);
        }
    }

    public function messageReceived(object $complaint, User $actor, int $messageId, string $body): void
    {
        $preview = trim(preg_replace('/\s+/', ' ', $body) ?? '');
        if (mb_strlen($preview) > 180) {
            $preview = mb_substr($preview, 0, 177).'…';
        }
        $subject = 'Havena Complaint '.$complaint->reference.', New Message';
        $intro = $actor->name.' sent a message on '.$complaint->reference.'.';
        if ((int) $complaint->reporter_user_id === (int) $actor->id) {
            foreach ($this->adminRecipients($complaint) as $admin) {
                if ((int) $admin->id === (int) $actor->id) {
                    continue;
                }
                $this->send('complaint_message_admin', 'complaint:'.$complaint->id.':message:'.$messageId.':admin:'.$admin->id, $admin, $subject, 'New complaint message', $intro, $complaint, $preview, $actor, $this->adminLink($complaint).'&chat=1');
            }

            return;
        }
        $resident = $this->user((int) $complaint->reporter_user_id);
        if ($resident && (int) $resident->id !== (int) $actor->id) {
            $this->send('complaint_message', 'complaint:'.$complaint->id.':message:'.$messageId.':resident', $resident, $subject, 'New complaint message', $intro, $complaint, $preview, $actor, $this->residentLink($complaint));
        }
    }

    /** @return array{sent: bool, error: ?string} */
    public function invitation(object $staff, string $communityName, string $token): array
    {
        $user = $this->user((int) $staff->user_id);
        $email = ContactIdentityService::normalizeEmail($user?->email ?: ($staff->email ?? null));
        if (! $email) {
            return ['sent' => false, 'error' => 'This staff member has no email address.'];
        }
        $skills = json_decode((string) ($staff->specializations ?? '[]'), true) ?: [];
        $link = AppUrls::appBase().'/staff-invite?token='.$token;
        $contextKey = 'staff:'.$staff->id.':invite:'.$token;
        $expires = Carbon::parse($staff->invitation_expires_at)->timezone((string) config('app.timezone'))->format('M j, Y');
        $message = [
            'subjectLine' => 'You are invited to '.$communityName.' on Havena',
            'preheader' => 'Activate your maintenance staff access.',
            'eyebrow' => 'Staff invitation',
            'heading' => 'Join '.$communityName.' as staff',
            'intro' => 'Hello '.$staff->name.',',
            'paragraphs' => [
                'You were added as maintenance staff for '.$communityName.'. This does not make you a community admin, and you do not need to be a resident or create another account.',
                'Open the activation link to accept this community only. Then sign in to the Havena app with this email address. We will send a verification code. No password is included in this email. Your assigned tasks appear under My Assigned Tasks. This invitation expires on '.$expires.'.',
            ],
            'details' => [
                ['label' => 'Name', 'value' => (string) $staff->name],
                ['label' => 'Community', 'value' => $communityName],
                ['label' => 'Specialization', 'value' => app(CommunityStaffService::class)->skillLabel($skills)],
                ['label' => 'Role', 'value' => 'Maintenance staff'],
            ],
            'ctaLabel' => 'Accept invitation',
            'ctaUrl' => $link,
            'footerNote' => 'If you did not expect this invitation, you can ignore this email.',
        ];

        $mailable = fn () => new HavenaTransactionalMail(
            subjectLine: $message['subjectLine'],
            preheader: $message['preheader'],
            eyebrow: $message['eyebrow'],
            heading: $message['heading'],
            intro: $message['intro'],
            paragraphs: $message['paragraphs'],
            details: $message['details'],
            ctaLabel: $message['ctaLabel'],
            ctaUrl: $message['ctaUrl'],
            footerNote: $message['footerNote'],
        );

        if (! $this->mail->deliversToInbox()) {
            $this->mail->sendOnce('staff_invitation', $contextKey, $email, $mailable());

            return $this->deliveryResult(false);
        }

        $lastError = null;
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                $this->mail->sendOnce('staff_invitation', $contextKey, $email, $mailable(), true);

                return ['sent' => true, 'error' => null];
            } catch (Throwable $e) {
                $lastError = $e->getMessage();
                usleep(200000 * $attempt);
            }
        }

        // Keep staff creation successful; queue retries through the worker.
        $this->mail->queueOnce('staff_invitation', $contextKey, $email, $message);

        return [
            'sent' => false,
            'error' => 'The invitation email could not be delivered right away and was queued for retry.'
                .($lastError ? ' '.Str::limit($lastError, 160) : ''),
        ];
    }

    public function invitationAccepted(object $staff, string $communityName): void
    {
        $user = $this->user((int) $staff->user_id);
        if (! $user || ! $this->mail->deliversToInbox()) {
            return;
        }
        $this->mail->sendOnce(
            'staff_invitation_accepted',
            'staff:'.$staff->id.':accepted',
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: 'Your staff access for '.$communityName.' is active',
                preheader: 'Sign in to Havena to see assigned tasks.',
                eyebrow: 'Staff access',
                heading: 'Staff access is active',
                intro: 'Hello '.$staff->name.',',
                paragraphs: [
                    'You accepted staff access for '.$communityName.'. Sign in to the Havena app with this email address. No password is included in this email.',
                    'Assigned maintenance tasks appear under My Assigned Tasks. Your resident access in any community is unchanged.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $communityName],
                ],
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: 'This confirmation is only for '.$communityName.'.',
            ),
        );
    }

    /** @return array{sent: bool, error: ?string} */
    private function deliveryResult(bool $sent): array
    {
        if (! $this->mail->deliversToInbox()) {
            return [
                'sent' => false,
                'error' => 'Email was recorded locally and was not delivered to an inbox. Use this environment\'s SMTP mailer, then resend the invitation.',
            ];
        }
        if (! $sent) {
            return ['sent' => false, 'error' => 'The invitation email could not be delivered. Try again.'];
        }

        return ['sent' => true, 'error' => null];
    }

    private function send(
        string $type,
        string $key,
        User $user,
        string $subject,
        string $heading,
        string $intro,
        object $complaint,
        ?string $note,
        ?User $actor,
        string $link,
        ?string $previous = null,
        ?string $current = null,
    ): void {
        $details = [
            ['label' => 'Ticket', 'value' => (string) $complaint->reference],
            ['label' => 'Complaint', 'value' => (string) $complaint->title],
        ];
        $community = $complaint->community_id
            ? (string) DB::table('communities')->where('id', $complaint->community_id)->value('name')
            : '';
        if ($community !== '') {
            $details[] = ['label' => 'Community', 'value' => $community];
        }
        if ($current) {
            $details[] = ['label' => 'Status', 'value' => $current];
        }
        if ($previous) {
            $details[] = ['label' => 'Previous status', 'value' => $previous];
        }
        $details[] = ['label' => 'Staff', 'value' => $this->assignedStaffName($complaint)];
        if ($actor) {
            $details[] = ['label' => 'Updated by', 'value' => $this->actorLabel($actor)];
        }
        $details[] = ['label' => 'When', 'value' => now()->timezone($this->communityTimezone($complaint))->format('M j, Y g:i A')];

        $paragraphs = [$intro];
        if ($note) {
            $paragraphs[] = 'Update: '.$note;
        }

        $this->mail->queueOnce($type, $key, $user->email, [
            'subjectLine' => $subject,
            'preheader' => $complaint->reference.' · '.$complaint->title,
            'eyebrow' => 'Complaints',
            'heading' => $heading,
            'intro' => 'Hello '.$this->firstName($user).',',
            'paragraphs' => $paragraphs,
            'details' => $details,
            'ctaLabel' => 'View Complaint',
            'ctaUrl' => $link,
            'footerNote' => 'Sign in with this email address to open the complaint. Private resident details stay inside Havena.',
        ]);
    }

    private function emailParties(
        object $complaint,
        string $type,
        string $eventKey,
        string $subject,
        string $heading,
        string $intro,
        ?string $note,
        ?User $actor,
        ?string $previous,
        ?string $current,
        bool $includeStaff,
    ): void {
        foreach ($this->parties($complaint, $includeStaff) as $party) {
            $email = ContactIdentityService::normalizeEmail($party['user']->email);
            if (! $email) {
                continue;
            }
            $this->send(
                $type,
                $eventKey.':'.substr(hash('sha256', $email), 0, 20),
                $party['user'],
                $subject,
                $heading,
                $intro,
                $complaint,
                $note,
                $actor,
                $this->linkFor($party['audience'], $complaint),
                $previous,
                $current,
            );
        }
    }

    /** @return list<array{user: User, audience: string}> */
    private function parties(object $complaint, bool $includeStaff): array
    {
        $ranked = [];
        $push = function (?User $user, string $audience, int $rank) use (&$ranked): void {
            if (! $user || $user->status !== 'active') {
                return;
            }
            $email = ContactIdentityService::normalizeEmail($user->email);
            if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
                return;
            }
            if (! isset($ranked[$email]) || $rank > $ranked[$email]['rank']) {
                $ranked[$email] = ['user' => $user, 'audience' => $audience, 'rank' => $rank];
            }
        };

        $push($this->user((int) $complaint->reporter_user_id), 'resident', 1);
        if ($includeStaff && $complaint->assigned_to_user_id) {
            $push($this->user((int) $complaint->assigned_to_user_id), 'staff', 2);
        }
        foreach ($this->adminRecipients($complaint) as $admin) {
            $push($admin, 'admin', 3);
        }

        return array_map(
            fn (array $party) => ['user' => $party['user'], 'audience' => $party['audience']],
            array_values($ranked),
        );
    }

    private function linkFor(string $audience, object $complaint): string
    {
        if ($audience === 'admin' || ($audience === 'staff' && $complaint->routed_to === 'system_admin')) {
            return $this->adminLink($complaint);
        }
        if ($audience === 'staff') {
            return 'havena://screens/staff-tasks/detail?id='.$complaint->id;
        }

        return 'havena://screens/complaints/detail?id='.$complaint->id;
    }

    /** @return list<User> */
    private function adminRecipients(object $complaint): array
    {
        if ($complaint->routed_to === 'system_admin') {
            return User::query()->whereIn('role', ['system_admin', 'admin'])->where('status', 'active')->get()->all();
        }
        if (! $complaint->community_id) {
            return [];
        }

        return User::query()
            ->whereIn('id', function ($query) use ($complaint) {
                $query->select('user_id')
                    ->from('community_memberships')
                    ->where('community_id', $complaint->community_id)
                    ->where('role', 'admin')
                    ->where('status', 'approved');
            })
            ->where('role', 'community_admin')
            ->where('status', 'active')
            ->get()
            ->all();
    }

    private function user(int $id): ?User
    {
        return User::query()->find($id);
    }

    private function assignedStaffName(object $complaint): string
    {
        if (! $complaint->assigned_to_user_id) {
            return 'Unassigned';
        }
        $name = trim((string) DB::table('users')->where('id', $complaint->assigned_to_user_id)->value('name'));

        return $name !== '' ? $name : 'Staff';
    }

    private function communityTimezone(object $complaint): string
    {
        $fallback = (string) config('app.timezone');
        if (! $complaint->community_id) {
            return $fallback;
        }
        $timezone = trim((string) DB::table('communities')->where('id', $complaint->community_id)->value('timezone'));

        return $timezone !== '' ? $timezone : $fallback;
    }

    private function staffLine(object $complaint): string
    {
        $name = $complaint->assigned_to_user_id
            ? (string) DB::table('users')->where('id', $complaint->assigned_to_user_id)->value('name')
            : 'a staff member';

        return $complaint->reference.' is now assigned to '.$name.'.';
    }

    private function actorLabel(User $actor): string
    {
        if ($actor->role === 'community_admin') {
            return 'Community Admin';
        }
        if (in_array($actor->role, ['system_admin', 'admin'], true)) {
            return 'System Admin';
        }

        return (string) ($actor->name ?: 'Staff');
    }

    private function firstName(User $user): string
    {
        $name = trim((string) $user->name);

        return $name !== '' ? explode(' ', $name)[0] : 'there';
    }

    private function residentLink(object $complaint): string
    {
        return AppUrls::residentLogin();
    }

    private function adminLink(object $complaint): string
    {
        $path = $complaint->routed_to === 'system_admin' ? '/admin/support-complaints' : '/admin/complaints';

        return AppUrls::adminBase().$path.'?complaint='.$complaint->id;
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
            'reopened' => 'Reopened',
            'closed' => 'Closed',
            'cancelled' => 'Cancelled',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }
}
