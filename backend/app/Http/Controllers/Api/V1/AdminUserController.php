<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\Profile;
use App\Models\Region;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\CommunityLifecycleService;
use App\Services\ContactIdentityService;
use App\Services\LifecycleMailService;
use App\Services\MemberLifecycleStatus;
use App\Services\LocationCatalog;
use App\Services\OsmGeocodingService;
use App\Services\ResidentInviteService;
use App\Support\CommunityLocation;
use App\Support\CommunityNameUniqueness;
use App\Support\PersonName;
use App\Support\RegionHierarchy;
use App\Support\PhoneNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminUserController extends Controller
{
    /** POST /v1/admin/users — system admin provisions community admin or resident */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', Rule::in(['community_admin', 'resident'])],
            'name' => [
                Rule::requiredIf(fn () => $request->input('type') === 'resident'),
                'nullable',
                'string',
                'max:100',
            ],
            'first_name' => [
                Rule::requiredIf(fn () => $request->input('type') === 'community_admin'),
                'nullable',
                'string',
                'min:1',
                'max:50',
            ],
            'last_name' => [
                Rule::requiredIf(fn () => $request->input('type') === 'community_admin'),
                'nullable',
                'string',
                'min:1',
                'max:50',
            ],
            'unit_number' => ['nullable', 'string', 'max:20'],
            'email' => [
                'required',
                'email',
                'max:255',
            ],
            'phone' => ['required', 'string', 'max:30'],
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('status', 'active')],
            'community_name' => [
                Rule::requiredIf(fn () => $request->input('type') === 'community_admin' && ! $request->filled('community_id')),
                'nullable',
                'string',
                'max:255',
            ],
            'community_address' => [
                Rule::requiredIf(fn () => $request->input('type') === 'community_admin' && ! $request->filled('community_id')),
                'nullable',
                'string',
                'min:5',
                'max:500',
            ],
            'community_description' => ['nullable', 'string', 'max:1000'],
            ...CommunityLocation::coordinateRules(),
            'community_id' => [
                Rule::requiredIf(fn () => $request->input('type') === 'resident'
                    || ($request->input('type') === 'community_admin' && ! $request->filled('community_name'))),
                'nullable',
                'integer',
                Rule::exists('communities', 'id'),
            ],
        ]);

        $phone = PhoneNormalizer::accept($validated['phone']);
        if (! $phone) {
            throw ValidationException::withMessages([
                'phone' => ['Enter a valid phone number in international format (e.g. +2017777777).'],
            ]);
        }

        $restorableUser = $this->findRestorableUser($phone, $validated['email']);
        if (! $restorableUser && $validated['type'] !== 'resident') {
            ContactIdentityService::assertAvailableForRegistration($validated['email'], $phone);
        }

        $region = Region::query()
            ->where('status', 'active')
            ->with('stateRecord.country')
            ->findOrFail($validated['region_id']);
        RegionHierarchy::assertCityLevelForCommunity($region);
        if ($region->stateRecord) {
            $region = app(LocationCatalog::class)->ensureCityRegion($region->stateRecord, (string) $region->area);
        }
        $displayName = trim($validated['name'] ?? '') ?: 'Neighbor';
        $nameParts = null;
        if ($validated['type'] === 'community_admin') {
            $nameParts = PersonName::fromParts(
                (string) ($validated['first_name'] ?? ''),
                (string) ($validated['last_name'] ?? ''),
                50,
            );
            $displayName = $nameParts['display_name'];
        }
        $actor = $request->user();

        $result = DB::transaction(function () use ($validated, $phone, $region, $displayName, $nameParts, $restorableUser, $actor) {
            if ($validated['type'] === 'community_admin') {
                return $this->createCommunityAdmin($validated, $phone, $region, $displayName, $nameParts);
            }

            return $this->createResident($validated, $phone, $region, $displayName, $restorableUser, $actor);
        });

        ActivityLogService::user(
            'user_provisioned',
            "Provisioned {$validated['type']} {$displayName} ({$validated['email']})",
            'User',
            $result['user']->id,
        );

        $provisioned = $result['user']->fresh(['profile', 'memberships.community']);
        $community = $result['community'] ?? $provisioned?->memberships->first()?->community;
        $emailSent = false;
        if ($validated['type'] === 'resident') {
            $emailSent = (bool) ($result['email_sent'] ?? false);
        } elseif ($provisioned && $community) {
            $emailSent = app(LifecycleMailService::class)->communityAdminProvisioned($provisioned, $community);
        } else {
            Log::warning('Provisioned user email skipped', [
                'type' => $validated['type'],
                'user_id' => $result['user']->id ?? null,
                'email' => $validated['email'],
                'has_community' => (bool) $community,
            ]);
        }

        $payload = array_merge($result['payload'], ['email_sent' => $emailSent]);
        $message = $result['message'];
        if ($validated['type'] === 'community_admin' && $provisioned && $community) {
            $message = $emailSent
                ? $result['message'].' A welcome email was sent.'
                : $result['message'].' The welcome email could not be sent — share sign-in instructions manually.';
        } elseif ($validated['type'] === 'resident') {
            $message = $emailSent
                ? $result['message'].' An invitation email was sent.'
                : $result['message'].' Share the invite code with the resident — the invitation email could not be sent.';
        }

        return response()->json([
            'data' => $payload,
            'message' => $message,
        ], 201);
    }

    /**
     * @param  array{first_name: string, last_name: string, display_name: string}|null  $nameParts
     */
    private function createCommunityAdmin(array $validated, ?string $phone, Region $region, string $displayName, ?array $nameParts = null): array
    {
        $community = $this->resolveCommunityForAdmin($validated, $region);
        $createdCommunity = empty($validated['community_id']);

        $user = User::query()->create([
            'uuid' => (string) Str::ulid(),
            'name' => $displayName,
            'email' => $validated['email'],
            'phone' => $phone,
            'phone_verified_at' => $phone ? now() : null,
            'password' => Str::random(32),
            'status' => 'active',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
        ]);

        Profile::query()->create([
            'user_id' => $user->id,
            'display_name' => $displayName,
            'first_name' => $nameParts['first_name'] ?? null,
            'last_name' => $nameParts['last_name'] ?? null,
            'region_id' => $region->id,
            'unit_number' => null,
            'residence_type' => null,
        ]);

        CommunityMembership::query()->create([
            'user_id' => $user->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        return [
            'user' => $user,
            'community' => $community,
            'message' => $createdCommunity
                ? 'Community admin and community created successfully.'
                : 'Community admin created and assigned successfully.',
            'payload' => $this->transformUser($user->fresh(['profile', 'memberships.community']), $community),
        ];
    }

    private function resolveCommunityForAdmin(array $validated, Region $region): Community
    {
        if (! empty($validated['community_id'])) {
            $community = Community::query()
                ->where('id', $validated['community_id'])
                ->where('status', 'active')
                ->where(function ($w) {
                    $w->whereNull('review_status')
                        ->orWhere('review_status', 'approved');
                })
                ->firstOrFail();

            if ((int) $community->region_id !== (int) $region->id) {
                throw ValidationException::withMessages([
                    'community_id' => ['Selected community does not belong to the chosen region.'],
                ]);
            }

            $lifecycle = app(CommunityLifecycleService::class);
            if ($lifecycle->hasCommunityAdminAssigned($community) || $lifecycle->hasPendingCommunityAdminApplicant($community)) {
                throw ValidationException::withMessages([
                    'community_id' => ['This community already has a community admin assigned.'],
                ]);
            }

            return $community;
        }

        CommunityNameUniqueness::assertUniqueInRegion(
            $validated['community_name'],
            $region->id,
            field: 'community_name',
        );

        $coords = CommunityLocation::resolve(
            $validated['community_address'] ?? null,
            $validated['latitude'] ?? null,
            $validated['longitude'] ?? null,
            app(OsmGeocodingService::class),
        );

        return Community::query()->create([
            'name' => $validated['community_name'],
            'region_id' => $region->id,
            'region' => $region->title,
            'address' => $validated['community_address'],
            'description' => $validated['community_description'] ?? null,
            'latitude' => $coords['latitude'],
            'longitude' => $coords['longitude'],
            'status' => 'active',
            'review_status' => 'approved',
            'reviewed_at' => now(),
        ]);
    }

    private function createResident(
        array $validated,
        ?string $phone,
        Region $region,
        string $displayName,
        ?User $restorableUser,
        User $actor,
    ): array {
        $community = Community::query()
            ->where('id', $validated['community_id'])
            ->where('status', 'active')
            ->where(function ($w) {
                $w->whereNull('review_status')
                    ->orWhere('review_status', 'approved');
            })
            ->firstOrFail();

        if ((int) $community->region_id !== (int) $region->id) {
            throw ValidationException::withMessages([
                'community_id' => ['Selected community does not belong to the chosen region.'],
            ]);
        }

        $unitNumber = trim((string) ($validated['unit_number'] ?? ''));

        if ($restorableUser) {
            return $this->restoreAndInviteResident(
                $restorableUser,
                $validated,
                $phone,
                $region,
                $displayName,
                $community,
                $actor,
                $unitNumber,
            );
        }

        $sent = app(ResidentInviteService::class)->send(
            $actor,
            (int) $community->id,
            $displayName,
            (string) $validated['email'],
            (string) $phone,
            $unitNumber,
            null,
            'member',
        );

        DB::table('profiles')
            ->where('user_id', $sent['id'])
            ->update(['region_id' => $region->id, 'updated_at' => now()]);

        $user = User::query()->findOrFail($sent['id']);

        return [
            'user' => $user,
            'community' => $community,
            'email_sent' => $sent['email_sent'] ?? false,
            'message' => ($sent['reactivated'] ?? false)
                ? 'Existing member re-invited successfully.'
                : 'Resident invited successfully.',
            'payload' => $this->transformInvitedResident($user, $community, $sent),
        ];
    }

    private function restoreAndInviteResident(
        User $user,
        array $validated,
        ?string $phone,
        Region $region,
        string $displayName,
        Community $community,
        User $actor,
        string $unitNumber,
    ): array {
        if ($user->trashed()) {
            $user->restore();
        }

        $user->update([
            'name' => $displayName,
            'email' => $validated['email'],
            'phone' => $phone,
            'phone_verified_at' => null,
            'email_verified_at' => null,
            'password' => Str::random(32),
            'status' => 'active',
            'role' => 'resident',
            'community_admin_status' => null,
            'community_admin_rejection_reason' => null,
            'suspension_reason' => null,
        ]);

        CommunityMembership::query()
            ->where('user_id', $user->id)
            ->where('community_id', $community->id)
            ->delete();

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name' => $displayName,
                'region_id' => $region->id,
            ],
        );

        $sent = app(ResidentInviteService::class)->inviteExisting(
            $actor,
            $user->fresh(),
            (int) $community->id,
            $displayName,
            $unitNumber,
        );

        return [
            'user' => $user->fresh(['profile', 'memberships.community']),
            'community' => $community,
            'email_sent' => $sent['email_sent'] ?? false,
            'message' => 'Resident restored and invited successfully.',
            'payload' => $this->transformInvitedResident($user->fresh(['profile', 'memberships.community']), $community, $sent),
        ];
    }

    private function findRestorableUser(?string $phone, string $email): ?User
    {
        if ($phone) {
            $byPhone = User::withTrashed()->where('phone', $phone)->first();
            if ($byPhone?->trashed()) {
                return $byPhone;
            }
        }

        $byEmail = User::withTrashed()->where('email', $email)->first();
        if ($byEmail?->trashed()) {
            return $byEmail;
        }

        return null;
    }

    /** @param array<string, mixed> $invite */
    private function transformInvitedResident(User $user, Community $community, array $invite): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'community_admin_status' => $user->community_admin_status,
            'status' => MemberLifecycleStatus::INVITATION_SENT,
            'region_id' => $user->profile?->region_id,
            'invite_code' => $invite['invite_code'] ?? null,
            'invite_qr_value' => $invite['invite_qr_value'] ?? null,
            'temp_password' => $invite['temp_password'] ?? null,
            'expires_at' => $invite['expires_at'] ?? null,
            'member_name' => $invite['member_name'] ?? $user->name,
            'member_email' => $invite['member_email'] ?? $user->email,
            'community_name' => $invite['community_name'] ?? $community->name,
            'membership' => null,
            'community' => [
                'id' => $community->id,
                'name' => $community->name,
                'region_id' => $community->region_id,
                'region' => $community->region,
            ],
        ];
    }

    private function transformUser(User $user, Community $community): array
    {
        $membership = $user->memberships->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'community_admin_status' => $user->community_admin_status,
            'status' => $user->status,
            'region_id' => $user->profile?->region_id,
            'membership' => $membership ? [
                'community_id' => $membership->community_id,
                'role' => $membership->role,
                'status' => $membership->status,
            ] : null,
            'community' => [
                'id' => $community->id,
                'name' => $community->name,
                'region_id' => $community->region_id,
                'region' => $community->region,
            ],
        ];
    }
}
