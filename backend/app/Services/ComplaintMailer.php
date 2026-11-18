<?php

namespace App\Services;

use App\Mail\HavenaTransactionalMail;
use App\Models\User;
use App\Support\AppUrls;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class ComplaintMailer
{
    public function __construct(private readonly LifecycleMailService $mail) {}

    public function submitted(object $complaint): void
    {
        $resident = $this->user((int) $complaint->reporter_user_id);
        if ($resident) {
            $this->send(
                'complaint_submitted',
                'complaint:'.$complaint->id.':submitted:resident',
                $resident,
                'Havena Complaint '.$complaint->reference.' received',
                'We received your complaint',
                'Your complaint '.$complaint->reference.' was sent to your community team.',
                $complaint,
                null,
                null,
                $this->residentLink($complaint),
            );
        }

        foreach ($this->adminRecipients($complaint) as $admin) {
            $this->send(
                'complaint_submitted_admin',
                'complaint:'.$complaint->id.':submitted:admin:'.$admin->id,
                $admin,
                'Havena Complaint '.$complaint->reference.' submitted',
                'A new complaint needs review',
                $complaint->reference.' was submitted and is waiting for assignment.',
                $complaint,
                null,
                null,
                $this->adminLink($complaint),
            );
        }
    }

    public function assigned(object $complaint, User $actor, int $eventId, bool $reassigned): void
    {
        $resident = $this->user((int) $complaint->reporter_user_id);
        $staff = $complaint->assigned_to_user_id ? $this->user((int) $complaint->assigned_to_user_id) : null;
        $heading = $reassigned ? 'Complaint reassigned' : 'A staff member was assigned';
        $subject = 'Havena Complaint '.$complaint->reference.', '.($reassigned ? 'Reassigned' : 'Staff Assigned');

        if ($resident) {
            $this->send('complaint_assigned', 'complaint:'.$complaint->id.':assigned:'.$eventId.':resident', $resident, $subject, $heading, $this->staffLine($complaint), $complaint, null, $actor, $this->residentLink($complaint));
        }
        if ($staff) {
            $this->send('complaint_assigned_staff', 'complaint:'.$complaint->id.':assigned:'.$eventId.':staff', $staff, $subject, 'A complaint was assigned to you', $complaint->reference.' is now on your task list.', $complaint, null, $actor, $this->residentLink($complaint));
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
        $resident = $this->user((int) $complaint->reporter_user_id);
        $staff = $complaint->assigned_to_user_id ? $this->user((int) $complaint->assigned_to_user_id) : null;

        if ($resident && (int) $resident->id !== (int) $actor->id) {
            $this->send('complaint_status', 'complaint:'.$complaint->id.':status:'.$eventId.':resident', $resident, $subject, 'Complaint status updated', $intro, $complaint, $note, $actor, $this->residentLink($complaint), $previous, $label);
        }
        if ($staff && (int) $staff->id !== (int) $actor->id && (! $resident || (int) $staff->id !== (int) $resident->id)) {
            $this->send('complaint_status_staff', 'complaint:'.$complaint->id.':status:'.$eventId.':staff', $staff, $subject, 'Complaint status updated', $intro, $complaint, $note, $actor, $this->residentLink($complaint), $previous, $label);
        }
        if ($byStaff) {
            foreach ($this->adminRecipients($complaint) as $admin) {
                if ((int) $admin->id === (int) $actor->id) {
                    continue;
                }
                $this->send('complaint_status_admin', 'complaint:'.$complaint->id.':status:'.$eventId.':admin:'.$admin->id, $admin, $subject, 'Staff updated a complaint', $intro, $complaint, $note, $actor, $this->adminLink($complaint), $previous, $label);
            }
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
        if (! $user) {
            return ['sent' => false, 'error' => 'This staff member has no email address.'];
        }
        $skills = json_decode((string) ($staff->specializations ?? '[]'), true) ?: [];
        $link = AppUrls::appBase().'/resident-login?staff_invite='.$token;
        $sent = $this->mail->sendOnce(
            'staff_invitation',
            'staff:'.$staff->id.':invite:'.$token,
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: 'You are invited to '.$communityName.' on Havena',
                preheader: 'Activate your maintenance staff access.',
                eyebrow: 'Staff invitation',
                heading: 'Join '.$communityName.' as staff',
                intro: 'Hello '.$staff->name.',',
                paragraphs: [
                    'You were added as maintenance staff for '.$communityName.'. This does not make you a community admin, and you do not need to be a resident or create another account.',
                    'Open the activation link to accept this community only. Then sign in to the Havena app with this email address. We will send a verification code. No password is included in this email. Your assigned tasks appear under My Assigned Tasks. This invitation expires on '.Carbon::parse($staff->invitation_expires_at)->timezone((string) config('app.timezone'))->format('M j, Y').'.',
                ],
                details: [
                    ['label' => 'Name', 'value' => (string) $staff->name],
                    ['label' => 'Community', 'value' => $communityName],
                    ['label' => 'Specialization', 'value' => app(CommunityStaffService::class)->skillLabel($skills)],
                    ['label' => 'Role', 'value' => 'Maintenance staff'],
                ],
                ctaLabel: 'Accept invitation',
                ctaUrl: $link,
                footerNote: 'If you did not expect this invitation, you can ignore this email.',
            ),
        );

        return $this->deliveryResult($sent);
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
        if ($actor) {
            $details[] = ['label' => 'Updated by', 'value' => $this->actorLabel($actor)];
        }
        $details[] = ['label' => 'When', 'value' => now()->timezone((string) config('app.timezone'))->format('M j, Y g:i A')];

        $paragraphs = [$intro];
        if ($note) {
            $paragraphs[] = 'Update: '.$note;
        }

        $this->mail->sendOnce(
            $type,
            $key,
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: $subject,
                preheader: $complaint->reference.' · '.$complaint->title,
                eyebrow: 'Complaints',
                heading: $heading,
                intro: 'Hello '.$this->firstName($user).',',
                paragraphs: $paragraphs,
                details: $details,
                ctaLabel: 'View Complaint',
                ctaUrl: $link,
                footerNote: 'Sign in with this email address to open the complaint. Private resident details stay inside Havena.',
            ),
        );
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
