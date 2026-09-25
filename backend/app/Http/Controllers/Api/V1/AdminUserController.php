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
use App\Services\OsmGeocodingService;
use App\Support\CommunityLocation;
use App\Support\CommunityNameUniqueness;
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
            'name' => ['nullable', 'string', 'max:100'],
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
        if (! $restorableUser) {
            ContactIdentityService::assertAvailableForRegistration($validated['email'], $phone);
        }

        $region = Region::query()->where('status', 'active')->findOrFail($validated['region_id']);
        $displayName = trim($validated['name'] ?? '') ?: 'Neighbor';

        $result = DB::transaction(function () use ($validated, $phone, $region, $displayName, $restorableUser) {
            if ($validated['type'] === 'community_admin') {
                return $this->createCommunityAdmin($validated, $phone, $region, $displayName);
            }

            return $this->createResident($validated, $phone, $region, $displayName, $restorableUser);
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
        if ($provisioned && $community) {
            if ($validated['type'] === 'community_admin') {
                $emailSent = app(LifecycleMailService::class)->communityAdminProvisioned($provisioned, $community);
            } else {
                $emailSent = app(LifecycleMailService::class)->residentProvisioned($provisioned, $community, true);
            }
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
        if ($provisioned && $community) {
            $message = $emailSent
                ? $result['message'].' A welcome email was sent.'
                : $result['message'].' The welcome email could not be sent — share sign-in instructions manually.';
        }

        return response()->json([
            'data' => $payload,
            'message' => $message,
        ], 201);
    }

    private function createCommunityAdmin(array $validated, ?string $phone, Region $region, string $displayName): array
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

    private function createResident(array $validated, ?string $phone, Region $region, string $displayName, ?User $restorableUser = null): array
    {
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

        if ($restorableUser) {
            return $this->restoreResident($restorableUser, $validated, $phone, $region, $displayName, $community);
        }

        $user = User::query()->create([
            'uuid' => (string) Str::ulid(),
            'name' => $displayName,
            'email' => $validated['email'],
            'phone' => $phone,
            'phone_verified_at' => $phone ? now() : null,
            'password' => Str::random(32),
            'status' => 'active',
            'role' => 'resident',
            'community_admin_status' => null,
        ]);

        Profile::query()->create([
            'user_id' => $user->id,
            'display_name' => $displayName,
            'region_id' => $region->id,
        ]);

        CommunityMembership::query()->create([
            'user_id' => $user->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        return [
            'user' => $user,
            'community' => $community,
            'message' => 'Resident created and added to the community successfully.',
            'payload' => $this->transformUser($user->fresh(['profile', 'memberships.community']), $community),
        ];
    }

    private function restoreResident(
        User $user,
        array $validated,
        ?string $phone,
        Region $region,
        string $displayName,
        Community $community,
    ): array {
        if ($user->trashed()) {
            $user->restore();
        }

        $user->update([
            'name' => $displayName,
            'email' => $validated['email'],
            'phone' => $phone,
            'phone_verified_at' => $phone ? now() : null,
            'password' => Str::random(32),
            'status' => 'active',
            'role' => 'resident',
            'community_admin_status' => null,
            'community_admin_rejection_reason' => null,
            'suspension_reason' => null,
        ]);

        Profile::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'display_name' => $displayName,
                'region_id' => $region->id,
            ],
        );

        CommunityMembership::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'community_id' => $community->id,
            ],
            [
                'role' => 'member',
                'status' => 'approved',
                'rejection_reason' => null,
                'rejected_by' => null,
            ],
        );

        return [
            'user' => $user,
            'community' => $community,
            'message' => 'Resident restored and added to the community successfully.',
            'payload' => $this->transformUser($user->fresh(['profile', 'memberships.community']), $community),
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
