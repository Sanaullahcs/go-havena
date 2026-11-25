<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Pre-membership resident stages for Community Admin → Members.
 *
 * Invitation Sent: admin invited the resident and the invite code has not been submitted yet.
 * Onboarding: the resident submitted the invite code but has not finished profile or unit setup.
 * Active: membership status `approved` after profile is complete.
 */
class MemberLifecycleStatus
{
    public const INVITATION_SENT = 'invitation_sent';

    public const INVITE_REJECTED = 'invite_rejected';

    public const ONBOARDING = 'onboarding';

    public static function hasStartedSignup(mixed $emailVerifiedAt, mixed $phoneVerifiedAt, bool $hasAuthenticated = false): bool
    {
        return filled($emailVerifiedAt) || filled($phoneVerifiedAt) || $hasAuthenticated;
    }

    public static function statusWithoutMembership(bool $startedSignup, bool $hasAssignedUnusedInvite): string
    {
        if ($hasAssignedUnusedInvite) {
            return self::INVITATION_SENT;
        }

        return self::ONBOARDING;
    }

    public static function applyStartedSignup($query, string $usersAlias = 'users'): void
    {
        $query->where(function ($q) use ($usersAlias) {
            $q->whereNotNull("{$usersAlias}.email_verified_at")
                ->orWhereNotNull("{$usersAlias}.phone_verified_at")
                ->orWhereExists(fn ($sub) => self::authTokenSubquery($sub, $usersAlias));
        });
    }

    public static function applyNotStartedSignup($query, string $usersAlias = 'users'): void
    {
        $query->whereNull("{$usersAlias}.email_verified_at")
            ->whereNull("{$usersAlias}.phone_verified_at")
            ->whereNotExists(fn ($sub) => self::authTokenSubquery($sub, $usersAlias));
    }

    public static function applyAssignedUnusedInviteExists($query, string $usersAlias = 'users', ?int $communityId = null): void
    {
        $query->whereExists(fn ($sub) => self::assignedUnusedInviteSubquery($sub, $usersAlias, $communityId));
    }

    public static function applyNoAssignedUnusedInvite($query, string $usersAlias = 'users', ?int $communityId = null): void
    {
        $query->whereNotExists(fn ($sub) => self::assignedUnusedInviteSubquery($sub, $usersAlias, $communityId));
    }

    public static function applyNoMembership($query, string $usersAlias = 'users'): void
    {
        $query->whereNotExists(function ($sub) use ($usersAlias) {
            $sub->from('community_memberships as cm_all')
                ->whereColumn('cm_all.user_id', "{$usersAlias}.id");
        });
    }

