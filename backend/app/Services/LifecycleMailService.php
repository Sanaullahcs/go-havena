<?php

namespace App\Services;

use App\Mail\HavenaTransactionalMail;
use App\Models\Community;
use App\Models\GuestInvitation;
use App\Models\InviteCode;
use App\Models\TransactionalEmailSend;
use App\Models\User;
use App\Services\GuestInvitationService;
use App\Services\InviteCodeService;
use App\Support\AppUrls;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class LifecycleMailService
{
    public function communityAdminSignedUp(User $user): void
    {
        $this->sendOnce(
            'community_admin_signup',
            'user:'.$user->id,
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: 'Welcome to Havena',
                preheader: 'Thanks for creating your community admin account.',
                eyebrow: 'Welcome',
                heading: 'Thanks for joining Havena',
                intro: $this->greeting($user).' Your community admin account is ready.',
                paragraphs: [
                    'You can finish setting up your community from the admin dashboard. After you submit your community, a Havena system administrator reviews it before residents can join.',
                    'Sign in with this email address. We will send a verification code when you log in — there is no password to remember.',
                ],
                ctaLabel: 'Continue setup',
                ctaUrl: AppUrls::adminSetup(),
                footerNote: 'If you did not create this account, you can ignore this email.',
            ),
        );
    }

    public function residentSignedUp(User $user): void
    {
        $this->sendOnce(
            'resident_signup',
            'user:'.$user->id,
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: 'Welcome to Havena',
                preheader: 'Thanks for creating your resident account.',
                eyebrow: 'Welcome',
                heading: 'Thanks for joining Havena',
                intro: $this->greeting($user).' Your resident account is ready.',
                paragraphs: [
                    'Open the Havena app or sign in on the web with this email. We will send a verification code when you log in.',
                    'Join your community from the app, or use an invite code if your community admin sent you one.',
                ],
                ctaLabel: 'Sign in to Havena',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: 'If you did not create this account, you can ignore this email.',
            ),
        );
    }

    public function communityAdminApproved(User $user, ?Community $community = null): void
    {
        $communityName = $community?->name;
        $communityReady = $community && ($community->review_status === null || $community->review_status === 'approved');

        $this->sendOnce(
            'community_admin_approved',
            'user:'.$user->id.':approved',
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: 'Your Havena community admin account is approved',
                preheader: 'You can continue setting up your community.',
                eyebrow: 'Approved',
                heading: 'You are approved',
                intro: $this->greeting($user).' A Havena system administrator approved your community admin account.',
                paragraphs: $communityReady
                    ? [
                        $communityName
                            ? "You can now manage {$communityName} from the Havena admin dashboard."
                            : 'You can now manage your community from the Havena admin dashboard.',
                    ]
                    : [
                        $communityName
                            ? "{$communityName} is still under review. You will get another email when the community is approved."
                            : 'If you submitted a community, you will get another email when it is approved.',
                    ],
                details: array_values(array_filter([
                    $communityName ? ['label' => 'Community', 'value' => $communityName] : null,
                ])),
                ctaLabel: $communityReady ? 'Open dashboard' : 'View status',
                ctaUrl: $communityReady ? AppUrls::adminDashboard() : AppUrls::adminPendingApproval(),
            ),
        );
    }

    public function communityAdminRejected(User $user, ?string $reason = null, bool $wasApproved = false): void
    {
        $this->sendOnce(
            'community_admin_rejected',
            'user:'.$user->id.':rejected:'.($wasApproved ? 'revoked' : 'declined'),
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: $wasApproved
                    ? 'Your Havena community admin access was revoked'
                    : 'Update on your Havena community admin application',
                preheader: $wasApproved
                    ? 'Your community admin access is no longer active.'
                    : 'Your community admin application was not approved.',
                eyebrow: $wasApproved ? 'Access revoked' : 'Application update',
                heading: $wasApproved ? 'Access revoked' : 'Application not approved',
                intro: $this->greeting($user).' '.($wasApproved
                    ? 'Your community admin access has been revoked.'
                    : 'Your community admin application was not approved.'),
                paragraphs: array_values(array_filter([
                    $reason ? "Reason: {$reason}" : null,
                    'If you think this is a mistake, reply to this email or contact Havena support.',
                ])),
                ctaLabel: 'Contact Havena',
                ctaUrl: 'mailto:'.AppUrls::supportEmail(),
            ),
        );
    }

    public function communityApproved(Community $community, User $requester): void
    {
        $this->sendOnce(
            'community_approved',
            'community:'.$community->id.':approved',
            $requester->email,
            new HavenaTransactionalMail(
                subjectLine: "{$community->name} is approved on Havena",
                preheader: "{$community->name} is now active.",
                eyebrow: 'Community approved',
                heading: 'Your community is approved',
                intro: $this->greeting($requester)." {$community->name} has been approved and is now active on Havena.",
                paragraphs: [
                    ($requester->community_admin_status ?? '') === 'approved'
                        ? 'You can invite residents and start managing the community from your dashboard.'
                        : 'Your community admin application is still under review. You will get full access after a system administrator approves your account.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                ],
                ctaLabel: ($requester->community_admin_status ?? '') === 'approved'
                    ? 'Open dashboard'
                    : 'View status',
                ctaUrl: ($requester->community_admin_status ?? '') === 'approved'
                    ? AppUrls::adminDashboard()
                    : AppUrls::adminPendingApproval(),
            ),
        );
    }

    public function communityRejected(Community $community, User $requester, ?string $reason = null): void
    {
        $this->sendOnce(
            'community_rejected',
            'community:'.$community->id.':rejected',
            $requester->email,
            new HavenaTransactionalMail(
                subjectLine: "Update on {$community->name}",
                preheader: "{$community->name} was not approved.",
                eyebrow: 'Community update',
                heading: 'Community request not approved',
                intro: $this->greeting($requester)." {$community->name} was not approved.",
                paragraphs: array_values(array_filter([
                    $reason ? "Reason: {$reason}" : null,
                    'You can update the request and try again, or contact Havena support if you need help.',
                ])),
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                ],
                ctaLabel: 'Contact Havena',
                ctaUrl: 'mailto:'.AppUrls::supportEmail(),
            ),
        );
    }

    public function residentApproved(User $user, Community $community): void
    {
        $this->sendOnce(
            'resident_approved',
            'user:'.$user->id.':community:'.$community->id.':approved',
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: "You are approved to join {$community->name}",
                preheader: "Welcome to {$community->name}.",
                eyebrow: 'Membership approved',
                heading: 'You are in',
                intro: $this->greeting($user)." Your request to join {$community->name} has been approved.",
                paragraphs: [
                    'Open the Havena app to see notices, events, neighbors, and community updates.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                ],
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
        );
    }

    public function residentRejected(User $user, Community $community, string $reason): void
    {
        $this->sendOnce(
            'resident_rejected',
            'user:'.$user->id.':community:'.$community->id.':rejected',
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: "Update on your {$community->name} request",
                preheader: "Your request to join {$community->name} was not approved.",
                eyebrow: 'Membership update',
                heading: 'Request not approved',
                intro: $this->greeting($user)." Your request to join {$community->name} was not approved.",
                paragraphs: [
                    "Reason: {$reason}",
                    'If you believe this is a mistake, contact your community admin.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                ],
            ),
        );
    }

    public function residentInvited(
        User $invitee,
        Community $community,
        InviteCode $invite,
        User $inviter,
        bool $resend = false,
    ): bool {
        $inviterName = $this->personName($inviter);

        $mail = new HavenaTransactionalMail(
                subjectLine: "{$inviterName} invited you to {$community->name}",
                preheader: "Use your invite code to join {$community->name} on Havena.",
                eyebrow: 'Invitation',
                heading: 'You are invited',
                intro: $this->greeting($invitee)." {$inviterName} invited you to join {$community->name} on Havena.",
                paragraphs: [
                    'Download the Havena app from the App Store or Google Play, sign in with this email, then enter the invite code below or scan the QR code. We will send a verification code when you sign in.',
                    $invite->expires_at
                        ? 'This invite expires on '.$invite->expires_at->timezone(config('app.timezone'))->format('M j, Y').'.'
                        : 'Use the code the next time you open Havena.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                    ['label' => 'Invited by', 'value' => $inviterName],
                ],
                highlightCode: $invite->code,
                highlightLabel: 'Invite code',
                highlightQrPayload: InviteCodeService::qrPayload($invite->code),
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: 'If you were not expecting this invitation, you can ignore this email.',
                includeAppStoreLinks: true,
            );

        if ($resend) {
            return $this->resend(
                'resident_invitation',
                'invite:'.$invite->id,
                $invitee->email,
                $mail,
            );
        }

        return $this->sendOnce(
            'resident_invitation',
            'invite:'.$invite->id,
            $invitee->email,
            $mail,
        );
    }

    public function communityAdminProvisioned(User $user, Community $community, bool $newAccount = true): bool
    {
        return $this->sendOnce(
            'community_admin_provisioned',
            'user:'.$user->id.':community:'.$community->id.':'.($newAccount ? 'created' : 'assigned'),
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: $newAccount
                    ? "Your Havena admin account for {$community->name}"
                    : "You have been assigned to {$community->name}",
                preheader: $newAccount
                    ? 'A system administrator created your community admin account.'
                    : "You can now manage {$community->name} on Havena.",
                eyebrow: 'Account ready',
                heading: $newAccount ? 'Your admin account is ready' : 'You have been assigned',
                intro: $this->greeting($user).' '.($newAccount
                    ? 'A Havena system administrator created your community admin account.'
                    : "A Havena system administrator assigned you to manage {$community->name}."),
                paragraphs: [
                    "You have been assigned to manage {$community->name}.",
                    'Sign in with this email address. We will send a verification code — there is no password to remember.',
                    'After you sign in, complete your profile if prompted, then you can invite residents and manage the community.',
                    'Download the Havena app from the App Store or Google Play to manage your community on mobile.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                    ['label' => 'Sign-in email', 'value' => (string) $user->email],
                ],
                ctaLabel: 'Sign in to admin',
                ctaUrl: AppUrls::adminLogin(),
                includeAppStoreLinks: true,
            ),
        );
    }

    public function residentProvisioned(User $user, Community $community, bool $provisionedBySystemAdmin = false): bool
    {
        $addedBy = $provisionedBySystemAdmin
            ? 'A Havena system administrator added you'
            : 'A community administrator added you';

        return $this->sendOnce(
            'resident_provisioned',
            'user:'.$user->id.':community:'.$community->id,
            $user->email,
            new HavenaTransactionalMail(
                subjectLine: "You have been added to {$community->name}",
                preheader: "Your Havena resident account for {$community->name} is ready.",
                eyebrow: 'Account ready',
                heading: 'You have been added',
                intro: $this->greeting($user)." {$addedBy} to {$community->name}.",
                paragraphs: [
                    'Sign in with this email address in the Havena app or on the web. We will send a verification code when you log in — no invite code is required.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $community->name],
                    ['label' => 'Sign-in email', 'value' => (string) $user->email],
                ],
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
                includeAppStoreLinks: true,
            ),
        );
    }

    public function guestInvited(GuestInvitation $invitation): void
    {
        $invitation->loadMissing(['community', 'invitedBy.profile']);
        $communityName = $invitation->community?->name ?: 'a Havena community';
        $inviterName = $invitation->invitedBy ? $this->personName($invitation->invitedBy) : 'A neighbor';

        $this->sendOnce(
            'guest_invitation',
            'guest_invitation:'.$invitation->id,
            $invitation->guest_email,
            new HavenaTransactionalMail(
                subjectLine: "{$inviterName} invited you to visit {$communityName}",
                preheader: "Use your guest invite code to access {$communityName}.",
                eyebrow: 'Guest invitation',
                heading: 'You are invited as a guest',
                intro: "Hi {$invitation->guest_name}, {$inviterName} invited you to visit {$communityName} on Havena.",
                paragraphs: [
                    'Open the Havena app, sign in with this email, then enter the guest invite code below.',
                    $invitation->starts_at && $invitation->ends_at
                        ? 'Your visit window is '.$invitation->starts_at->timezone(config('app.timezone'))->format('M j, Y').' to '.$invitation->ends_at->timezone(config('app.timezone'))->format('M j, Y').'.'
                        : 'Your host set a visit window for this invitation.',
                ],
                details: [
                    ['label' => 'Community', 'value' => $communityName],
                    ['label' => 'Invited by', 'value' => $inviterName],
                ],
                highlightCode: $invitation->invite_code,
                highlightLabel: 'Guest invite code',
                highlightQrPayload: GuestInvitationService::qrPayload($invitation->invite_code),
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
                footerNote: 'If you were not expecting this invitation, you can ignore this email.',
            ),
        );
    }

    public function guestApproved(GuestInvitation $invitation): void
    {
        $invitation->loadMissing(['community', 'guestUser']);
        $email = $invitation->guest_email ?: $invitation->guestUser?->email;
        $communityName = $invitation->community?->name ?: 'the community';

        $this->sendOnce(
            'guest_approved',
            'guest_invitation:'.$invitation->id.':approved',
            $email,
            new HavenaTransactionalMail(
                subjectLine: "Guest access approved for {$communityName}",
                preheader: "You now have guest access to {$communityName}.",
                eyebrow: 'Guest access',
                heading: 'Guest access approved',
                intro: "Hi {$invitation->guest_name}, your guest access to {$communityName} is approved.",
                paragraphs: [
                    'Open the Havena app to use your guest access during your visit window.',
                ],
                details: array_values(array_filter([
                    ['label' => 'Community', 'value' => $communityName],
                    $invitation->ends_at
                        ? ['label' => 'Access until', 'value' => $invitation->ends_at->timezone(config('app.timezone'))->format('M j, Y')]
                        : null,
                ])),
                ctaLabel: 'Open Havena',
                ctaUrl: AppUrls::residentLogin(),
            ),
        );
    }

    public function guestRejected(GuestInvitation $invitation, ?string $reason = null): void
    {
        $invitation->loadMissing(['community', 'guestUser']);
        $email = $invitation->guest_email ?: $invitation->guestUser?->email;
        $communityName = $invitation->community?->name ?: 'the community';

        $this->sendOnce(
            'guest_rejected',
            'guest_invitation:'.$invitation->id.':rejected',
            $email,
            new HavenaTransactionalMail(
                subjectLine: "Update on your {$communityName} guest request",
                preheader: "Your guest access request for {$communityName} was not approved.",
                eyebrow: 'Guest update',
                heading: 'Guest access not approved',
                intro: "Hi {$invitation->guest_name}, your guest access request for {$communityName} was not approved.",
                paragraphs: array_values(array_filter([
                    $reason ? "Reason: {$reason}" : null,
                    'Contact the person who invited you if you have questions.',
                ])),
            ),
        );
    }

    public function resend(string $type, string $contextKey, ?string $email, Mailable $mail): bool
    {
        return $this->sendOnce(
            $type,
            $contextKey.':resend:'.now()->timestamp,
            $email,
            $mail,
        );
    }

    public function deliversToInbox(): bool
    {
        return ! in_array((string) config('mail.default'), ['log', 'array'], true);
    }

    public function sendOnce(string $type, string $contextKey, ?string $email, Mailable $mail): bool
    {
        $email = ContactIdentityService::normalizeEmail($email);
        if (! $email || ContactIdentityService::isPlaceholderEmail($email)) {
            return false;
        }

        try {
            $alreadySent = TransactionalEmailSend::query()
                ->where('mail_type', $type)
                ->where('context_key', $contextKey)
                ->exists();
            if ($alreadySent) {
                return false;
            }
        } catch (Throwable $e) {
            Log::warning('Transactional email lock check failed', [
                'type' => $type,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);
        }

        try {
            Mail::to($email)->send($mail);
            Log::info('Transactional email sent', [
                'type' => $type,
                'email' => $email,
            ]);
        } catch (Throwable $e) {
            Log::warning('Transactional email failed', [
                'type' => $type,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        try {
            TransactionalEmailSend::query()->create([
                'mail_type' => $type,
                'context_key' => $contextKey,
                'recipient_email' => $email,
                'sent_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Another request recorded the same send after we delivered it.
        } catch (Throwable $e) {
            Log::warning('Transactional email lock failed', [
                'type' => $type,
                'email' => $email,
                'error' => $e->getMessage(),
            ]);
        }

        return true;
    }

    private function greeting(User $user): string
    {
        $name = $this->personName($user);

        return $name === 'there' ? 'Hello.' : "Hello {$name}.";
    }

    private function personName(User $user): string
    {
        $user->loadMissing('profile');
        $name = trim((string) ($user->profile?->display_name ?: $user->name));

        return $name !== '' ? $name : 'there';
    }
}
