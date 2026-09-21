<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\NotificationService;
use App\Support\AmenitySlots;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AmenityController extends Controller
{
    private const STATUSES = ['open', 'bookable', 'closed'];

    private const ICON_KEYS = [
        'pool', 'gym', 'hall', 'meeting', 'dining', 'sports',
        'playground', 'terrace', 'spa', 'library', 'parking',
        'laundry', 'cinema', 'bike', 'building',
    ];

    /** GET /v1/amenities — approved amenities (+ caller's own pending). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveResidentCommunityId($request, $user);

        $amenities = DB::table('amenities')
            ->leftJoin('users', 'users.id', '=', 'amenities.created_by')
            ->select('amenities.*', 'users.name as creator_name')
            ->where('amenities.community_id', $communityId)
            ->where(function ($q) use ($user) {
                $q->where('amenities.review_status', 'approved')
                    ->orWhere(function ($mine) use ($user) {
                        $mine->where('amenities.created_by', $user->id)
                            ->whereIn('amenities.review_status', ['pending', 'rejected']);
                    });
            })
            ->orderBy('amenities.name')
            ->get();

        $nextBookingByAmenity = $this->upcomingBookingsByAmenityForUser((int) $user->id);

        $amenities = $amenities->map(function ($row) use ($user, $nextBookingByAmenity) {
            $formatted = $this->formatAmenity($row, $user->id);
            $booking = $nextBookingByAmenity->get((int) $row->id);

            return $this->withViewerBookingState($formatted, $booking);
        });

        return response()->json(['data' => $amenities]);
    }

    /** POST /v1/amenities — resident or admin create. */
    public function create(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveResidentCommunityId($request, $user);
        $isAdmin = AdminRoleService::canManageCommunity($user, $communityId)
            || AdminRoleService::isSystemAdmin($user);

        $data = $this->validateAmenityPayload($request, true);
        $row = $this->buildAmenityRow($data, $communityId, (int) $user->id, $isAdmin);

        $id = DB::table('amenities')->insertGetId($row);
        ActivityLogService::user('amenity_created', "Created amenity: \"{$data['name']}\"", 'Amenity', $id);

        if (! $isAdmin) {
            $this->notifyCommunityAdmins(
                $communityId,
                'info',
                'New amenity needs approval',
                "{$user->name} submitted \"{$data['name']}\" for review.",
                '/screens/admin-amenities',
                (int) $user->id,
            );
        }

        $amenity = DB::table('amenities')->find($id);

        return response()->json([
            'data' => $this->formatAmenity($amenity, $user->id),
            'message' => $isAdmin
                ? 'Amenity created and is now active.'
                : 'Amenity submitted. A community admin will review it before it goes live.',
        ], 201);
    }

    /** GET /v1/amenities/{id}/slots?date=YYYY-MM-DD */
    public function slots(Request $request, int $id): JsonResponse
    {
        $request->validate(['date' => 'required|date']);
        $user = $request->user();
        $communityId = $this->resolveResidentCommunityId($request, $user);

        $amenity = DB::table('amenities')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->first();

        if (! $amenity || ($amenity->review_status ?? 'approved') !== 'approved') {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        if ($amenity->status !== 'bookable') {
            return response()->json([
                'data' => [],
                'weekends_available' => (bool) ($amenity->weekends_available ?? true),
                'message' => 'This amenity does not use timed slots.',
            ]);
        }

        $date = (string) $request->date;

        $userAlreadyBooked = DB::table('bookings')
            ->where('amenity_id', $id)
            ->where('user_id', $user->id)
            ->where('date', $date)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->exists();

        if ($userAlreadyBooked) {
            return response()->json([
                'data' => [],
                'weekends_available' => (bool) ($amenity->weekends_available ?? true),
                'user_already_booked' => true,
                'message' => 'You already have a reservation for this amenity on this date.',
            ]);
        }

        if (! ($amenity->weekends_available ?? true) && AmenitySlots::isWeekendDate($date)) {
            return response()->json([
                'data' => [],
                'closed' => true,
                'message' => 'This amenity is not available on weekends.',
            ]);
        }

        $slots = AmenitySlots::generate(
            $amenity->start_time ?? null,
            $amenity->end_time ?? null,
            $amenity->slot_duration_minutes !== null ? (int) $amenity->slot_duration_minutes : null,
            $amenity->hours ?? null,
        );

        $taken = DB::table('bookings')
            ->where('amenity_id', $id)
            ->where('date', $date)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->pluck('time_slot')
            ->all();

        $data = array_map(function (array $slot) use ($taken) {
            return [
                ...$slot,
                'available' => ! in_array($slot['value'], $taken, true),
            ];
        }, $slots);

        return response()->json([
            'data' => $data,
            'weekends_available' => (bool) ($amenity->weekends_available ?? true),
        ]);
    }

    /** GET /v1/bookings */
    public function myBookings(Request $request): JsonResponse
    {
        $bookings = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->select(
                'bookings.*',
                'amenities.name as amenity_name',
                'amenities.name_es as amenity_name_es',
                'amenities.name_ar as amenity_name_ar',
                'amenities.image_url as amenity_image',
                'amenities.icon_key as amenity_icon_key',
                'amenities.status as amenity_status',
            )
            ->where('bookings.user_id', auth()->id())
            ->orderBy('bookings.date', 'desc')
            ->get();

        return response()->json(['data' => $bookings]);
    }

    /** GET /v1/bookings/inbox — bookings for amenities the current user created. */
    public function bookingInbox(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveResidentCommunityId($request, $user);

        $query = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->join('users', 'users.id', '=', 'bookings.user_id')
            ->leftJoin('profiles', 'profiles.user_id', '=', 'bookings.user_id')
            ->select(
                'bookings.*',
                'amenities.name as amenity_name',
                'amenities.name_es as amenity_name_es',
                'amenities.name_ar as amenity_name_ar',
                'amenities.community_id',
                'amenities.icon_key as amenity_icon_key',
                'amenities.created_by as amenity_created_by',
                'amenities.status as amenity_status',
                'amenities.description as amenity_description',
                'amenities.description_es as amenity_description_es',
                'amenities.description_ar as amenity_description_ar',
                'amenities.capacity as amenity_capacity',
                'amenities.floor as amenity_floor',
                'amenities.hours as amenity_hours',
                DB::raw('COALESCE(profiles.display_name, users.name) as user_name'),
                'profiles.unit_number as user_unit',
            )
            ->where('amenities.community_id', $communityId)
            ->where('amenities.created_by', $user->id);

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('bookings.status', $request->status);
        }

        $bookings = $query
            ->orderByRaw("FIELD(bookings.status, 'pending', 'confirmed', 'rejected', 'cancelled')")
            ->orderBy('bookings.date', 'asc')
            ->get();

        return response()->json(['data' => $bookings]);
    }

    /** POST /v1/bookings */
    public function book(Request $request): JsonResponse
    {
        $request->validate([
            'amenity_id' => 'required|integer|exists:amenities,id',
            'date' => 'required|date|after_or_equal:today',
            'time_slot' => 'nullable|string|max:50',
            'guests' => 'integer|min:1|max:50',
            'notes' => 'nullable|string|max:500',
        ]);

        $user = $request->user();
        $amenity = DB::table('amenities')->find($request->amenity_id);
        if (! $amenity) {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        if (($amenity->review_status ?? 'approved') !== 'approved') {
            return response()->json(['message' => 'This amenity is not available yet.'], 422);
        }

        if ((int) ($amenity->created_by ?? 0) === (int) $user->id) {
            return response()->json(['message' => 'You cannot book an amenity you created.'], 422);
        }

        if ($amenity->status === 'closed') {
            return response()->json(['message' => 'This amenity is currently closed.'], 422);
        }

        if (! in_array($amenity->status, ['bookable', 'open'], true)) {
            return response()->json(['message' => 'This amenity cannot be booked.'], 422);
        }

        $communityId = $this->resolveResidentCommunityId($request, $user);
        if ((int) $amenity->community_id !== $communityId) {
            return response()->json(['message' => 'Amenity not found in your community.'], 404);
        }

        $date = (string) $request->date;
        if (! ($amenity->weekends_available ?? true) && AmenitySlots::isWeekendDate($date)) {
            return response()->json(['message' => 'This amenity is not available on weekends.'], 422);
        }

        $guests = (int) ($request->guests ?? 1);
        $capacity = (int) ($amenity->capacity ?? 0);
        if ($capacity > 0 && $guests > $capacity) {
            return response()->json([
                'message' => "This amenity allows up to {$capacity} guests.",
            ], 422);
        }

        $alreadyUserDay = DB::table('bookings')
            ->where('amenity_id', $request->amenity_id)
            ->where('user_id', $user->id)
            ->where('date', $date)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->exists();

        if ($alreadyUserDay) {
            return response()->json([
                'message' => 'You already have a reservation for this amenity on that date.',
            ], 422);
        }

        $timeSlot = $request->time_slot;
        if ($amenity->status === 'bookable') {
            if (! $timeSlot) {
                return response()->json(['message' => 'Please select a time slot.'], 422);
            }

            $validSlots = AmenitySlots::generate(
                $amenity->start_time ?? null,
                $amenity->end_time ?? null,
                $amenity->slot_duration_minutes !== null ? (int) $amenity->slot_duration_minutes : null,
                $amenity->hours ?? null,
            );
            $validValues = array_column($validSlots, 'value');
            if ($validValues && ! in_array($timeSlot, $validValues, true)) {
                return response()->json(['message' => 'Selected time slot is not available for this amenity.'], 422);
            }

            $conflict = DB::table('bookings')
                ->where('amenity_id', $request->amenity_id)
                ->where('date', $date)
                ->where('time_slot', $timeSlot)
                ->whereNotIn('status', ['cancelled', 'rejected'])
                ->exists();

            if ($conflict) {
                return response()->json(['message' => 'This time slot is already requested or booked.'], 422);
            }
        } else {
            // Open availability — no timed slot.
            $timeSlot = $timeSlot ?: 'Open access';
        }

        $id = DB::table('bookings')->insertGetId([
            'amenity_id' => $request->amenity_id,
            'user_id' => $user->id,
            'date' => $date,
            'time_slot' => $timeSlot,
            'guests' => $guests,
            'status' => 'pending',
            'notes' => $request->notes,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        ActivityLogService::user(
            'amenity_booking_requested',
            "Requested {$amenity->name} for {$date} {$timeSlot}",
            'Booking',
            $id,
        );

        $this->notifyBookingApprovers(
            $amenity,
            'info',
            'New amenity booking request',
            "{$user->name} requested {$amenity->name} for {$date}".($timeSlot ? " ({$timeSlot})" : '').'.',
            '/screens/admin-bookings',
            (int) $user->id,
        );

        $booking = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->select('bookings.*', 'amenities.name as amenity_name', 'amenities.name_es as amenity_name_es', 'amenities.name_ar as amenity_name_ar')
            ->where('bookings.id', $id)
            ->first();

        return response()->json([
            'data' => [
                'id' => $id,
                'amenity_id' => (int) $request->amenity_id,
                'amenity_name' => $booking->amenity_name ?? $amenity->name,
                'amenity_name_es' => $booking->amenity_name_es ?? null,
                'amenity_name_ar' => $booking->amenity_name_ar ?? null,
                'date' => $date,
                'time_slot' => $timeSlot,
                'guests' => $guests,
                'status' => 'pending',
            ],
            'message' => 'Reservation requested. The amenity owner will review your request.',
        ], 201);
    }

    /** DELETE /v1/bookings/{id} */
    public function cancelBooking(int $id): JsonResponse
    {
        $booking = DB::table('bookings')->where('id', $id)->where('user_id', auth()->id())->first();
        if (! $booking) {
            return response()->json(['message' => 'Booking not found'], 404);
        }

        if (! in_array($booking->status, ['pending', 'confirmed'], true)) {
            return response()->json([
                'message' => 'Only pending or confirmed reservations can be cancelled.',
            ], 422);
        }

        DB::table('bookings')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);

        return response()->json(['message' => 'Booking cancelled']);
    }

    /** PATCH /v1/bookings/{id}/approve — amenity creator or community admin. */
    public function approveBooking(int $id): JsonResponse
    {
        $booking = $this->findBookingWithAmenity($id);
        if (! $booking) {
            return response()->json(['message' => 'Booking not found'], 404);
        }

        $this->assertCanManageBooking($booking);

        if ($booking->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending booking requests can be approved.',
            ], 422);
        }

        DB::table('bookings')->where('id', $id)->update([
            'status' => 'confirmed',
            'updated_at' => now(),
        ]);

        ActivityLogService::user('booking_approved', "Approved {$booking->amenity_name} booking #{$id}", 'Booking', $id);
        NotificationService::send(
            $booking->user_id,
            'success',
            'Reservation approved',
            "Your booking for {$booking->amenity_name} on {$booking->date}".($booking->time_slot ? " ({$booking->time_slot})" : '').' is confirmed.',
            '/screens/property-management/my-booking',
        );

        return response()->json(['message' => 'Booking approved']);
    }

    /** PATCH /v1/bookings/{id}/reject */
    public function rejectBooking(int $id, Request $request): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:500']);

        $booking = $this->findBookingWithAmenity($id);
        if (! $booking) {
            return response()->json(['message' => 'Booking not found'], 404);
        }

        $this->assertCanManageBooking($booking);

        if ($booking->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending booking requests can be declined.',
            ], 422);
        }

        // Keep original requester notes; append decline reason when provided.
        $notes = $booking->notes;
        if ($request->filled('reason')) {
            $reason = trim((string) $request->reason);
            $notes = $notes
                ? rtrim((string) $notes)."\nDecline reason: {$reason}"
                : "Decline reason: {$reason}";
        }

        DB::table('bookings')->where('id', $id)->update([
            'status' => 'rejected',
            'notes' => $notes,
            'updated_at' => now(),
        ]);

        ActivityLogService::user('booking_rejected', "Rejected {$booking->amenity_name} booking #{$id}", 'Booking', $id);
        NotificationService::send(
            $booking->user_id,
            'warning',
            'Reservation declined',
            "Your booking for {$booking->amenity_name} on {$booking->date}".($booking->time_slot ? " ({$booking->time_slot})" : '').' was declined.'
                .($request->reason ? " Reason: {$request->reason}" : ''),
            '/screens/property-management/my-booking',
        );

        return response()->json(['message' => 'Booking rejected']);
    }

    /* ───────────────────────── Admin amenities ───────────────────────── */

    public function adminIndex(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = AdminRoleService::resolveAdminCommunityScope($user, $request);
        abort_if(! $communityId, 422, 'No community scope available.');

        $query = DB::table('amenities')
            ->leftJoin('users', 'users.id', '=', 'amenities.created_by')
            ->select('amenities.*', 'users.name as creator_name')
            ->where('amenities.community_id', $communityId)
            ->orderByRaw("FIELD(amenities.review_status, 'pending', 'approved', 'rejected')")
            ->orderBy('amenities.name');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('amenities.status', $request->status);
        }
        if ($request->filled('review_status') && $request->review_status !== 'all') {
            $query->where('amenities.review_status', $request->review_status);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('amenities.name', 'like', "%{$s}%")
                    ->orWhere('amenities.description', 'like', "%{$s}%")
                    ->orWhere('amenities.floor', 'like', "%{$s}%");
            });
        }

        $nextBookingByAmenity = $this->upcomingBookingsByAmenityForUser((int) $user->id);

        $amenities = $query->get()->map(function ($row) use ($user, $nextBookingByAmenity) {
            $formatted = $this->formatAmenity($row, $user->id);
            $booking = $nextBookingByAmenity->get((int) $row->id);

            return $this->withViewerBookingState($formatted, $booking);
        });

        return response()->json([
            'data' => $amenities,
            'total' => $amenities->count(),
            'pending_review' => $amenities->where('review_status', 'pending')->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        // Admin create — always approved/active.
        $user = $request->user();
        $communityId = AdminRoleService::resolveAdminCommunityScope($user, $request);
        abort_if(! $communityId, 422, 'No community scope available.');

        $data = $this->validateAmenityPayload($request, true);
        $row = $this->buildAmenityRow($data, $communityId, (int) $user->id, true);
        $id = DB::table('amenities')->insertGetId($row);

        ActivityLogService::user('amenity_created', "Created amenity: \"{$data['name']}\"", 'Amenity', $id);

        return response()->json([
            'data' => $this->formatAmenity(DB::table('amenities')->find($id), $user->id),
            'message' => 'Amenity created.',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        if (! $amenity) {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        $this->assertAmenityOwner($amenity, $request->user());

        $data = $this->validateAmenityPayload($request, false);
        $payload = $this->mapAmenityUpdatePayload($data);
        $payload['updated_at'] = now();
        DB::table('amenities')->where('id', $id)->update($payload);

        ActivityLogService::user('amenity_updated', "Updated amenity: \"{$amenity->name}\"", 'Amenity', $id);

        return response()->json([
            'data' => $this->formatAmenity(DB::table('amenities')->find($id), $request->user()->id),
            'message' => 'Amenity updated.',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        if (! $amenity) {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        $this->assertAmenityOwner($amenity, $request->user());

        $activeBookings = DB::table('bookings')
            ->where('amenity_id', $id)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->exists();

        if ($activeBookings) {
            return response()->json([
                'message' => 'Cannot delete an amenity with active or pending bookings. Close it instead, or cancel those bookings first.',
            ], 422);
        }

        DB::table('bookings')->where('amenity_id', $id)->delete();
        DB::table('amenities')->where('id', $id)->delete();
        ActivityLogService::user('amenity_deleted', "Deleted amenity: \"{$amenity->name}\"", 'Amenity', $id);

        return response()->json(['message' => 'Amenity deleted.']);
    }

    /** PATCH /v1/admin/amenities/{id}/approve — publish resident-submitted amenity. */
    public function approveAmenity(Request $request, int $id): JsonResponse
    {
        $amenity = $this->findAdminAmenity($id, $request);
        if (! $amenity) {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        if (($amenity->review_status ?? '') !== 'pending') {
            return response()->json([
                'message' => 'Only pending amenity submissions can be approved.',
            ], 422);
        }

        DB::table('amenities')->where('id', $id)->update([
            'review_status' => 'approved',
            'updated_at' => now(),
        ]);

        if ($amenity->created_by) {
            NotificationService::send(
                (int) $amenity->created_by,
                'success',
                'Amenity approved',
                "\"{$amenity->name}\" is now live for your community.",
                '/screens/property-management/amenity',
            );
        }

        return response()->json([
            'data' => $this->formatAmenity(DB::table('amenities')->find($id), $request->user()->id),
            'message' => 'Amenity approved and published.',
        ]);
    }

    /** PATCH /v1/admin/amenities/{id}/reject */
    public function rejectAmenity(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:500']);
        $amenity = $this->findAdminAmenity($id, $request);
        if (! $amenity) {
            return response()->json(['message' => 'Amenity not found.'], 404);
        }

        if (($amenity->review_status ?? '') !== 'pending') {
            return response()->json([
                'message' => 'Only pending amenity submissions can be declined.',
            ], 422);
        }

        DB::table('amenities')->where('id', $id)->update([
            'review_status' => 'rejected',
            'updated_at' => now(),
        ]);

        if ($amenity->created_by) {
            NotificationService::send(
                (int) $amenity->created_by,
                'warning',
                'Amenity not approved',
                "\"{$amenity->name}\" was not approved."
                    .($request->reason ? " Reason: {$request->reason}" : ''),
                '/screens/property-management/amenity',
            );
        }

        return response()->json(['message' => 'Amenity rejected.']);
    }

    /** GET /v1/admin/bookings — aliases booking inbox for admins. */
    public function adminBookings(Request $request): JsonResponse
    {
        return $this->bookingInbox($request);
    }

    /* ───────────────────────── Helpers ───────────────────────── */

    private function validateAmenityPayload(Request $request, bool $creating): array
    {
        $rules = [
            'name' => ($creating ? 'required' : 'sometimes').'|string|max:100',
            'name_es' => 'nullable|string|max:100',
            'name_ar' => 'nullable|string|max:100',
            'description' => 'nullable|string|max:2000',
            'description_es' => 'nullable|string|max:2000',
            'description_ar' => 'nullable|string|max:2000',
            'status' => ($creating ? 'required' : 'sometimes').'|in:'.implode(',', self::STATUSES),
            'capacity' => 'nullable|integer|min:0|max:1000',
            'floor' => 'nullable|string|max:40',
            'hours' => 'nullable|string|max:100',
            'start_time' => ($creating ? 'required' : 'sometimes').'|date_format:H:i',
            'end_time' => ($creating ? 'required' : 'sometimes').'|date_format:H:i|after:start_time',
            'weekends_available' => 'nullable|boolean',
            'slot_duration_minutes' => 'nullable|integer|min:15|max:480',
            'icon_key' => 'nullable|string|in:'.implode(',', self::ICON_KEYS),
        ];

        if ($creating && $request->input('status') === 'bookable') {
            $rules['slot_duration_minutes'] = 'required|integer|min:15|max:480';
        }

        return $request->validate($rules);
    }

    private function buildAmenityRow(array $data, int $communityId, int $userId, bool $isAdmin): array
    {
        $start = $data['start_time'] ?? null;
        $end = $data['end_time'] ?? null;
        $hours = AmenitySlots::formatHoursDisplay(
            $start ? $start.':00' : null,
            $end ? $end.':00' : null,
            $data['hours'] ?? null,
        );

        $status = $data['status'] ?? 'bookable';
        $slotDuration = $status === 'bookable'
            ? (int) ($data['slot_duration_minutes'] ?? 60)
            : null;

        return [
            'community_id' => $communityId,
            'created_by' => $userId,
            'name' => $data['name'],
            'name_es' => $data['name_es'] ?? null,
            'name_ar' => $data['name_ar'] ?? null,
            'description' => $data['description'] ?? null,
            'description_es' => $data['description_es'] ?? null,
            'description_ar' => $data['description_ar'] ?? null,
            'status' => $status,
            'review_status' => $isAdmin ? 'approved' : 'pending',
            'capacity' => $data['capacity'] ?? 10,
            'floor' => $data['floor'] ?? null,
            'hours' => $hours,
            'start_time' => $start ? $start.':00' : null,
            'end_time' => $end ? $end.':00' : null,
            'weekends_available' => array_key_exists('weekends_available', $data)
                ? (bool) $data['weekends_available']
                : true,
            'slot_duration_minutes' => $slotDuration,
            'image_url' => null,
            'icon_key' => $data['icon_key'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function mapAmenityUpdatePayload(array $data): array
    {
        $payload = [];
        foreach (['name', 'name_es', 'name_ar', 'description', 'description_es', 'description_ar', 'status', 'capacity', 'floor', 'icon_key', 'weekends_available', 'slot_duration_minutes'] as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = $data[$field];
            }
        }

        if (array_key_exists('start_time', $data)) {
            $payload['start_time'] = $data['start_time'] ? $data['start_time'].':00' : null;
        }
        if (array_key_exists('end_time', $data)) {
            $payload['end_time'] = $data['end_time'] ? $data['end_time'].':00' : null;
        }

        if (isset($payload['start_time']) || isset($payload['end_time']) || array_key_exists('hours', $data)) {
            $payload['hours'] = AmenitySlots::formatHoursDisplay(
                $payload['start_time'] ?? null,
                $payload['end_time'] ?? null,
                $data['hours'] ?? null,
            );
        }

        if (($payload['status'] ?? null) === 'open' || ($payload['status'] ?? null) === 'closed') {
            $payload['slot_duration_minutes'] = null;
        }

        foreach (['description', 'floor', 'hours', 'icon_key'] as $field) {
            if (array_key_exists($field, $data) && ($data[$field] === '' || $data[$field] === null)) {
                $payload[$field] = null;
            }
        }

        return $payload;
    }

    private function formatAmenity(object $row, ?int $viewerId = null): array
    {
        $start = $row->start_time ?? null;
        $end = $row->end_time ?? null;
        $duration = $row->slot_duration_minutes ?? null;

        return [
            'id' => (int) $row->id,
            'community_id' => (int) $row->community_id,
            'created_by' => $row->created_by !== null ? (int) $row->created_by : null,
            'creator_name' => $row->creator_name ?? null,
            'name' => $row->name,
            'name_es' => $row->name_es ?? null,
            'name_ar' => $row->name_ar ?? null,
            'description' => $row->description,
            'description_es' => $row->description_es ?? null,
            'description_ar' => $row->description_ar ?? null,
            'status' => $row->status,
            'review_status' => $row->review_status ?? 'approved',
            'capacity' => (int) ($row->capacity ?? 0),
            'floor' => $row->floor,
            'hours' => AmenitySlots::formatHoursDisplay($start, $end, $row->hours ?? null),
            'start_time' => $start ? substr((string) $start, 0, 5) : null,
            'end_time' => $end ? substr((string) $end, 0, 5) : null,
            'weekends_available' => (bool) ($row->weekends_available ?? true),
            'slot_duration_minutes' => $duration !== null ? (int) $duration : null,
            'slots' => $row->status === 'bookable'
                ? AmenitySlots::generate($start, $end, $duration !== null ? (int) $duration : null, $row->hours ?? null)
                : [],
            'image_url' => MediaUrl::toPublic($row->image_url ?? null, request()),
            'icon_key' => $row->icon_key ?? null,
            'is_mine' => $viewerId !== null && (int) ($row->created_by ?? 0) === $viewerId,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }

    private function upcomingBookingsByAmenityForUser(int $userId)
    {
        return DB::table('bookings')
            ->where('user_id', $userId)
            ->where('date', '>=', now()->toDateString())
            ->whereNotIn('status', ['cancelled'])
            ->orderBy('date')
            ->get(['id', 'amenity_id', 'date', 'time_slot', 'status', 'guests'])
            ->groupBy('amenity_id')
            ->map(fn ($rows) => $rows->first());
    }

    /** @param  array<string, mixed>  $amenity */
    private function withViewerBookingState(array $amenity, ?object $booking): array
    {
        $amenity['user_has_upcoming_booking'] = $booking !== null;
        $amenity['user_next_booking_id'] = $booking ? (int) $booking->id : null;
        $amenity['user_next_booking_date'] = $booking ? (string) $booking->date : null;
        $amenity['user_next_booking_time_slot'] = $booking->time_slot ?? null;
        $amenity['user_next_booking_status'] = $booking->status ?? null;
        $amenity['user_next_booking_guests'] = $booking ? (int) ($booking->guests ?? 1) : null;

        return $amenity;
    }

    private function resolveResidentCommunityId(Request $request, $user): int
    {
        if ($request->filled('community_id')) {
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

    private function findAdminAmenity(int $id, Request $request): ?object
    {
        $user = $request->user();
        $scope = AdminRoleService::resolveAdminCommunityScope($user, $request);
        abort_if(! $scope, 422, 'No community scope available.');

        return DB::table('amenities')
            ->where('id', $id)
            ->where('community_id', $scope)
            ->first();
    }

    /** Only the creator may update or delete; approve/reject stays available to any community admin. */
    private function assertAmenityOwner(object $amenity, object $user): void
    {
        $ownerId = $amenity->created_by ?? null;
        if ($ownerId !== null && (int) $ownerId !== (int) $user->id) {
            abort(403, 'You can only edit or delete amenities you created.');
        }
    }

    private function findBookingWithAmenity(int $id): ?object
    {
        return DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->select(
                'bookings.*',
                'amenities.name as amenity_name',
                'amenities.name_es as amenity_name_es',
                'amenities.name_ar as amenity_name_ar',
                'amenities.community_id',
                'amenities.created_by as amenity_created_by',
            )
            ->where('bookings.id', $id)
            ->first();
    }

    private function assertCanManageBooking(object $booking): void
    {
        $user = auth()->user();
        if (AdminRoleService::isSystemAdmin($user)) {
            return;
        }
        if ((int) ($booking->amenity_created_by ?? 0) === (int) $user->id) {
            return;
        }
        abort(403, 'Only the amenity creator can manage this booking.');
    }

    private function notifyBookingApprovers(
        object $amenity,
        string $type,
        string $title,
        string $body,
        ?string $url,
        ?int $excludeUserId,
    ): void {
        if (empty($amenity->created_by)) {
            return;
        }

        $creatorId = (int) $amenity->created_by;
        if ($excludeUserId !== null && $creatorId === $excludeUserId) {
            return;
        }

        NotificationService::send($creatorId, $type, $title, $body, $url);
    }

    private function notifyCommunityAdmins(
        int $communityId,
        string $type,
        string $title,
        string $body,
        ?string $url = null,
        ?int $excludeUserId = null,
    ): void {
        $adminIds = DB::table('community_memberships')
            ->where('community_id', $communityId)
            ->whereIn('role', ['admin', 'moderator'])
            ->where('status', 'approved')
            ->pluck('user_id');

        foreach ($adminIds as $adminId) {
            if ($excludeUserId !== null && (int) $adminId === $excludeUserId) {
                continue;
            }
            NotificationService::send((int) $adminId, $type, $title, $body, $url);
        }
    }
}