    /** Residents with no membership who still belong on the members list. */
    public static function preMembershipResidentsQuery(?int $communityId)
    {
        $query = DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted');

        self::applyNoMembership($query);

        if ($communityId) {
            $query->whereExists(function ($sub) use ($communityId) {
                $sub->from('invite_codes')
                    ->whereColumn('invite_codes.invited_user_id', 'users.id')
                    ->where('invite_codes.community_id', $communityId)
                    ->whereNull('invite_codes.deleted_at');
            });
        } else {
            $query->where(function ($q) {
                $q->whereNotExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNotNull('invite_codes.deleted_at');
                })->orWhereExists(function ($sub) {
                    $sub->from('invite_codes')
                        ->whereColumn('invite_codes.invited_user_id', 'users.id')
                        ->whereNull('invite_codes.deleted_at');
                });
            });
        }

        return $query;
    }

    public static function applySearch($query, ?string $search, string $usersAlias = 'users', bool $includeCommunityName = false): void
    {
        if (! filled($search)) {
            return;
        }

        $query->where(function ($q) use ($search, $usersAlias, $includeCommunityName) {
            $q->where("{$usersAlias}.name", 'like', "%{$search}%")
                ->orWhere("{$usersAlias}.email", 'like', "%{$search}%")
                ->orWhere("{$usersAlias}.phone", 'like', "%{$search}%")
                ->orWhereExists(function ($sub) use ($search, $usersAlias) {
                    $sub->from('profiles')
                        ->whereColumn('profiles.user_id', "{$usersAlias}.id")
                        ->where(function ($p) use ($search) {
                            $p->where('profiles.unit_number', 'like', "%{$search}%")
                                ->orWhere('profiles.display_name', 'like', "%{$search}%");
                        });
                })
                ->orWhereExists(function ($sub) use ($search, $usersAlias) {
                    $sub->from('unit_residents as ur')
                        ->join('units', 'units.id', '=', 'ur.unit_id')
                        ->whereColumn('ur.user_id', "{$usersAlias}.id")
                        ->whereIn('ur.status', ['active', 'pending'])
                        ->where('units.unit_number', 'like', "%{$search}%");
                });

            if ($includeCommunityName) {
                $q->orWhere('communities.name', 'like', "%{$search}%");
            }
        });
    }

    public static function countInvitationSent(?int $communityId, ?string $search = null): int
    {
        $query = DB::table('users')
            ->where('role', 'resident')
            ->where('status', '!=', 'deleted');

        if ($communityId) {
            $query->whereNotExists(function ($sub) use ($communityId) {
                $sub->from('community_memberships as cm_this')
                    ->whereColumn('cm_this.user_id', 'users.id')
                    ->where('cm_this.community_id', $communityId);
            });
        }

        $query->whereExists(function ($sub) use ($communityId) {
            self::invitationSentInviteSubquery($sub, 'users', $communityId);
        });
        self::applyInvitationSentAudience($query, 'users', $communityId);
        self::applySearch($query, $search);

        return (int) $query->count();
    }

    /** Unused or resident-rejected invite that still belongs on Invitation Sent. */
    public static function invitationSentInviteSubquery($sub, string $usersAlias, ?int $communityId): void
    {
        $sub->from('invite_codes')
            ->whereColumn('invite_codes.invited_user_id', "{$usersAlias}.id")
            ->whereNull('invite_codes.deleted_at')
            ->where(function ($q) {
                $q->whereNotNull('invite_codes.rejected_at')
                    ->orWhere(function ($pending) {
                        $pending->whereNull('invite_codes.rejected_at')
                            ->where(function ($uses) {
                                $uses->whereNull('invite_codes.max_uses')
                                    ->orWhereColumn('invite_codes.used_count', '<', 'invite_codes.max_uses');
                            })
                            ->where(function ($exp) {
                                $exp->whereNull('invite_codes.expires_at')
                                    ->orWhere('invite_codes.expires_at', '>', now());
                            });
                    });
            });

        if ($communityId) {
            $sub->where('invite_codes.community_id', $communityId);
        } else {
            $sub->whereNotExists(function ($membership) {
                $membership->from('community_memberships as cm_invite')
                    ->whereColumn('cm_invite.user_id', 'invite_codes.invited_user_id')
                    ->whereColumn('cm_invite.community_id', 'invite_codes.community_id');
            });
        }
    }

    /**
     * Invitation Sent includes unused invites until the code is submitted,
     * including after the resident signs in, plus rejected invites.
     */
    public static function applyInvitationSentAudience($query, string $usersAlias = 'users', ?int $communityId = null): void
    {
        $query->where(function ($q) use ($usersAlias, $communityId) {
            $q->where(function ($notStarted) use ($usersAlias) {
                self::applyNotStartedSignup($notStarted, $usersAlias);
            })->orWhere(function ($awaitingCode) use ($usersAlias, $communityId) {
                self::applyAssignedUnusedInviteExists($awaitingCode, $usersAlias, $communityId);
            })->orWhereExists(function ($sub) use ($usersAlias, $communityId) {
                $sub->from('community_memberships as cm_other')
                    ->whereColumn('cm_other.user_id', "{$usersAlias}.id");
                if ($communityId) {
                    $sub->where('cm_other.community_id', '!=', $communityId);
                }
            })->orWhereExists(function ($sub) use ($usersAlias, $communityId) {
                $sub->from('invite_codes')
                    ->whereColumn('invite_codes.invited_user_id', "{$usersAlias}.id")
                    ->whereNotNull('invite_codes.rejected_at')
                    ->whereNull('invite_codes.deleted_at');
                if ($communityId) {
                    $sub->where('invite_codes.community_id', $communityId);
                }
            });
        });
    }

    public static function countOnboarding(?int $communityId, ?string $search = null): int
    {
        $query = self::preMembershipResidentsQuery($communityId);
        self::applyNoAssignedUnusedInvite($query, 'users', $communityId);
        self::applySearch($query, $search);

        return (int) $query->count() + self::countOnboardingPendingMemberships($communityId, $search);
    }

    public static function residentProfileCompleteFromRow(object $member): bool
    {
        return MembershipService::residentProfileFieldsComplete(
            $member->display_name ?? null,
            $member->unit_number ?? null,
            $member->residence_type ?? null,
        );
    }

    public static function countOnboardingPendingMemberships(?int $communityId, ?string $search = null): int
    {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->where('cm.status', 'pending')
            ->whereNotNull('cm.invite_code_used');

        self::applyInviteMembershipOnboardingScope($query);

        if ($communityId) {
            $query->where('cm.community_id', $communityId);
        }

        self::applySearch($query, $search, 'users', $communityId === null);

        return (int) $query->count();
    }

    public static function countPendingApprovalMemberships(
        ?int $communityId,
        ?string $search = null,
        bool $distinctResidents = false,
    ): int {
        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->leftJoin('communities', 'communities.id', '=', 'cm.community_id')
            ->where('users.role', 'resident')
            ->where('users.status', '!=', 'deleted')
            ->where('cm.role', '!=', 'guest')
            ->where('cm.status', 'pending');

        self::applyPendingApprovalMembershipScope($query);

        if ($communityId) {
            $query->where('cm.community_id', $communityId);
        }

        self::applySearch($query, $search, 'users', $communityId === null);

        if ($distinctResidents) {
            return (int) $query->distinct('users.id')->count('users.id');
        }

        return (int) $query->count();
    }

    /**
     * Invite redemption still in resident onboarding (profile and/or unit enrollment incomplete).
     */
    public static function applyInviteMembershipOnboardingScope(
        $query,
        string $profilesAlias = 'profiles',
        string $usersAlias = 'users',
        string $cmAlias = 'cm',
    ): void {
        $query->where(function ($onboarding) use ($profilesAlias, $usersAlias, $cmAlias) {
            self::applyOnboardingPendingMembershipScope($onboarding, $profilesAlias);
            $onboarding->orWhere(function ($enrollment) use ($profilesAlias, $usersAlias, $cmAlias) {
                $enrollment->whereNotNull("{$profilesAlias}.display_name")
                    ->whereNotNull("{$profilesAlias}.unit_number")
                    ->whereNotNull("{$profilesAlias}.residence_type");
                self::applyInviteEnrollmentIncompleteScope($enrollment, $usersAlias, $cmAlias);
            });
        });
    }

    /**
     * Admin review queue: join requests and enrollments submitted for approval.
     */
    public static function applyPendingApprovalMembershipScope(
        $query,
        string $profilesAlias = 'profiles',
        string $usersAlias = 'users',
        string $cmAlias = 'cm',
    ): void {
        $query->where(function ($pending) use ($profilesAlias, $usersAlias, $cmAlias) {
            $pending->whereNull("{$cmAlias}.invite_code_used")
                ->orWhere(function ($invite) use ($profilesAlias, $usersAlias, $cmAlias) {
                    $invite->whereNotNull("{$cmAlias}.invite_code_used")
                        ->whereNotNull("{$profilesAlias}.display_name")
                        ->whereNotNull("{$profilesAlias}.unit_number")
                        ->whereNotNull("{$profilesAlias}.residence_type")
                        ->where(function ($submitted) use ($usersAlias, $cmAlias) {
                            $submitted->whereExists(function ($sub) use ($usersAlias, $cmAlias) {
                                $sub->from('unit_registration_packages as pkg')
                                    ->whereColumn('pkg.user_id', "{$usersAlias}.id")
                                    ->whereColumn('pkg.community_id', "{$cmAlias}.community_id")
                                    ->where('pkg.kind', UnitRegistrationPackageService::KIND_INITIAL)
                                    ->where('pkg.status', UnitRegistrationPackageService::STATUS_PENDING);
                            })->orWhereExists(function ($sub) use ($usersAlias, $cmAlias) {
                                $sub->from('unit_residents as ur')
                                    ->whereColumn('ur.user_id', "{$usersAlias}.id")
                                    ->whereColumn('ur.community_id', "{$cmAlias}.community_id")
                                    ->where('ur.status', UnitAssignmentService::RESIDENT_PENDING);
                            });
                        });
                });
        });
    }

    /** Accepted invite with no linked/submitted units yet for this community. */
    public static function applyInviteEnrollmentIncompleteScope(
        $query,
        string $usersAlias = 'users',
        string $cmAlias = 'cm',
    ): void {
        $query->whereNotExists(function ($sub) use ($usersAlias, $cmAlias) {
            $sub->from('unit_residents as ur')
                ->whereColumn('ur.user_id', "{$usersAlias}.id")
                ->whereColumn('ur.community_id', "{$cmAlias}.community_id")
                ->whereIn('ur.status', [UnitAssignmentService::RESIDENT_ACTIVE, UnitAssignmentService::RESIDENT_PENDING]);
        })->whereNotExists(function ($sub) use ($usersAlias, $cmAlias) {
            $sub->from('unit_registration_packages as pkg')
                ->whereColumn('pkg.user_id', "{$usersAlias}.id")
                ->whereColumn('pkg.community_id', "{$cmAlias}.community_id")
                ->where('pkg.kind', UnitRegistrationPackageService::KIND_INITIAL)
                ->whereIn('pkg.status', [
                    UnitRegistrationPackageService::STATUS_PENDING,
                    UnitRegistrationPackageService::STATUS_APPROVED,
                ]);
        });
    }

    public static function inviteMembershipIsOnboarding(object $member): bool
    {
        if (($member->status ?? '') !== 'pending' || ! filled($member->invite_code_used ?? null)) {
            return false;
        }

        if (! self::residentProfileCompleteFromRow($member)) {
            return true;
        }

        $userId = (int) ($member->id ?? 0);
        $communityId = (int) ($member->community_id ?? 0);
        if ($userId < 1 || $communityId < 1) {
            return true;
        }

        if (DB::table('unit_registration_packages')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->where('kind', UnitRegistrationPackageService::KIND_INITIAL)
            ->where('status', UnitRegistrationPackageService::STATUS_PENDING)
            ->exists()) {
            return false;
        }

        if (DB::table('unit_residents')
            ->where('user_id', $userId)
            ->where('community_id', $communityId)
            ->whereIn('status', [UnitAssignmentService::RESIDENT_ACTIVE, UnitAssignmentService::RESIDENT_PENDING])
            ->exists()) {
            return false;
        }

        return true;
    }

    public static function applyOnboardingPendingMembershipScope($query, string $profilesAlias = 'profiles'): void
    {
        $query->where(function ($incomplete) use ($profilesAlias) {
            $incomplete->whereNull("{$profilesAlias}.display_name")
                ->orWhereNull("{$profilesAlias}.unit_number")
                ->orWhereNull("{$profilesAlias}.residence_type");
        });
    }

    public static function pendingInviteCountSelect(string $usersAlias = 'users'): \Illuminate\Contracts\Database\Query\Expression
    {
        $now = now()->toDateTimeString();

        return DB::raw(
            "(select count(*) from invite_codes where invited_user_id = {$usersAlias}.id and deleted_at is null and rejected_at is null and (max_uses is null or used_count < max_uses) and (expires_at is null or expires_at > '{$now}')) as pending_invite_count"
        );
    }

    public static function authTokenCountSelect(string $usersAlias = 'users'): \Illuminate\Contracts\Database\Query\Expression
    {
        $type = addslashes(User::class);

        return DB::raw(
            "(select count(*) from personal_access_tokens where tokenable_id = {$usersAlias}.id and tokenable_type = '{$type}') as auth_token_count"
        );
    }

    private static function authTokenSubquery($sub, string $usersAlias): void
    {
        $sub->from('personal_access_tokens')
            ->whereColumn('personal_access_tokens.tokenable_id', "{$usersAlias}.id")
            ->where('personal_access_tokens.tokenable_type', User::class);
    }

    private static function assignedUnusedInviteSubquery($sub, string $usersAlias, ?int $communityId): void
    {
        $sub->from('invite_codes')
            ->whereColumn('invite_codes.invited_user_id', "{$usersAlias}.id")
            ->whereNull('invite_codes.deleted_at')
            ->whereNull('invite_codes.rejected_at')
            ->where(function ($q) {
                $q->whereNull('invite_codes.max_uses')
                    ->orWhereColumn('invite_codes.used_count', '<', 'invite_codes.max_uses');
            })
            ->where(function ($q) {
                $q->whereNull('invite_codes.expires_at')
                    ->orWhere('invite_codes.expires_at', '>', now());
            });

        if ($communityId) {
            $sub->where('invite_codes.community_id', $communityId);
        }
    }
}
