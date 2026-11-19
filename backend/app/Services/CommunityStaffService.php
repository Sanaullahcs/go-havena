<?php

namespace App\Services;

use App\Models\User;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CommunityStaffService
{
    public const SPECIALIZATIONS = [
        'plumbing',
        'electrical',
        'cleaning',
        'lift_maintenance',
        'parking_maintenance',
        'general_maintenance',
        'other',
    ];

    public const CATEGORY_MATCH = [
        'plumbing' => 'plumbing',
        'electrical' => 'electrical',
        'cleaning' => 'cleaning',
        'lifts' => 'lift_maintenance',
        'parking' => 'parking_maintenance',
        'other' => 'other',
    ];

    public function index(User $admin, Request $request): array
    {
        $communityId = UserActingContextService::requireCurrentCommunityId($admin);
        $query = DB::table('community_staff')->where('community_id', $communityId);
        if ($request->filled('search')) {
            $search = '%'.$request->string('search')->toString().'%';
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', $search)->orWhere('email', 'like', $search)->orWhere('phone', 'like', $search);
            });
        }
        if ($request->filled('specialization') && $request->string('specialization')->toString() !== 'all') {
            $skill = $request->string('specialization')->toString();
            $query->where('specializations', 'like', '%"'.$skill.'"%');
        }
        if ($request->filled('status') && $request->string('status')->toString() !== 'all') {
            $query->where('status', $request->string('status')->toString());
        }
        if ($request->filled('availability') && $request->string('availability')->toString() !== 'all') {
            $query->where('availability', $request->string('availability')->toString());
        }

        $rows = $query->orderBy('name')->get();
        $counts = DB::table('complaints')
            ->whereIn('assigned_staff_id', $rows->pluck('id')->all() ?: [0])
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['closed', 'cancelled'])
            ->selectRaw('assigned_staff_id, COUNT(*) as open_count')
            ->groupBy('assigned_staff_id')
            ->pluck('open_count', 'assigned_staff_id');

        return $rows->map(fn ($row) => $this->present($row, (int) ($counts[$row->id] ?? 0)))->all();
    }

    public function show(User $admin, int $id): array
    {
        $staff = $this->findForAdmin($admin, $id);
        $tasks = DB::table('complaints')
            ->where('assigned_staff_id', $staff->id)
            ->whereNull('deleted_at')
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get(['id', 'reference', 'title', 'category', 'status', 'updated_at']);

        $payload = $this->present($staff, $tasks->whereNotIn('status', ['closed', 'cancelled'])->count());
        $payload['complaints'] = $tasks->map(fn ($row) => [
            'id' => (int) $row->id,
            'reference' => $row->reference,
            'title' => $row->title,
            'category' => $row->category,
            'status' => $row->status,
            'updated_at' => $row->updated_at,
        ])->all();

        return $payload;
    }

    public function residents(User $admin, Request $request): array
    {
        $communityId = UserActingContextService::requireCurrentCommunityId($admin);
        $perPage = min(50, max(1, (int) $request->input('per_page', 25)));
        $page = max(1, (int) $request->input('page', 1));
        $needle = trim($request->string('search')->toString());
        $like = '%'.addcslashes($needle, '%_\\').'%';

        $query = DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->where('cm.role', 'member')
            ->where('users.role', 'resident')
            ->where('users.status', 'active');
        if ($needle !== '') {
            $query->where(function ($inner) use ($like, $communityId) {
                $inner->where('users.name', 'like', $like)
                    ->orWhere('profiles.display_name', 'like', $like)
                    ->orWhere('users.email', 'like', $like)
                    ->orWhereExists(function ($units) use ($like, $communityId) {
                        $units->from('unit_residents')
                            ->join('units', 'units.id', '=', 'unit_residents.unit_id')
                            ->whereColumn('unit_residents.user_id', 'users.id')
                            ->where('unit_residents.community_id', $communityId)
                            ->where('unit_residents.status', 'active')
                            ->whereNull('unit_residents.left_at')
                            ->where('units.unit_number', 'like', $like);
                    });
            });
        }

        $total = (int) (clone $query)->count(DB::raw('distinct users.id'));
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min($page, $lastPage);
        $rows = $query
            ->select([
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'profiles.display_name',
            ])
            ->distinct()
            ->orderBy('users.name')
            ->orderBy('users.id')
            ->forPage($page, $perPage)
            ->get();

        $userIds = $rows->pluck('id')->map(fn ($id) => (int) $id)->all() ?: [0];
        $units = DB::table('unit_residents')
            ->join('units', 'units.id', '=', 'unit_residents.unit_id')
            ->where('unit_residents.community_id', $communityId)
            ->where('unit_residents.status', 'active')
            ->whereNull('unit_residents.left_at')
            ->whereIn('unit_residents.user_id', $userIds)
            ->orderBy('units.unit_number')
            ->get(['unit_residents.user_id', 'units.unit_number'])
            ->groupBy('user_id');
        $staffIds = DB::table('community_staff')
            ->where('community_id', $communityId)
            ->whereIn('user_id', $userIds)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->flip();

        $data = $rows->unique('id')->map(function ($row) use ($units, $staffIds) {
            $unit = $units->get($row->id, collect())
                ->pluck('unit_number')
                ->map(fn ($unit) => trim((string) $unit))
                ->filter()
                ->unique()
                ->implode(', ');

            return [
                'id' => (int) $row->id,
                'name' => trim((string) ($row->display_name ?: $row->name)),
                'email' => (string) $row->email,
                'phone' => $row->phone,
                'unit' => $unit,
                'already_staff' => $staffIds->has((int) $row->id),
            ];
        })->values()->all();

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $page,
                'last_page' => $lastPage,
                'per_page' => $perPage,
                'total' => $total,
            ],
        ];
    }

    public function store(User $admin, array $input): array
    {
        $communityId = UserActingContextService::requireCurrentCommunityId($admin);
        $data = $this->validate($input, true);
        $requestedUserId = (int) ($input['user_id'] ?? 0);
        $resident = $requestedUserId > 0 ? $this->approvedResident($communityId, $requestedUserId) : null;
        if ($requestedUserId > 0 && ! $resident) {
            throw ValidationException::withMessages([
                'user_id' => 'Choose an approved resident from this community.',
            ]);
        }
        if ($resident) {
            $data['name'] = trim((string) ($resident->display_name ?: $resident->name));
            $data['email'] = (string) $resident->email;
        }
        $email = ContactIdentityService::normalizeEmail($data['email']);
        if (! $email) {
            throw ValidationException::withMessages(['email' => 'Enter a valid email address.']);
        }
        $user = $resident
            ? User::query()->find((int) $resident->id)
            : ContactIdentityService::findUserByEmail($email);
        $existing = DB::table('community_staff')
            ->where('community_id', $communityId)
            ->where(function ($query) use ($email, $user) {
                $query->where('email', $email);
                if ($user) {
                    $query->orWhere('user_id', $user->id);
                }
            })
            ->first();
        if ($existing) {
            throw ValidationException::withMessages([
                $resident ? 'user_id' : 'email' => 'This person is already on your staff list.',
            ]);
        }
        if ($user && in_array($user->role, ['system_admin', 'admin'], true)) {
            abort(422, 'A system administrator cannot be added as community staff.');
        }
        if ($user && ($user->status ?? '') === 'suspended') {
            abort(422, 'This account is suspended and cannot be added as staff.');
        }

        $staffId = DB::transaction(function () use ($admin, $communityId, $data, $email, $user) {
            if ($data['phone']) {
                $owner = PhoneNormalizer::findUserByPhone($data['phone']);
                if ($owner && (int) $owner->id !== (int) ($user->id ?? 0)) {
                    throw ValidationException::withMessages([
                        'phone' => 'This phone number is already used by another account.',
                    ]);
                }
            }
            if (! $user) {
                $user = User::query()->create([
                    'name' => $data['name'],
                    'email' => $email,
                    'phone' => $data['phone'],
                    'password' => Str::random(40),
                    'role' => 'resident',
                    'status' => 'active',
                ]);
            }
            $displayName = mb_substr($data['name'], 0, 50);
            $profile = DB::table('profiles')->where('user_id', $user->id)->first();
            if (! $profile) {
                DB::table('profiles')->insert([
                    'user_id' => $user->id,
                    'display_name' => $displayName,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } elseif (trim((string) ($profile->display_name ?? '')) === '') {
                DB::table('profiles')->where('user_id', $user->id)->update([
                    'display_name' => $displayName,
                    'updated_at' => now(),
                ]);
            }
            $token = Str::random(48);

            return DB::table('community_staff')->insertGetId([
                'community_id' => $communityId,
                'user_id' => $user->id,
                'name' => $data['name'],
                'email' => $email,
                'phone' => $data['phone'],
                'staff_type' => $data['staff_type'],
                'status' => 'active',
                'availability' => 'available',
                'specializations' => json_encode($data['specializations']),
                'invitation_token' => $token,
                'invitation_expires_at' => now()->addDays(7),
                'invited_at' => now(),
                'activated_at' => null,
                'invited_by' => $admin->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $staff = DB::table('community_staff')->where('id', $staffId)->first();
        $community = (string) DB::table('communities')->where('id', $communityId)->value('name');
        $this->deliverInvitation($staff, $community, (string) $staff->invitation_token);

        return $this->present(DB::table('community_staff')->where('id', $staffId)->first(), 0);
    }

    public function update(User $admin, int $id, array $input): array
    {
        $staff = $this->findForAdmin($admin, $id);
        $data = $this->validate($input, false);
        $updates = ['updated_at' => now()];
        foreach (['name', 'phone', 'staff_type', 'status', 'availability'] as $field) {
            if (array_key_exists($field, $input)) {
                $updates[$field] = $data[$field];
            }
        }
        if (array_key_exists('specializations', $input)) {
            $updates['specializations'] = json_encode($data['specializations']);
        }
        if (($updates['status'] ?? null) === 'inactive') {
            $updates['availability'] = 'unavailable';
        }
        $deactivating = ($updates['status'] ?? null) === 'inactive' && $staff->status !== 'inactive';
        DB::table('community_staff')->where('id', $staff->id)->update($updates);
        if (isset($updates['name']) && ! DB::table('community_memberships')->where('user_id', $staff->user_id)->exists()) {
            DB::table('users')->where('id', $staff->user_id)->update(['name' => $updates['name']]);
        }
        if ($deactivating) {
            app(ComplaintService::class)->releaseStaffAssignments($admin, $staff);
        }

        return $this->present(DB::table('community_staff')->where('id', $staff->id)->first(), 0);
    }

    public function resend(User $admin, int $id): array
    {
        $staff = $this->findForAdmin($admin, $id);
        abort_if($staff->status !== 'active', 422, 'Activate this staff member before sending another invitation.');
        abort_if($staff->activated_at, 422, 'This staff member has already accepted the invitation.');
        $token = Str::random(48);
        DB::table('community_staff')->where('id', $staff->id)->update([
            'invitation_token' => $token,
            'invitation_expires_at' => now()->addDays(7),
            'invited_at' => now(),
            'updated_at' => now(),
        ]);
        $fresh = DB::table('community_staff')->where('id', $staff->id)->first();
        $community = (string) DB::table('communities')->where('id', $staff->community_id)->value('name');
        $this->deliverInvitation($fresh, $community, $token);

        return $this->present(DB::table('community_staff')->where('id', $staff->id)->first(), 0);
    }

    public function acceptInvitation(string $token): array
    {
        $staff = DB::table('community_staff')->where('invitation_token', $token)->first();
        abort_unless($staff, 404, 'This invitation is no longer valid.');
        abort_if($staff->status !== 'active', 422, 'This staff access has been deactivated.');
        abort_if($staff->invitation_expires_at && now()->greaterThan($staff->invitation_expires_at), 422, 'This invitation has expired. Ask your community admin to send a new one.');

        DB::transaction(function () use ($staff) {
            DB::table('community_staff')->where('id', $staff->id)->update([
                'activated_at' => now(),
                'invitation_token' => null,
                'updated_at' => now(),
            ]);
            DB::table('users')->where('id', $staff->user_id)->update([
                'email_verified_at' => now(),
                'status' => 'active',
            ]);
        });

        $community = (string) DB::table('communities')->where('id', $staff->community_id)->value('name');
        $this->notifyInvitationAccepted($staff, $community);

        return [
            'message' => 'Your staff access is active. Sign in with '.$staff->email.' to see assigned tasks.',
            'email' => $staff->email,
        ];
    }

    public function invitations(User $user): array
    {
        return DB::table('community_staff')
            ->join('communities', 'communities.id', '=', 'community_staff.community_id')
            ->where('community_staff.user_id', $user->id)
            ->whereNull('community_staff.activated_at')
            ->orderBy('communities.name')
            ->get([
                'community_staff.id',
                'community_staff.status',
                'community_staff.invitation_expires_at',
                'communities.id as community_id',
                'communities.name as community_name',
            ])
            ->map(function ($row) {
                $expired = $row->invitation_expires_at && now()->greaterThan($row->invitation_expires_at);

                return [
                    'id' => (int) $row->id,
                    'community_id' => (int) $row->community_id,
                    'community_name' => $row->community_name,
                    'status' => $row->status !== 'active' ? 'inactive' : ($expired ? 'expired' : 'pending'),
                    'expires_at' => $row->invitation_expires_at,
                ];
            })
            ->all();
    }

    public function acceptOwnInvitation(User $user, int $id): array
    {
        $staff = DB::table('community_staff')->where('id', $id)->where('user_id', $user->id)->first();
        abort_unless($staff, 404, 'This invitation is no longer valid.');
        abort_unless($staff->invitation_token, 422, 'This invitation has already been used.');

        return $this->acceptInvitation((string) $staff->invitation_token);
    }

    public function activeRecord(User $user, int $communityId): ?object
    {
        return DB::table('community_staff')
            ->where('user_id', $user->id)
            ->where('community_id', $communityId)
            ->where('status', 'active')
            ->whereNotNull('activated_at')
            ->first();
    }

    public function access(User $user): array
    {
        $rows = DB::table('community_staff')
            ->join('communities', 'communities.id', '=', 'community_staff.community_id')
            ->where('community_staff.user_id', $user->id)
            ->where('community_staff.status', 'active')
            ->whereNotNull('community_staff.activated_at')
            ->orderBy('communities.name')
            ->get([
                'communities.id',
                'communities.name',
                'community_staff.staff_type',
                'community_staff.specializations',
            ]);

        $pending = DB::table('community_staff')
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->whereNull('activated_at')
            ->where(function ($query) {
                $query->whereNull('invitation_expires_at')->orWhere('invitation_expires_at', '>', now());
            })
            ->exists();

        return [
            'active' => $rows->isNotEmpty(),
            'pending' => $pending,
            'communities' => $rows->map(function ($row) {
                $skills = json_decode((string) $row->specializations, true) ?: [];

                return [
                    'id' => (int) $row->id,
                    'name' => $row->name,
                    'staff_type' => $row->staff_type,
                    'specializations' => $skills,
                    'specialization_label' => $this->skillLabel($skills),
                ];
            })->all(),
        ];
    }

    private function deliverInvitation(object $staff, string $community, string $token): void
    {
        $result = app(ComplaintMailer::class)->invitation($staff, $community, $token);
        DB::table('community_staff')->where('id', $staff->id)->update([
            'invitation_delivery_error' => $result['error'],
            'updated_at' => now(),
        ]);
    }

    private function notifyInvitationAccepted(object $staff, string $community): void
    {
        app(ComplaintMailer::class)->invitationAccepted($staff, $community);
        $admins = DB::table('community_memberships')
            ->join('users', 'users.id', '=', 'community_memberships.user_id')
            ->where('community_memberships.community_id', $staff->community_id)
            ->where('community_memberships.role', 'admin')
            ->where('community_memberships.status', 'approved')
            ->where('users.role', 'community_admin')
            ->where('users.status', 'active')
            ->pluck('users.id');
        foreach ($admins as $adminId) {
            NotificationService::send(
                (int) $adminId,
                'complaint',
                'Staff invitation accepted',
                $staff->name.' accepted staff access for '.$community.'.',
                '/admin/staff',
                [
                    'kind' => 'staff',
                    'audience' => 'admin',
                    'community_id' => (int) $staff->community_id,
                ],
                (int) $staff->community_id,
            );
        }
    }

    private function invitationState(object $row): string
    {
        if ($row->status === 'inactive') {
            return 'inactive';
        }
        if ($row->activated_at) {
            return 'accepted';
        }
        if ($row->invitation_expires_at && now()->greaterThan($row->invitation_expires_at)) {
            return 'expired';
        }

        return 'pending';
    }

    private function approvedResident(int $communityId, int $userId): ?object
    {
        return DB::table('community_memberships as cm')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('cm.community_id', $communityId)
            ->where('cm.user_id', $userId)
            ->where('cm.status', 'approved')
            ->where('cm.role', 'member')
            ->where('users.role', 'resident')
            ->where('users.status', 'active')
            ->first([
                'users.id',
                'users.name',
                'users.email',
                'users.phone',
                'profiles.display_name',
            ]);
    }

    private function findForAdmin(User $admin, int $id): object
    {
        $communityId = UserActingContextService::requireCurrentCommunityId($admin);
        $staff = DB::table('community_staff')->where('id', $id)->where('community_id', $communityId)->first();
        abort_unless($staff, 404, 'Staff member not found.');

        return $staff;
    }

    private function present(object $row, int $openCount): array
    {
        $skills = json_decode((string) $row->specializations, true) ?: [];

        return [
            'id' => (int) $row->id,
            'user_id' => (int) $row->user_id,
            'name' => $row->name,
            'email' => $row->email,
            'phone' => $row->phone,
            'staff_type' => $row->staff_type,
            'status' => $row->status,
            'availability' => $row->availability,
            'specializations' => $skills,
            'specialization_label' => $this->skillLabel($skills),
            'invitation' => $this->invitationState($row),
            'delivery_error' => $row->invitation_delivery_error ?? null,
            'activated_at' => $row->activated_at,
            'open_complaints' => $openCount,
        ];
    }

    /** @param  list<string>  $skills */
    public function skillLabel(array $skills): string
    {
        $labels = array_map(fn ($skill) => self::label($skill), $skills);

        return $labels === [] ? 'General' : implode(', ', $labels);
    }

    public static function label(string $skill): string
    {
        return match ($skill) {
            'lift_maintenance' => 'Lift Maintenance',
            'parking_maintenance' => 'Parking Maintenance',
            'general_maintenance' => 'General Maintenance',
            default => ucfirst($skill),
        };
    }

    /** @return array<string, mixed> */
    private function validate(array $input, bool $creating): array
    {
        $name = trim((string) ($input['name'] ?? ''));
        $email = trim((string) ($input['email'] ?? ''));
        $phone = trim((string) ($input['phone'] ?? ''));
        $type = (string) ($input['staff_type'] ?? '');
        $skills = array_values(array_unique(array_filter((array) ($input['specializations'] ?? []))));
        $errors = [];
        if ($creating || array_key_exists('name', $input)) {
            if ($name === '' || mb_strlen($name) < 2 || mb_strlen($name) > 120 || ! preg_match('/\p{L}/u', $name)) {
                $errors['name'] = 'Enter the staff member\'s full name.';
            }
        }
        if ($creating && ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL))) {
            $errors['email'] = 'Enter a valid email address.';
        }
        if ($creating || array_key_exists('phone', $input)) {
            if ($phone === '') {
                if ($creating) {
                    $errors['phone'] = 'Phone number is required.';
                }
            } else {
                $accepted = PhoneNormalizer::accept($phone);
                if ($accepted === null) {
                    $errors['phone'] = 'Enter a valid phone number.';
                } else {
                    $phone = $accepted;
                }
            }
        }
        if ($creating || array_key_exists('staff_type', $input)) {
            if (! in_array($type, ['internal', 'external'], true)) {
                $errors['staff_type'] = 'Choose internal or external staff.';
            }
        }
        if ($creating || array_key_exists('specializations', $input)) {
            if ($skills === [] || array_diff($skills, self::SPECIALIZATIONS) !== []) {
                $errors['specializations'] = 'Choose at least one specialization.';
            }
        }
        if (isset($input['status']) && ! in_array($input['status'], ['active', 'inactive'], true)) {
            $errors['status'] = 'Choose active or inactive.';
        }
        if (isset($input['availability']) && ! in_array($input['availability'], ['available', 'unavailable'], true)) {
            $errors['availability'] = 'Choose available or unavailable.';
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return [
            'name' => $name,
            'email' => $email,
            'phone' => $phone !== '' ? $phone : null,
            'staff_type' => $type,
            'specializations' => $skills,
            'status' => $input['status'] ?? null,
            'availability' => $input['availability'] ?? null,
        ];
    }
}
