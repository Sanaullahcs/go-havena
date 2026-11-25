<?php

namespace App\Services;

use App\Support\AmenitySlots;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;

class AmenityCapacityService
{
    public const TYPE_PER_SEAT = 'per_seat';

    public const TYPE_FULL_SLOT = 'full_slot';

    public function normalizeType(mixed $value): string
    {
        return (string) $value === self::TYPE_FULL_SLOT
            ? self::TYPE_FULL_SLOT
            : self::TYPE_PER_SEAT;
    }

    public function typeFor(object $amenity): string
    {
        return $this->normalizeType($amenity->capacity_booking_type ?? null);
    }

    public function isFullSlot(object $amenity): bool
    {
        return $this->typeFor($amenity) === self::TYPE_FULL_SLOT;
    }

    /** @return Collection<int, object> */
    public function occupyingBookings(int $amenityId, string $date): Collection
    {
        return DB::table('bookings')
            ->where('amenity_id', $amenityId)
            ->where('date', $date)
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->get(['id', 'time_slot', 'guests']);
    }

    public function totalGuests(Collection $rows): int
    {
        return (int) $rows->sum(static fn ($row) => max(1, (int) ($row->guests ?? 1)));
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     * @return array<string, int>
     */
    public function usedSeatsBySlot(object $amenity, Collection $occupying, array $slots): array
    {
        $used = [];
        foreach ($slots as $slot) {
            $used[AmenitySlots::normalizeSlotLabel((string) ($slot['value'] ?? ''))] = 0;
        }

        $allocations = $this->allocationsForBookings($occupying->pluck('id')->map(fn ($id) => (int) $id)->all());
        $allocatedBookingIds = [];

        foreach ($allocations as $row) {
            $bookingId = (int) $row->booking_id;
            $allocatedBookingIds[$bookingId] = true;
            $norm = AmenitySlots::normalizeSlotLabel((string) ($row->time_slot ?? ''));
            if ($norm === '') {
                continue;
            }
            $used[$norm] = ($used[$norm] ?? 0) + max(1, (int) ($row->seats ?? 1));
        }

        $capacity = max(0, (int) ($amenity->capacity ?? 0));
        $fullSlot = $this->isFullSlot($amenity);

        foreach ($occupying as $booking) {
            $bookingId = (int) ($booking->id ?? 0);
            if ($bookingId > 0 && isset($allocatedBookingIds[$bookingId])) {
                continue;
            }

            $norm = AmenitySlots::normalizeSlotLabel((string) ($booking->time_slot ?? ''));
            if ($norm === '') {
                continue;
            }

            $seats = $fullSlot && $capacity > 0
                ? $capacity
                : max(1, (int) ($booking->guests ?? 1));
            $used[$norm] = ($used[$norm] ?? 0) + $seats;
        }

        if ($fullSlot && $capacity > 0) {
            foreach ($used as $norm => $seats) {
                if ($seats > 0) {
                    $used[$norm] = $capacity;
                }
            }
        }

        return $used;
    }

    public function remainingCapacity(int $capacity, int $used): ?int
    {
        if ($capacity <= 0) {
            return null;
        }

        return max(0, $capacity - $used);
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     * @param  array<string, int>  $usedBySlot
     */
    public function remainingFromIndex(array $slots, array $usedBySlot, int $fromIndex, int $capacity): ?int
    {
        if ($capacity <= 0) {
            return null;
        }

        $remaining = 0;
        for ($i = $fromIndex, $count = count($slots); $i < $count; $i++) {
            $norm = AmenitySlots::normalizeSlotLabel((string) ($slots[$i]['value'] ?? ''));
            $remaining += max(0, $capacity - (int) ($usedBySlot[$norm] ?? 0));
        }

        return $remaining;
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     * @return list<array{time_slot: string, seats: int}>
     */
    public function planAllocations(
        object $amenity,
        array $slots,
        string $normalizedSlot,
        int $requestedSeats,
        Collection $occupying,
    ): array {
        $capacity = max(0, (int) ($amenity->capacity ?? 0));
        $usedBySlot = $this->usedSeatsBySlot($amenity, $occupying, $slots);
        $startIndex = $this->slotIndex($slots, $normalizedSlot);

        if ($startIndex === null) {
            throw new InvalidArgumentException('Selected time slot is not available for this amenity.');
        }

        $startNorm = AmenitySlots::normalizeSlotLabel((string) ($slots[$startIndex]['value'] ?? $normalizedSlot));
        $usedHere = (int) ($usedBySlot[$startNorm] ?? 0);
        $remainingHere = $this->remainingCapacity($capacity, $usedHere);

        if ($remainingHere !== null && $remainingHere < 1) {
            throw new InvalidArgumentException('This time slot is fully booked.');
        }

        if ($this->isFullSlot($amenity)) {
            return [[
                'time_slot' => $startNorm !== '' ? $startNorm : $normalizedSlot,
                'seats' => $capacity > 0 ? $capacity : max(1, $requestedSeats),
            ]];
        }

        $need = max(1, $requestedSeats);
        if ($capacity <= 0) {
            return [[
                'time_slot' => $startNorm !== '' ? $startNorm : $normalizedSlot,
                'seats' => $need,
            ]];
        }

        $allocations = [];
        for ($i = $startIndex, $count = count($slots); $i < $count && $need > 0; $i++) {
            $norm = AmenitySlots::normalizeSlotLabel((string) ($slots[$i]['value'] ?? ''));
            $left = max(0, $capacity - (int) ($usedBySlot[$norm] ?? 0));
            if ($left < 1) {
                continue;
            }

            $take = min($need, $left);
            $allocations[] = [
                'time_slot' => $norm,
                'seats' => $take,
            ];
            $need -= $take;
        }

        if ($need > 0) {
            $available = (int) $this->remainingFromIndex($slots, $usedBySlot, $startIndex, $capacity);
            $spotWord = $available === 1 ? 'spot' : 'spots';
            throw new InvalidArgumentException("Only {$available} {$spotWord} left from this time slot onward.");
        }

        return $allocations;
    }

    /**
     * @param  list<array{time_slot: string, seats: int}>  $allocations
     */
    public function storeAllocations(int $bookingId, int $amenityId, string $date, array $allocations): void
    {
        if ($bookingId < 1 || $allocations === [] || ! Schema::hasTable('booking_slot_allocations')) {
            return;
        }

        $now = now();
        $rows = [];
        foreach ($allocations as $allocation) {
            $slot = AmenitySlots::normalizeSlotLabel((string) ($allocation['time_slot'] ?? ''));
            $seats = max(1, (int) ($allocation['seats'] ?? 1));
            if ($slot === '') {
                continue;
            }
            $rows[] = [
                'booking_id' => $bookingId,
                'amenity_id' => $amenityId,
                'date' => $date,
                'time_slot' => $slot,
                'seats' => $seats,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            DB::table('booking_slot_allocations')->insert($rows);
        }
    }

    /** @return list<array{time_slot: string, seats: int}> */
    public function allocationsForBooking(int $bookingId): array
    {
        if ($bookingId < 1 || ! Schema::hasTable('booking_slot_allocations')) {
            return [];
        }

        return DB::table('booking_slot_allocations')
            ->where('booking_id', $bookingId)
            ->orderBy('id')
            ->get(['time_slot', 'seats'])
            ->map(fn ($row) => [
                'time_slot' => (string) $row->time_slot,
                'seats' => (int) $row->seats,
            ])
            ->values()
            ->all();
    }

    public function bookingFee(object $amenity, int $guests, bool $timedSlot = true): float
    {
        if ($amenity->shared_billing_enabled ?? false) {
            return 0.0;
        }

        $unit = (float) ($amenity->booking_fee ?? 0);
        if ($unit <= 0) {
            return 0.0;
        }

        if ($timedSlot && $this->isFullSlot($amenity)) {
            return round($unit, 2);
        }

        if (! $timedSlot) {
            return round($unit, 2);
        }

        return round($unit * max(1, $guests), 2);
    }

    public function storedGuestCount(object $amenity, int $requestedSeats, bool $timedSlot): int
    {
        if ($timedSlot && $this->isFullSlot($amenity)) {
            return 1;
        }

        return max(1, $requestedSeats);
    }

    public function paymentCompleted(object $booking): bool
    {
        $verification = (string) ($booking->payment_verification_status ?? 'not_required');
        if ($verification === 'accepted') {
            return true;
        }

        $bookingId = (int) ($booking->id ?? 0);
        if ($bookingId < 1 || ! Schema::hasTable('amenity_resident_bills') || ! Schema::hasTable('amenity_monthly_bills')) {
            return false;
        }

        if (! Schema::hasColumn('amenity_monthly_bills', 'booking_id')) {
            return false;
        }

        return DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->where('mb.booking_id', $bookingId)
            ->where('rb.status', AmenitySharedBillService::RESIDENT_STATUS_PAID)
            ->exists();
    }

    public function canCancel(object $booking): bool
    {
        if (! in_array((string) ($booking->status ?? ''), ['pending', 'awaiting_payment', 'confirmed'], true)) {
            return false;
        }

        // A bank charge taken at request time can still be refunded until the owner confirms.
        if ((string) ($booking->status ?? '') === 'pending'
            && (string) ($booking->payment_method ?? '') === 'bank_ach') {
            return true;
        }

        return ! $this->paymentCompleted($booking);
    }

    /**
     * @param  list<int>  $bookingIds
     * @return Collection<int, object>
     */
    private function allocationsForBookings(array $bookingIds): Collection
    {
        $ids = array_values(array_filter($bookingIds, static fn ($id) => $id > 0));
        if ($ids === [] || ! Schema::hasTable('booking_slot_allocations')) {
            return collect();
        }

        return DB::table('booking_slot_allocations')
            ->whereIn('booking_id', $ids)
            ->get(['booking_id', 'time_slot', 'seats']);
    }

    /** @param  list<array<string, mixed>>  $slots */
    private function slotIndex(array $slots, string $normalizedSlot): ?int
    {
        foreach ($slots as $index => $slot) {
            if (AmenitySlots::slotLabelsMatch((string) ($slot['value'] ?? ''), $normalizedSlot)) {
                return (int) $index;
            }
        }

        return null;
    }
}
