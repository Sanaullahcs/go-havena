<?php

namespace App\Services\Payments;

use App\Models\PaymentAttempt;
use App\Models\UtilityBill;
use App\Services\AmenitySharedBillService;
use App\Services\Kuickpay\KuickpayException;
use App\Services\UnitAssignmentService;
use App\Services\UnitServiceBillService;
use App\Services\Utilities\UtilityBillService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PayableResolver
{
    public function resolve(string $type, int $id): ?Payable
    {
        return match ($type) {
            PaymentAttempt::PAYABLE_SERVICE_BILL => $this->serviceBill($id),
            PaymentAttempt::PAYABLE_AMENITY_BILL => $this->amenityBill($id),
            PaymentAttempt::PAYABLE_UTILITY_BILL => $this->utilityBill($id),
            default => null,
        };
    }

    /** Resolves a bill and enforces that this resident may pay it. Unknown and foreign bills look identical. */
    public function resolveForUser(string $type, int $id, int $userId): Payable
    {
        $payable = $this->resolve($type, $id);
        if (! $payable || ! $payable->canBePaidBy($userId)) {
            throw KuickpayException::notYourBill();
        }

        return $payable;
    }

    /** Applies a confirmed payment to the bill. Returns false when the bill was already settled. */
    public function markPaid(PaymentAttempt $attempt): bool
    {
        return match ($attempt->payable_type) {
            PaymentAttempt::PAYABLE_SERVICE_BILL => app(UnitServiceBillService::class)->applyOnlinePayment((int) $attempt->payable_id, $attempt),
            PaymentAttempt::PAYABLE_AMENITY_BILL => app(AmenitySharedBillService::class)->applyOnlinePayment((int) $attempt->payable_id, $attempt),
            PaymentAttempt::PAYABLE_UTILITY_BILL => app(UtilityBillService::class)->applyHavenaPayment((int) $attempt->payable_id, $attempt),
            default => false,
        };
    }

    private function serviceBill(int $id): ?Payable
    {
        $row = DB::table('unit_service_bills as usb')
            ->join('property_services as ps', 'ps.id', '=', 'usb.service_id')
            ->join('units', 'units.id', '=', 'usb.unit_id')
            ->leftJoin('users', 'users.id', '=', 'usb.billing_contact_user_id')
            ->where('usb.id', $id)
            ->select([
                'usb.*',
                'ps.name as service_name',
                'units.unit_number',
                'units.billing_contact_user_id as unit_contact_id',
                'users.name as contact_name',
                'users.phone as contact_phone',
                'users.email as contact_email',
            ])
            ->first();
        if (! $row) {
            return null;
        }

        $status = (string) $row->status;
        $needsAck = (bool) $row->require_acknowledgement
            && empty($row->acknowledged_at)
            && in_array($status, [UnitServiceBillService::STATUS_UNPAID, UnitServiceBillService::STATUS_OVERDUE, UnitServiceBillService::STATUS_REJECTED], true);

        $state = match (true) {
            $status === UnitServiceBillService::STATUS_PAID => Payable::STATE_PAID,
            $status === UnitServiceBillService::STATUS_PENDING => Payable::STATE_UNDER_REVIEW,
            $needsAck => Payable::STATE_NEEDS_ACKNOWLEDGEMENT,
            in_array($status, [
                UnitServiceBillService::STATUS_UNPAID,
                UnitServiceBillService::STATUS_ACKNOWLEDGED,
                UnitServiceBillService::STATUS_REJECTED,
                UnitServiceBillService::STATUS_OVERDUE,
            ], true) => Payable::STATE_PAYABLE,
            default => Payable::STATE_INACTIVE,
        };

        $contactId = (int) ($row->billing_contact_user_id ?: 0);
        if ($contactId > 0 && app(\App\Services\Landlord\LandlordAccessService::class)->rentedOwnerCannotPay($contactId, (int) $row->unit_id)) {
            $contactId = 0;
        }

        return new Payable(
            PaymentAttempt::PAYABLE_SERVICE_BILL,
            (int) $row->id,
            (int) $row->community_id,
            (int) $row->unit_id,
            $contactId > 0 ? [$contactId] : [],
            (string) $row->title,
            trim(($row->service_name ?? 'Service').' · Unit '.($row->unit_number ?? '')),
            (int) round(((float) $row->amount) * 100),
            $state,
            $row->due_date ? substr((string) $row->due_date, 0, 10) : null,
            substr((string) $row->billing_period, 0, 7),
            $row->contact_name ?? null,
            $row->contact_phone ?? null,
            $row->contact_email ?? null,
        );
    }

    private function amenityBill(int $id): ?Payable
    {
        $row = DB::table('amenity_resident_bills as rb')
            ->join('amenity_monthly_bills as mb', 'mb.id', '=', 'rb.monthly_bill_id')
            ->join('amenities as a', 'a.id', '=', 'rb.amenity_id')
            ->leftJoin('users', 'users.id', '=', 'rb.user_id')
            ->where('rb.id', $id)
            ->select([
                'rb.*',
                'mb.title',
                'mb.due_date',
                'mb.billing_month',
                'mb.amount_per_resident',
                'mb.status as monthly_status',
                'a.name as amenity_name',
                'users.name as resident_name',
                'users.phone as resident_phone',
                'users.email as resident_email',
            ])
            ->first();
        if (! $row) {
            return null;
        }

        $status = (string) ($row->status ?? AmenitySharedBillService::RESIDENT_STATUS_UNPAID);
        $state = match (true) {
            $status === AmenitySharedBillService::RESIDENT_STATUS_PAID => Payable::STATE_PAID,
            $status === AmenitySharedBillService::RESIDENT_STATUS_PENDING => Payable::STATE_UNDER_REVIEW,
            ($row->monthly_status ?? AmenitySharedBillService::STATUS_PUBLISHED) !== AmenitySharedBillService::STATUS_PUBLISHED => Payable::STATE_INACTIVE,
            in_array($status, [
                AmenitySharedBillService::RESIDENT_STATUS_UNPAID,
                AmenitySharedBillService::RESIDENT_STATUS_REJECTED,
                AmenitySharedBillService::RESIDENT_STATUS_OVERDUE,
            ], true) => Payable::STATE_PAYABLE,
            default => Payable::STATE_INACTIVE,
        };

        $amount = (float) ($row->amount ?? $row->amount_per_resident ?? 0);
        $unitId = app(UnitAssignmentService::class)->findActiveUnitForUser((int) $row->user_id, (int) $row->community_id)?->id;

        return new Payable(
            PaymentAttempt::PAYABLE_AMENITY_BILL,
            (int) $row->id,
            (int) $row->community_id,
            $unitId ? (int) $unitId : null,
            [(int) $row->user_id],
            (string) $row->title,
            (string) ($row->amenity_name ?? 'Amenity'),
            (int) round($amount * 100),
            $state,
            $row->due_date ? substr((string) $row->due_date, 0, 10) : null,
            $row->billing_month ? substr((string) $row->billing_month, 0, 7) : null,
            $row->resident_name ?? null,
            $row->resident_phone ?? null,
            $row->resident_email ?? null,
        );
    }

    private function utilityBill(int $id): ?Payable
    {
        $bill = UtilityBill::query()->with('account.biller')->find($id);
        $account = $bill?->account;
        if (! $bill || ! $account) {
            return null;
        }

        $state = match (true) {
            $bill->isPaid() => Payable::STATE_PAID,
            $bill->status === UtilityBill::STATUS_BLOCKED => Payable::STATE_BLOCKED,
            ! $account->isActive() => Payable::STATE_INACTIVE,
            default => Payable::STATE_PAYABLE,
        };

        $payers = DB::table('unit_residents')
            ->where('unit_id', $bill->unit_id)
            ->where('status', UnitAssignmentService::RESIDENT_ACTIVE)
            ->pluck('user_id')
            ->map(fn ($uid) => (int) $uid)
            ->all();

        $month = Carbon::createFromFormat('Y-m', $bill->billing_month)->format('F Y');
        $biller = $account->biller;

        return new Payable(
            PaymentAttempt::PAYABLE_UTILITY_BILL,
            (int) $bill->id,
            (int) $bill->community_id,
            (int) $bill->unit_id,
            $payers,
            trim(($biller?->short_name ?? 'Utility').' bill · '.$month),
            ucfirst((string) $account->service_type).' · '.$account->maskedReference(),
            $bill->payablePaisa(),
            $state,
            $bill->due_date?->toDateString(),
            $bill->billing_month,
            $bill->consumer_name,
            null,
            null,
            $bill->amount_after_due_paisa,
        );
    }
}
