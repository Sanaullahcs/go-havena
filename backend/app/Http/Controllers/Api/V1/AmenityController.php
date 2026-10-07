<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\AdminRoleService;
use App\Services\AmenityBillReminderService;
use App\Services\AmenityCapacityService;
use App\Services\AmenitySharedBillService;
use App\Services\GuestAccessService;
use App\Services\GuestActivityService;
use App\Services\NotificationService;
use App\Services\PlaidAchService;
use App\Models\PlaidTransfer;
use App\Support\AmenitySlots;
use App\Support\MediaUrl;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class AmenityController extends Controller
{
    private const STATUSES = ['open', 'bookable', 'closed'];

    private const ICON_KEYS = [
        'gym', 'yoga', 'pool', 'laundry', 'car_wash', 'barber',
        'cleaning', 'sports', 'events', 'package', 'lounge',
        'hall', 'meeting', 'dining', 'playground', 'terrace', 'spa',
        'library', 'parking', 'cinema', 'bike', 'building', 'other',
    ];

    public const SHARED_BILLING_TYPE_ALL_RESIDENTS = 'all_residents';

    public const SHARED_BILLING_FREQUENCY_MONTHLY = 'monthly';

    public const SHARED_BILLING_FREQUENCY_YEARLY = 'yearly';

    public const PAYMENT_NOT_REQUIRED = 'not_required';

    public const PAYMENT_PENDING = 'pending';

    public const PAYMENT_ACCEPTED = 'accepted';

    public const PAYMENT_REJECTED = 'rejected';

    public const BOOKING_PROOF_FILE_RULE = 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp';

    /** GET /v1/amenities — approved amenities (+ caller's own pending). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveResidentCommunityId($request, $user);

        if (GuestAccessService::isGuest($user)) {
            GuestActivityService::logView($user, 'services');
        }

        $amenities = DB::table('amenities')
            ->leftJoin('users', 'users.id', '=', 'amenities.created_by')
            ->leftJoin('communities', 'communities.id', '=', 'amenities.community_id')
            ->select('amenities.*', 'users.name as creator_name', 'communities.name as community_name')
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
        $restrictedAmenityIds = app(AmenityBillReminderService::class)->restrictedAmenityIds(
            (int) $user->id,
            $amenities->pluck('id')->map(fn ($id) => (int) $id)->all(),
        );

        $amenities = $amenities->map(function ($row) use ($user, $nextBookingByAmenity, $restrictedAmenityIds) {
            $formatted = $this->formatAmenity($row, $user->id);
            $formatted['has_overdue_shared_amenity_bill'] = in_array((int) $row->id, $restrictedAmenityIds, true);
            $booking = $nextBookingByAmenity->get((int) $row->id);

            return $this->withViewerBookingState($formatted, $booking);
        });
        $amenities = $this->withBookingBills($amenities, $request);

        return response()->json(['data' => $amenities]);
    }

    /** POST /v1/amenities — resident or admin create. */
    public function create(Request $request): JsonResponse
    {
        $user = $request->user();
        GuestAccessService::assertCanWrite($user, 'create_amenity');
        $communityId = $this->resolveResidentCommunityId($request, $user);
        $isAdmin = AdminRoleService::canManageCommunity($user, $communityId)
            || AdminRoleService::isSystemAdmin($user);

        if (! $isAdmin) {
            $request->merge([
                'shared_billing_enabled' => false,
                'shared_billing_amount' => null,
                'shared_billing_due_day' => null,
                'shared_billing_frequency' => null,
            ]);
        }

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
        if ($isAdmin && ($amenity->shared_billing_enabled ?? false)) {
            app(AmenitySharedBillService::class)->generateCurrentPeriodBill($amenity, (int) $user->id, $request);
        }

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

        $date = (string) $request->date;

        if (app(AmenityBillReminderService::class)->hasOverdueSharedAmenityBill($id, (int) $user->id)) {
            return response()->json([
                'data' => [],
                'message' => AmenityBillReminderService::BOOKING_RESTRICTED_MESSAGE,
                'error' => AmenityBillReminderService::BOOKING_RESTRICTED_ERROR,
                'has_overdue_shared_amenity_bill' => true,
            ], 422);
        }

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

        $capacity = (int) ($amenity->capacity ?? 0);
        $capacityService = app(AmenityCapacityService::class);
        $occupying = $capacityService->occupyingBookings($id, $date);
        $capacityBookingType = $capacityService->typeFor($amenity);

        if ($amenity->status !== 'bookable') {
            $booked = $capacityService->totalGuests($occupying);
            $remaining = $capacityService->remainingCapacity($capacity, $booked);

            return response()->json([
                'data' => [],
                'capacity' => $capacity,
                'capacity_booking_type' => $capacityBookingType,
                'booked' => $booked,
                'remaining' => $remaining,
                'available' => $remaining === null || $remaining > 0,
                'weekends_available' => (bool) ($amenity->weekends_available ?? true),
                'message' => 'This amenity does not use timed slots.',
            ]);
        }

        $slots = AmenitySlots::generate(
            $amenity->start_time ?? null,
            $amenity->end_time ?? null,
            $amenity->slot_duration_minutes !== null ? (int) $amenity->slot_duration_minutes : null,
            $amenity->hours ?? null,
            $date,
        );

        $usedBySlot = $capacityService->usedSeatsBySlot($amenity, $occupying, $slots);
        $data = [];
        foreach ($slots as $index => $slot) {
            $norm = AmenitySlots::normalizeSlotLabel((string) ($slot['value'] ?? ''));
            $booked = (int) ($usedBySlot[$norm] ?? 0);
            $payload = $this->slotOccupancyPayload($slot, $capacity, $booked);
            $payload['remaining_forward'] = $capacityService->remainingFromIndex(
                $slots,
                $usedBySlot,
                (int) $index,
                $capacity,
            );

            $data[] = $payload;
        }

        return response()->json([
            'data' => $data,
            'capacity' => $capacity,
            'capacity_booking_type' => $capacityBookingType,
            'weekends_available' => (bool) ($amenity->weekends_available ?? true),
        ]);
    }

    /** GET /v1/bookings */
    public function myBookings(Request $request): JsonResponse
    {
        $rows = DB::table('bookings')
            ->join('amenities', 'amenities.id', '=', 'bookings.amenity_id')
            ->select(
                'bookings.*',
                'amenities.name as amenity_name',
                'amenities.name_es as amenity_name_es',
                'amenities.name_ar as amenity_name_ar',
                'amenities.image_url as amenity_image',
                'amenities.icon_key as amenity_icon_key',
                'amenities.status as amenity_status',
                'amenities.shared_billing_enabled as amenity_shared_billing_enabled',
                'amenities.shared_billing_amount as amenity_shared_billing_amount',
                'amenities.shared_billing_frequency as amenity_shared_billing_frequency',
            )
            ->where('bookings.user_id', auth()->id())
            ->orderBy('bookings.date', 'desc')
            ->get();

        $bills = app(AmenitySharedBillService::class)->residentBillsByBookingIds(
            $rows->pluck('id')->map(fn ($id) => (int) $id)->all(),
            $request,
        );

        $bookings = $rows->map(function ($row) use ($bills) {
            $formatted = $this->formatResidentBooking($row);
            $formatted['booking_bill'] = $bills[(int) $row->id] ?? null;

            return $formatted;
        })->values();

        return response()->json(['data' => $bookings]);
    }

    /** GET /v1/bookings/inbox — bookings for amenities the current user created. */
    public function bookingInbox(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveInboxCommunityId($request, $user);

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
                'amenities.shared_billing_enabled as amenity_shared_billing_enabled',
                'amenities.shared_billing_amount as amenity_shared_billing_amount',
                'amenities.shared_billing_frequency as amenity_shared_billing_frequency',
                DB::raw('COALESCE(profiles.display_name, users.name) as user_name'),
                'profiles.unit_number as user_unit',
            )
            ->where('amenities.community_id', $communityId)
            ->where('amenities.created_by', $user->id);

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('bookings.status', $request->status);
        } else {
            $query->whereNotIn('bookings.status', ['cancelled', 'rejected']);
        }

        $bookings = $query
            ->orderByRaw("FIELD(bookings.status, 'pending', 'awaiting_payment', 'confirmed', 'rejected', 'cancelled')")
            ->orderBy('bookings.date', 'asc')
            ->get()
            ->map(fn ($row) => $this->formatInboxBooking($row))
            ->values();

        return response()->json(['data' => $bookings]);
    }

    /** POST /v1/bookings */
    public function book(Request $request): JsonResponse
    {
        $request->validate([
            'amenity_id' => 'required|integer|exists:amenities,id',
            'date' => 'required|date|after_or_equal:today',
            'time_slot' => 'nullable|string|max:50',
            'guests' => 'integer|min:1|max:1000',
            'notes' => 'nullable|string|max:500',
            'payment_proof' => 'nullable|'.self::BOOKING_PROOF_FILE_RULE,
            'payment_date' => 'nullable|date|before_or_equal:today',
            'payment_reference' => 'nullable|string|max:100',
            'payment_note' => 'nullable|string|max:1000',
            'payment_method' => 'nullable|string|in:bank_ach,proof',
        ]);

        $user = $request->user();
        GuestAccessService::assertCanWrite($user, 'book_amenity');

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

        if (app(AmenityBillReminderService::class)->hasOverdueSharedAmenityBill((int) $amenity->id, (int) $user->id)) {
            return response()->json([
                'message' => AmenityBillReminderService::BOOKING_RESTRICTED_MESSAGE,
                'error' => AmenityBillReminderService::BOOKING_RESTRICTED_ERROR,
                'has_overdue_shared_amenity_bill' => true,
            ], 422);
        }

        $date = (string) $request->date;
        if (! ($amenity->weekends_available ?? true) && AmenitySlots::isWeekendDate($date)) {
            return response()->json(['message' => 'This amenity is not available on weekends.'], 422);
        }

        $requestedSeats = (int) ($request->guests ?? 1);
        $capacity = (int) ($amenity->capacity ?? 0);
        $capacityService = app(AmenityCapacityService::class);
        $timedSlot = $amenity->status === 'bookable';

        $timeSlot = $request->time_slot;
        $normalizedSlot = '';
        $validSlots = [];
        if ($timedSlot) {
            if (! $timeSlot) {
                return response()->json(['message' => 'Please select a time slot.'], 422);
            }

            $validSlots = AmenitySlots::generate(
                $amenity->start_time ?? null,
                $amenity->end_time ?? null,
                $amenity->slot_duration_minutes !== null ? (int) $amenity->slot_duration_minutes : null,
                $amenity->hours ?? null,
                $date,
            );
            $validValues = array_column($validSlots, 'value');
            $normalizedSlot = AmenitySlots::normalizeSlotLabel((string) $timeSlot);
            $validNormalized = array_map(
                static fn ($value) => AmenitySlots::normalizeSlotLabel((string) $value),
                $validValues,
            );
            if ($validNormalized && ! in_array($normalizedSlot, $validNormalized, true)) {
                return response()->json(['message' => 'Selected time slot is not available for this amenity.'], 422);
            }

            $timeSlot = $normalizedSlot !== '' ? $normalizedSlot : $timeSlot;
        } else {
            // Open availability — no timed slot.
            $timeSlot = $timeSlot ?: 'Open access';
            $normalizedSlot = AmenitySlots::normalizeSlotLabel((string) $timeSlot);
            if ($capacity > 0 && $requestedSeats > $capacity) {
                return response()->json([
                    'message' => "This amenity allows up to {$capacity} guests.",
                ], 422);
            }
        }

        if ($amenity->shared_billing_enabled ?? false) {
            app(AmenitySharedBillService::class)->generateCurrentPeriodBill($amenity, (int) ($amenity->created_by ?? $user->id), $request);
            if (app(AmenityBillReminderService::class)->hasOverdueSharedAmenityBill((int) $amenity->id, (int) $user->id)) {
                return response()->json([
                    'message' => AmenityBillReminderService::BOOKING_RESTRICTED_MESSAGE,
                    'error' => AmenityBillReminderService::BOOKING_RESTRICTED_ERROR,
                    'has_overdue_shared_amenity_bill' => true,
                ], 422);
            }
        }

        $guests = $capacityService->storedGuestCount($amenity, $requestedSeats, $timedSlot);
        $bookingFee = $capacityService->bookingFee($amenity, $requestedSeats, $timedSlot);
        $payWithBank = $bookingFee > 0 && $request->input('payment_method') === 'bank_ach';
        $draftBookingId = null;

        try {
            $id = DB::transaction(function () use (
            $amenity,
            $request,
            $user,
            $date,
            $timeSlot,
            $normalizedSlot,
            $guests,
            $requestedSeats,
            $capacity,
            $bookingFee,
            $timedSlot,
            $validSlots,
            $capacityService,
            $payWithBank,
            &$draftBookingId,
        ) {
            DB::table('amenities')->where('id', $amenity->id)->lockForUpdate()->first();

            $alreadyUserDay = DB::table('bookings')
                ->where('amenity_id', $request->amenity_id)
                ->where('user_id', $user->id)
                ->where('date', $date)
                ->whereNotIn('status', ['cancelled', 'rejected'])
                ->exists();

            if ($alreadyUserDay) {
                throw new HttpResponseException(response()->json([
                    'message' => 'You already have a reservation for this amenity on that date.',
                ], 422));
            }

            $occupying = $capacityService->occupyingBookings((int) $amenity->id, $date);
            $allocations = [];

            if ($timedSlot && $validSlots !== []) {
                try {
                    $allocations = $capacityService->planAllocations(
                        $amenity,
                        $validSlots,
                        $normalizedSlot,
                        $requestedSeats,
                        $occupying,
                    );
                } catch (\InvalidArgumentException $e) {
                    throw new HttpResponseException(response()->json(['message' => $e->getMessage()], 422));
                }
            } else {
                $used = $capacityService->totalGuests($occupying);
                if ($capacity > 0 && $used + $requestedSeats > $capacity) {
                    $remaining = max(0, $capacity - $used);
                    if ($remaining < 1) {
                        $message = 'This date is fully booked.';
                    } else {
                        $spotWord = $remaining === 1 ? 'spot' : 'spots';
                        $message = "Only {$remaining} {$spotWord} left in this date.";
                    }

                    throw new HttpResponseException(response()->json(['message' => $message], 422));
                }
            }

            $now = now();

            $bookingId = DB::table('bookings')->insertGetId([
                'amenity_id' => $request->amenity_id,
                'user_id' => $user->id,
                'date' => $date,
                'time_slot' => $timeSlot,
                'guests' => $guests,
                'booking_fee' => $bookingFee,
                'status' => 'pending',
                'payment_verification_status' => self::PAYMENT_NOT_REQUIRED,
                'notes' => $request->notes,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $draftBookingId = (int) $bookingId;

            if ($payWithBank) {
                app(PlaidAchService::class)->payBooking($user, (int) $bookingId);
            }

            $capacityService->storeAllocations($bookingId, (int) $amenity->id, $date, $allocations);

            return $bookingId;
        });
        } catch (\Throwable $e) {
            if ($draftBookingId) {
                $this->discardFailedBookingAttempt($draftBookingId);
            }

            throw $e;
        }

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
            'data' => $this->formatResidentBooking($booking),
            'message' => $payWithBank
                ? 'Bank payment submitted. The amenity owner will review your request.'
                : 'Reservation requested. The amenity owner will review your request.',
        ], 201);
    }

    /**
     * A failed bank charge must not keep the reservation. InnoDB rolls the insert
     * back; MyISAM does not, so this removes the attempt when payment never settled.
     */
    private function discardFailedBookingAttempt(int $bookingId): void
    {
        $booking = DB::table('bookings')->where('id', $bookingId)->first();
        if (! $booking || ($booking->payment_verification_status ?? '') === 'accepted') {
            return;
        }

        if (Schema::hasTable('booking_slot_allocations')) {
            DB::table('booking_slot_allocations')->where('booking_id', $bookingId)->delete();
        }

        DB::table('plaid_transfers')
            ->where('payable_type', PlaidTransfer::PAYABLE_BOOKING)
            ->where('payable_id', $bookingId)
            ->whereNotIn('status', [
                PlaidTransfer::STATUS_POSTED,
                PlaidTransfer::STATUS_SETTLED,
                PlaidTransfer::STATUS_PROCESSING,
            ])
            ->delete();

        DB::table('bookings')->where('id', $bookingId)->delete();
    }

    /** DELETE /v1/bookings/{id} — booker or community admin in scope. */
    public function cancelBooking(int $id): JsonResponse
    {
        $booking = DB::table('bookings')->where('id', $id)->first();
        if (! $booking) {
            return response()->json(['message' => 'Booking not found'], 404);
        }

        $user = auth()->user();
        $isBooker = (int) $booking->user_id === (int) $user->id;
        $canAdminCancel = false;
        if (! $isBooker) {
            $scoped = $this->findBookingWithAmenity($id);
            if ($scoped && AdminRoleService::isActiveCommunityAdmin($user)) {
                $communityId = AdminRoleService::resolveAdminCommunityScope($user, request());
                $canAdminCancel = $communityId && (int) ($scoped->community_id ?? 0) === (int) $communityId;
            }
        }
        if (! $isBooker && ! $canAdminCancel) {
            return response()->json(['message' => 'Booking not found'], 404);
        }

        if (! in_array($booking->status, ['pending', 'awaiting_payment', 'confirmed'], true)) {
            return response()->json([
                'message' => 'Only pending or confirmed reservations can be cancelled.',
            ], 422);
        }

        if (! app(AmenityCapacityService::class)->canCancel($booking)) {
            return response()->json([
                'message' => 'This reservation can no longer be cancelled after payment.',
            ], 422);
        }

        $this->refundBookingAchIfNeeded($booking, auth()->user());

        DB::transaction(function () use ($id, $booking) {
            app(AmenitySharedBillService::class)->withdrawOpenBillsForCancelledBooking((int) $booking->id);

            if (Schema::hasTable('booking_slot_allocations')) {
                DB::table('booking_slot_allocations')->where('booking_id', (int) $booking->id)->delete();
            }

            DB::table('bookings')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        });

        ActivityLogService::user(
            'booking_cancelled',
            'Cancelled amenity booking #'.$id,
            'Booking',
            $id,
        );

        return response()->json(['message' => 'Booking cancelled']);
    }

    /** PATCH /v1/bookings/{id}/approve — amenity creator or community admin. */
    public function approveBooking(Request $request, int $id): JsonResponse
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

        $amenity = DB::table('amenities')->find((int) $booking->amenity_id);
        $fee = (float) ($booking->booking_fee ?? 0);
        $booker = \App\Models\User::query()->find((int) $booking->user_id);
        $adminPaysAfterApproval = $amenity
            && ! ($amenity->shared_billing_enabled ?? false)
            && $fee > 0
            && AdminRoleService::isCommunityAdminRole($booker);

        $paidByBank = ($booking->payment_method ?? null) === 'bank_ach'
            && ($booking->payment_verification_status ?? '') === 'accepted';
        $nextStatus = $adminPaysAfterApproval && ! $paidByBank ? 'awaiting_payment' : 'confirmed';

        DB::table('bookings')->where('id', $id)->update([
            'status' => $nextStatus,
            'rejection_reason' => null,
            'updated_at' => now(),
        ]);

        if ($amenity && ! ($amenity->shared_billing_enabled ?? false) && $fee > 0 && ! $paidByBank) {
            $booking->status = $nextStatus;
            app(AmenitySharedBillService::class)->createBookingBill($booking, $amenity, (int) $request->user()->id, $request);
            NotificationService::send(
                $booking->user_id,
                'info',
                $adminPaysAfterApproval ? 'Pay for your booking' : 'Booking bill available',
                $adminPaysAfterApproval
                    ? "Your {$booking->amenity_name} booking was approved. Submit payment proof to confirm it."
                    : "Your {$booking->amenity_name} booking was approved. Submit payment proof from Amenity bills.",
                $adminPaysAfterApproval
                    ? '/screens/property-management/my-booking'
                    : '/screens/property-management/amenity-bills',
            );
        }

        ActivityLogService::user('booking_approved', "Approved {$booking->amenity_name} booking #{$id}", 'Booking', $id);
        if ($paidByBank) {
            NotificationService::send(
                $booking->user_id,
                'success',
                'Reservation approved',
                "Your bank payment for {$booking->amenity_name} on {$booking->date}".($booking->time_slot ? " ({$booking->time_slot})" : '').' is confirmed.',
                '/screens/property-management/my-booking',
            );
        } elseif ($adminPaysAfterApproval) {
            NotificationService::send(
                $booking->user_id,
                'info',
                'Reservation approved — payment required',
                "Your booking for {$booking->amenity_name} on {$booking->date}".($booking->time_slot ? " ({$booking->time_slot})" : '').' is approved. Pay and submit proof to confirm it.',
                '/screens/property-management/my-booking',
            );
        } else {
            NotificationService::send(
                $booking->user_id,
                'success',
                'Reservation approved',
                "Your booking for {$booking->amenity_name} on {$booking->date}".($booking->time_slot ? " ({$booking->time_slot})" : '').' is confirmed.',
                '/screens/property-management/my-booking',
            );
        }

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

        $reason = $request->filled('reason') ? trim((string) $request->reason) : null;
        $this->refundBookingAchIfNeeded($booking, $request->user());
        $paymentStatus = ($booking->payment_verification_status ?? self::PAYMENT_NOT_REQUIRED) === self::PAYMENT_PENDING
            ? self::PAYMENT_REJECTED
            : ($booking->payment_verification_status ?? self::PAYMENT_NOT_REQUIRED);

        DB::table('bookings')->where('id', $id)->update([
            'status' => 'rejected',
            'payment_verification_status' => $paymentStatus,
            'rejection_reason' => $reason,
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
            ->leftJoin('communities', 'communities.id', '=', 'amenities.community_id')
            ->select('amenities.*', 'users.name as creator_name', 'communities.name as community_name')
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
        $amenities = $this->withBookingBills($amenities, $request);

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

        $amenity = DB::table('amenities')->find($id);
        if ($amenity->shared_billing_enabled ?? false) {
            app(AmenitySharedBillService::class)->generateCurrentPeriodBill($amenity, (int) $user->id, $request);
        }

        return response()->json([
            'data' => $this->formatAmenity($amenity, $user->id),
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
        $fields = ['name', 'name_es', 'name_ar', 'description', 'description_es', 'description_ar', 'status', 'capacity', 'capacity_booking_type', 'floor', 'hours', 'start_time', 'end_time', 'weekends_available', 'slot_duration_minutes', 'icon_key', 'review_status', 'shared_billing_enabled', 'shared_billing_frequency', 'shared_billing_amount', 'shared_billing_due_day', 'booking_fee'];
        $before = ActivityLogService::snapshot($amenity, $fields);
        DB::table('amenities')->where('id', $id)->update($payload);

        $fresh = DB::table('amenities')->find($id);
        ActivityLogService::recordUpdate(
            'amenity_updated',
            'Amenity',
            $id,
            $before,
            ActivityLogService::snapshot($fresh, $fields),
            [],
            null,
            $amenity->created_by ? (int) $amenity->created_by : null,
            ['related_item' => $fresh->name ?? $amenity->name],
        );

        if ($fresh && ($fresh->shared_billing_enabled ?? false)) {
            app(AmenitySharedBillService::class)->generateCurrentPeriodBill($fresh, (int) $request->user()->id, $request);
        }

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
            'review_status'    => 'approved',
            'rejection_reason' => null,
            'updated_at'       => now(),
        ]);

        ActivityLogService::recordChanges(
            'amenity_approved',
            'Amenity',
            $id,
            [
                ['field' => 'Review Status', 'key' => 'review_status', 'previous' => $amenity->review_status, 'next' => 'approved'],
                ['field' => 'Rejection Reason', 'key' => 'rejection_reason', 'previous' => $amenity->rejection_reason ?? null, 'next' => null],
            ],
            null,
            $amenity->created_by ? (int) $amenity->created_by : null,
            ['related_item' => $amenity->name],
        );

        if ($amenity->created_by) {
            NotificationService::send(
                (int) $amenity->created_by,
                'success',
                'Amenity approved',
                "\"{$amenity->name}\" is now live for your community.",
                '/screens/property-management/amenity',
            );
        }

        $fresh = DB::table('amenities')->find($id);
        if ($fresh && ($fresh->shared_billing_enabled ?? false)) {
            app(AmenitySharedBillService::class)->generateCurrentPeriodBill($fresh, (int) $request->user()->id, $request);
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

        $reason = $request->filled('reason') ? trim((string) $request->reason) : null;

        DB::table('amenities')->where('id', $id)->update([
            'review_status'     => 'rejected',
            'rejection_reason'  => $reason,
            'updated_at'        => now(),
        ]);

        ActivityLogService::recordChanges(
            'amenity_rejected',
            'Amenity',
            $id,
            [
                ['field' => 'Review Status', 'key' => 'review_status', 'previous' => $amenity->review_status, 'next' => 'rejected'],
                ['field' => 'Rejection Reason', 'key' => 'rejection_reason', 'previous' => $amenity->rejection_reason ?? null, 'next' => $reason],
            ],
            null,
            $amenity->created_by ? (int) $amenity->created_by : null,
            ['related_item' => $amenity->name],
            'warning',
        );

        if ($amenity->created_by) {
            NotificationService::send(
                (int) $amenity->created_by,
                'warning',
                'Amenity not approved',
                "\"{$amenity->name}\" was not approved."
                    .($reason ? " Reason: {$reason}" : ''),
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
        $trimmed = [];
        if ($request->exists('name') && is_string($request->input('name'))) {
            $trimmed['name'] = trim($request->input('name'));
        }
        if ($request->exists('floor') && is_string($request->input('floor'))) {
            $trimmed['floor'] = trim($request->input('floor'));
        }
        if ($request->exists('description') && is_string($request->input('description'))) {
            $description = trim($request->input('description'));
            $trimmed['description'] = $description === '' ? null : $description;
        }
        if ($trimmed !== []) {
            $request->merge($trimmed);
        }

        if ($request->boolean('open_24_hours')) {
            $request->merge([
                'start_time' => '00:00',
                'end_time' => '00:00',
                'hours' => 'Open 24 Hours',
            ]);
        }

        $rules = [
            'name' => [
                $creating ? 'required' : 'sometimes',
                'string',
                'min:2',
                'max:100',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || mb_strlen(trim($value)) < 2) {
                        return;
                    }
                    if (! $this->amenityNameIsValid(trim($value))) {
                        $fail('Please enter a valid amenity name.');
                    }
                },
            ],
            'name_es' => 'nullable|string|max:100',
            'name_ar' => 'nullable|string|max:100',
            'description' => 'nullable|string|min:10|max:500',
            'description_es' => 'nullable|string|max:500',
            'description_ar' => 'nullable|string|max:500',
            'status' => ($creating ? 'required' : 'sometimes').'|in:'.implode(',', self::STATUSES),
            'capacity' => ($request->input('status') === 'bookable' ? 'required' : 'nullable').'|integer|min:1|max:1000',
            'capacity_booking_type' => 'nullable|in:'.AmenityCapacityService::TYPE_PER_SEAT.','.AmenityCapacityService::TYPE_FULL_SLOT,
            'floor' => [
                'nullable',
                'string',
                'min:2',
                'max:25',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value) || trim($value) === '') {
                        return;
                    }
                    if (! $this->amenityLocationIsValid(trim($value))) {
                        $fail('Please enter a valid location.');
                    }
                },
            ],
            'hours' => 'nullable|string|max:100',
            'open_24_hours' => 'nullable|boolean',
            'closes_next_day' => 'nullable|boolean',
            'opening_date' => 'nullable|date_format:Y-m-d',
            'closing_date' => 'nullable|date_format:Y-m-d',
            'start_time' => ($creating ? 'required' : 'sometimes').'|date_format:H:i',
            'end_time' => [
                ($creating ? 'required' : 'sometimes'),
                'date_format:H:i',
                function (string $attribute, mixed $value, \Closure $fail) use ($request) {
                    $start = $request->input('start_time');
                    if (! is_string($start) || $start === '' || ! is_string($value) || $value === '') {
                        return;
                    }

                    if (substr($start, 0, 5) === substr($value, 0, 5)) {
                        if ($request->boolean('open_24_hours') || $this->closingDateIsNextDay(
                            $request->input('opening_date'),
                            $request->input('closing_date'),
                        )) {
                            return;
                        }

                        $fail('Opening and closing times cannot be the same.');

                        return;
                    }

                    if (
                        $this->closingDateIsNextDay($request->input('opening_date'), $request->input('closing_date'))
                        && substr($value, 0, 5) > substr($start, 0, 5)
                    ) {
                        $fail('A next-day closing time cannot be later than the opening time.');

                        return;
                    }

                    $window = AmenitySlots::resolvedWindow($start, $value);
                    if ($window === null) {
                        $fail('Enter a valid opening and closing time.');
                    }
                },
            ],
            'weekends_available' => 'nullable|boolean',
            'slot_duration_minutes' => 'nullable|integer|min:15|max:480',
            'icon_key' => 'nullable|string|in:'.implode(',', self::ICON_KEYS),
            'custom_category' => 'nullable|string|min:2|max:25',
            'shared_billing_enabled' => 'nullable|boolean',
            'shared_billing_type' => 'nullable|string|in:'.self::SHARED_BILLING_TYPE_ALL_RESIDENTS,
            'shared_billing_frequency' => 'nullable|string|in:'.self::SHARED_BILLING_FREQUENCY_MONTHLY.','.self::SHARED_BILLING_FREQUENCY_YEARLY,
            'shared_billing_amount' => 'nullable|numeric|min:0.01|max:999999.99',
            'shared_billing_due_day' => 'nullable|integer|min:1|max:31',
            'booking_fee' => 'nullable|numeric|min:0|max:999999.99',
        ];

        if ($creating && $request->input('status') === 'bookable') {
            $rules['slot_duration_minutes'] = 'required|integer|min:15|max:480';
        }

        if ($request->boolean('shared_billing_enabled')) {
            $rules['shared_billing_amount'] = 'required|numeric|min:0.01|max:999999.99';
            $rules['shared_billing_due_day'] = 'required|integer|min:1|max:31';
        }

        if (($request->input('icon_key') ?? '') === 'other') {
            $rules['custom_category'] = ($creating ? 'required' : 'sometimes').'|string|min:2|max:25';
        }

        return $request->validate($rules, [
            'capacity.min' => 'Capacity must be at least 1.',
            'description.required' => 'Description must be at least 10 characters.',
            'description.min' => 'Description must be at least 10 characters.',
            'description.max' => 'Description must be 500 characters or fewer.',
            'name.required' => 'Amenity Name must contain at least 2 characters.',
            'name.min' => 'Amenity Name must contain at least 2 characters.',
            'name.max' => 'Amenity Name must not exceed 100 characters.',
            'floor.min' => 'Use at least 2 characters.',
            'floor.max' => 'Keep the location to 25 characters.',
            'custom_category.min' => 'Use at least 2 characters.',
            'custom_category.max' => 'Keep the category to 25 characters.',
        ]);
    }

    private function amenityNameIsValid(string $value): bool
    {
        if (! preg_match("/^[\\p{L}\\p{N} &'’\\-]+$/u", $value)) {
            return false;
        }
        if (! preg_match('/^[\p{L}\p{N}]/u', $value) || ! preg_match('/[\p{L}\p{N}]$/u', $value)) {
            return false;
        }
        if (preg_match("/[-&'’]{2,}/u", $value)) {
            return false;
        }

        return true;
    }

    private function amenityLocationIsValid(string $value): bool
    {
        if (! preg_match('~^[\p{L}\p{N} \-/,.#]+$~u', $value)) {
            return false;
        }
        if (! preg_match('~[\p{L}\p{N}]~u', $value)) {
            return false;
        }
        if (preg_match('~^[,.\-/]~u', $value)) {
            return false;
        }
        if (preg_match('~[,#\-/]$~u', $value)) {
            return false;
        }
        if (preg_match('~[-/,.#]{2,}~u', $value)) {
            return false;
        }

        return true;
    }

    private function closingDateIsNextDay(mixed $opening, mixed $closing): bool
    {
        if (! is_string($opening) || ! is_string($closing) || $opening === '' || $closing === '') {
            return false;
        }

        try {
            $open = \Carbon\Carbon::createFromFormat('!Y-m-d', $opening);
            $close = \Carbon\Carbon::createFromFormat('!Y-m-d', $closing);
        } catch (\Throwable) {
            return false;
        }

        if (! $open instanceof \Carbon\Carbon || ! $close instanceof \Carbon\Carbon) {
            return false;
        }

        return $open->startOfDay()->copy()->addDay()->equalTo($close->startOfDay());
    }

    private function hoursLabel(array $data, ?string $start, ?string $end): ?string
    {
        if (! empty($data['open_24_hours'])) {
            return 'Open 24 Hours';
        }

        if (
            ! empty($data['closes_next_day'])
            && $this->closingDateIsNextDay($data['opening_date'] ?? null, $data['closing_date'] ?? null)
            && is_string($start)
            && is_string($end)
            && substr($end, 0, 5) <= substr($start, 0, 5)
            && is_string($data['hours'] ?? null)
            && $data['hours'] !== ''
        ) {
            return $data['hours'];
        }

        return AmenitySlots::formatHoursDisplay(
            $start ? $start.':00' : null,
            $end ? $end.':00' : null,
            $data['hours'] ?? null,
        );
    }

    private function buildAmenityRow(array $data, int $communityId, int $userId, bool $isAdmin): array
    {
        $start = $data['start_time'] ?? null;
        $end = $data['end_time'] ?? null;
        $hours = $this->hoursLabel($data, is_string($start) ? $start : null, is_string($end) ? $end : null);

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
            'capacity' => array_key_exists('capacity', $data) && $data['capacity'] !== null
                ? (int) $data['capacity']
                : 0,
            'capacity_booking_type' => app(AmenityCapacityService::class)->normalizeType($data['capacity_booking_type'] ?? null),
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
            'custom_category' => ($data['icon_key'] ?? null) === 'other'
                ? (trim((string) ($data['custom_category'] ?? '')) ?: null)
                : null,
            ...$this->normalizedSharedBilling($data),
            'booking_fee' => $this->normalizedBookingFee($data),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function mapAmenityUpdatePayload(array $data): array
    {
        $payload = [];
        foreach (['name', 'name_es', 'name_ar', 'description', 'description_es', 'description_ar', 'status', 'capacity', 'floor', 'icon_key', 'weekends_available', 'slot_duration_minutes'] as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = $field === 'capacity' && $data[$field] === null ? 0 : $data[$field];
            }
        }

        if (array_key_exists('capacity_booking_type', $data)) {
            $payload['capacity_booking_type'] = app(AmenityCapacityService::class)->normalizeType($data['capacity_booking_type']);
        }

        if (array_key_exists('icon_key', $data) || array_key_exists('custom_category', $data)) {
            $iconKey = $data['icon_key'] ?? null;
            $payload['custom_category'] = $iconKey === 'other'
                ? (trim((string) ($data['custom_category'] ?? '')) ?: null)
                : null;
        }

        if (array_key_exists('start_time', $data)) {
            $payload['start_time'] = $data['start_time'] ? $data['start_time'].':00' : null;
        }
        if (array_key_exists('end_time', $data)) {
            $payload['end_time'] = $data['end_time'] ? $data['end_time'].':00' : null;
        }

        if (isset($payload['start_time']) || isset($payload['end_time']) || array_key_exists('hours', $data)) {
            $payload['hours'] = $this->hoursLabel(
                $data,
                isset($payload['start_time']) ? substr((string) $payload['start_time'], 0, 5) : null,
                isset($payload['end_time']) ? substr((string) $payload['end_time'], 0, 5) : null,
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

        if (array_key_exists('shared_billing_enabled', $data)) {
            $payload = array_merge($payload, $this->normalizedSharedBilling($data));
        }

        if (array_key_exists('booking_fee', $data)) {
            $payload['booking_fee'] = $this->normalizedBookingFee($data);
        }

        return $payload;
    }

    /** @param  array<string, mixed>  $data */
    private function normalizedSharedBilling(array $data): array
    {
        if (! ($data['shared_billing_enabled'] ?? false)) {
            return [
                'shared_billing_enabled' => false,
                'shared_billing_type' => null,
                'shared_billing_frequency' => null,
                'shared_billing_amount' => null,
                'shared_billing_due_day' => null,
            ];
        }

        return [
            'shared_billing_enabled' => true,
            'shared_billing_type' => $data['shared_billing_type'] ?? self::SHARED_BILLING_TYPE_ALL_RESIDENTS,
            'shared_billing_frequency' => $data['shared_billing_frequency'] ?? self::SHARED_BILLING_FREQUENCY_MONTHLY,
            'shared_billing_amount' => $data['shared_billing_amount'],
            'shared_billing_due_day' => (int) $data['shared_billing_due_day'],
        ];
    }

    private function communityNameFor(int $communityId): ?string
    {
        if ($communityId < 1) {
            return null;
        }

        $name = DB::table('communities')->where('id', $communityId)->value('name');

        return is_string($name) && $name !== '' ? $name : null;
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
            'rejection_reason' => $row->rejection_reason ?? null,
            'capacity' => (int) ($row->capacity ?? 0),
            'capacity_booking_type' => app(AmenityCapacityService::class)->typeFor($row),
            'floor' => $row->floor,
            'hours' => AmenitySlots::formatHoursDisplay($start, $end, $row->hours ?? null),
            'start_time' => $start ? substr((string) $start, 0, 5) : null,
            'end_time' => $end ? substr((string) $end, 0, 5) : null,
            'hours_overnight' => AmenitySlots::isOvernight($start, $end),
            'weekends_available' => (bool) ($row->weekends_available ?? true),
            'slot_duration_minutes' => $duration !== null ? (int) $duration : null,
            'slots' => $row->status === 'bookable'
                ? AmenitySlots::generate($start, $end, $duration !== null ? (int) $duration : null, $row->hours ?? null)
                : [],
            'image_url' => MediaUrl::toPublic($row->image_url ?? null, request()),
            'icon_key' => $row->icon_key ?? null,
            'custom_category' => $row->custom_category ?? null,
            'community_name' => $row->community_name ?? $this->communityNameFor((int) $row->community_id),
            'shared_billing_enabled' => (bool) ($row->shared_billing_enabled ?? false),
            'shared_billing_type' => $row->shared_billing_type ?? null,
            'shared_billing_frequency' => $row->shared_billing_frequency ?? null,
            'shared_billing_amount' => $row->shared_billing_amount !== null ? (float) $row->shared_billing_amount : null,
            'shared_billing_due_day' => $row->shared_billing_due_day !== null ? (int) $row->shared_billing_due_day : null,
            'booking_fee' => $this->amenityBookingFee($row),
            'display_fee' => ($row->shared_billing_enabled ?? false)
                ? (float) ($row->shared_billing_amount ?? 0)
                : $this->amenityBookingFee($row),
            'display_fee_kind' => ($row->shared_billing_enabled ?? false)
                ? (($row->shared_billing_frequency ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly')
                : ($this->amenityBookingFee($row) > 0 ? 'booking' : 'free'),
            'has_overdue_shared_amenity_bill' => false,
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
            ->get(['id', 'amenity_id', 'date', 'time_slot', 'status', 'guests', 'payment_verification_status', 'payment_method'])
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
        $amenity['user_next_booking_can_cancel'] = $booking
            ? app(AmenityCapacityService::class)->canCancel($booking)
            : false;
        $amenity['user_next_booking_bill'] = null;

        return $amenity;
    }

    /** @param  \Illuminate\Support\Collection<int, array<string, mixed>>  $amenities */
    private function withBookingBills($amenities, Request $request)
    {
        $bills = app(AmenitySharedBillService::class)->residentBillsByBookingIds(
            $amenities->pluck('user_next_booking_id')->filter()->map(fn ($id) => (int) $id)->all(),
            $request,
        );

        return $amenities->map(function (array $amenity) use ($bills) {
            $bookingId = (int) ($amenity['user_next_booking_id'] ?? 0);
            $amenity['user_next_booking_bill'] = $bookingId > 0 ? ($bills[$bookingId] ?? null) : null;

            return $amenity;
        });
    }

    /** Community admin inbox must use managed-community scope, not the latest resident membership. */
    private function resolveInboxCommunityId(Request $request, $user): int
    {
        if (AdminRoleService::isSystemAdmin($user) || AdminRoleService::isActiveCommunityAdmin($user)) {
            $scope = AdminRoleService::resolveAdminCommunityScope($user, $request);
            if ($scope) {
                return (int) $scope;
            }
        }

        return $this->resolveResidentCommunityId($request, $user);
    }

    private function formatInboxBooking(object $row): array
    {
        return [
            ...$this->formatBookingCore($row),
            'community_id' => isset($row->community_id) ? (int) $row->community_id : null,
            'amenity_icon_key' => $row->amenity_icon_key ?? null,
            'amenity_created_by' => $row->amenity_created_by !== null ? (int) $row->amenity_created_by : null,
            'amenity_status' => $row->amenity_status ?? null,
            'amenity_description' => $row->amenity_description ?? null,
            'amenity_description_es' => $row->amenity_description_es ?? null,
            'amenity_description_ar' => $row->amenity_description_ar ?? null,
            'amenity_capacity' => $row->amenity_capacity !== null ? (int) $row->amenity_capacity : null,
            'amenity_floor' => $row->amenity_floor ?? null,
            'amenity_hours' => $row->amenity_hours ?? null,
            'user_id' => isset($row->user_id) ? (int) $row->user_id : null,
            'user_name' => $row->user_name ?? null,
            'user_unit' => $row->user_unit ?? null,
        ];
    }

    private function formatResidentBooking(object $row): array
    {
        return [
            ...$this->formatBookingCore($row),
            'amenity_image' => MediaUrl::toPublic($row->amenity_image ?? null, request()),
            'amenity_icon_key' => $row->amenity_icon_key ?? null,
            'amenity_status' => $row->amenity_status ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function formatBookingCore(object $row): array
    {
        $shared = (bool) ($row->amenity_shared_billing_enabled ?? false);
        $sharedAmount = (float) ($row->amenity_shared_billing_amount ?? 0);
        $bookingFee = (float) ($row->booking_fee ?? 0);

        return [
            'id' => (int) $row->id,
            'amenity_id' => (int) $row->amenity_id,
            'date' => $row->date,
            'time_slot' => $row->time_slot,
            'guests' => (int) ($row->guests ?? 1),
            'booking_fee' => $bookingFee,
            'display_fee' => $shared ? $sharedAmount : $bookingFee,
            'display_fee_kind' => $shared
                ? (($row->amenity_shared_billing_frequency ?? 'monthly') === 'yearly' ? 'yearly' : 'monthly')
                : ($bookingFee > 0 ? 'booking' : 'free'),
            'status' => $row->status,
            'payment_verification_status' => $row->payment_verification_status ?? self::PAYMENT_NOT_REQUIRED,
            'payment_method' => $row->payment_method ?? null,
            'ach_status' => $row->ach_status ?? null,
            'bank_payment' => $this->formatBookingBankPayment($row),
            'notes' => $row->notes,
            'rejection_reason' => $row->rejection_reason ?? null,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
            'requested_at' => $row->created_at,
            'amenity_name' => $row->amenity_name ?? null,
            'amenity_name_es' => $row->amenity_name_es ?? null,
            'amenity_name_ar' => $row->amenity_name_ar ?? null,
            'payment_proof' => $this->formatBookingPaymentProof($row),
            'slot_allocations' => app(AmenityCapacityService::class)->allocationsForBooking((int) $row->id),
            'can_cancel' => app(AmenityCapacityService::class)->canCancel($row),
        ];
    }

    /** @return array<string, mixed>|null */
    private function formatBookingPaymentProof(object $row): ?array
    {
        if (empty($row->proof_file_path) && empty($row->payment_date) && empty($row->proof_submitted_at)) {
            return null;
        }

        $size = $row->proof_file_size !== null ? (int) $row->proof_file_size : null;

        return [
            'file_url' => MediaUrl::toPublic($row->proof_file_path ?? null, request()),
            'file_name' => $row->proof_file_name ?? null,
            'file_size' => $size,
            'file_size_label' => $size !== null ? $this->formatProofBytes($size) : null,
            'mime_type' => $row->proof_mime_type ?? null,
            'payment_date' => $row->payment_date ?? null,
            'payment_reference' => $row->payment_reference ?? null,
            'payment_note' => $row->payment_note ?? null,
            'submitted_at' => $row->proof_submitted_at ?? null,
        ];
    }

    private function formatBookingBankPayment(object $row): ?array
    {
        if (($row->payment_method ?? null) !== 'bank_ach' && empty($row->plaid_transfer_id)) {
            return null;
        }

        $transfer = null;
        if (! empty($row->plaid_transfer_id)) {
            $transfer = PlaidTransfer::query()->find($row->plaid_transfer_id);
        }

        return $transfer?->toPublicPayload() ?? [
            'status' => $row->ach_status ?? 'processing',
            'status_label' => ucfirst(str_replace('_', ' ', (string) ($row->ach_status ?? 'processing'))),
        ];
    }

    private function refundBookingAchIfNeeded(object $booking, $actor): void
    {
        if (($booking->payment_method ?? null) !== 'bank_ach' || empty($booking->plaid_transfer_id) || ! $actor) {
            return;
        }

        $transfer = PlaidTransfer::query()->find($booking->plaid_transfer_id);
        if (! $transfer || ! $transfer->canRefund()) {
            return;
        }

        try {
            app(PlaidAchService::class)->refund($transfer, $actor);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function amenityBookingFee(object $amenity): float
    {
        $fee = (float) ($amenity->booking_fee ?? 0);

        return $fee > 0 ? round($fee, 2) : 0.0;
    }

    private function remainingCapacity(int $capacity, int $used): ?int
    {
        if ($capacity <= 0) {
            return null;
        }

        return max(0, $capacity - $used);
    }

    /** @param  array<string, mixed>  $slot */
    private function slotOccupancyPayload(array $slot, int $capacity, int $booked): array
    {
        $remaining = $this->remainingCapacity($capacity, $booked);

        return [
            ...$slot,
            'capacity' => $capacity,
            'booked' => $booked,
            'remaining' => $remaining,
            'available' => $remaining === null || $remaining > 0,
        ];
    }

    /** @param  array<string, mixed>  $data */
    private function normalizedBookingFee(array $data): float
    {
        if (! array_key_exists('booking_fee', $data) || $data['booking_fee'] === null || $data['booking_fee'] === '') {
            return 0.0;
        }

        return max(0, round((float) $data['booking_fee'], 2));
    }

    /** @return array{file_path: string, file_name: string, file_size: int, mime_type: ?string} */
    private function storeBookingProofFile(UploadedFile $file, int $communityId, int $amenityId, int $bookingId): array
    {
        $path = $file->store("amenity-booking-proofs/{$communityId}/{$amenityId}/{$bookingId}", 'public');
        $relative = '/storage/'.ltrim(str_replace('\\', '/', $path), '/');

        return [
            'file_path' => MediaUrl::normalize($relative) ?? $relative,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => (int) $file->getSize(),
            'mime_type' => $file->getClientMimeType(),
        ];
    }

    private function formatProofBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes.' B';
        }
        if ($bytes < 1048576) {
            return round($bytes / 1024, 1).' KB';
        }

        return round($bytes / 1048576, 1).' MB';
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
