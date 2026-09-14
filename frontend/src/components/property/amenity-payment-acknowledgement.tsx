"use client";

import { formatBillAmount, formatBillDate } from "@/lib/admin/amenity-bill-validation";
import type { AmenityPaymentAcknowledgement } from "@/lib/api/amenities";

export function AmenityPaymentAcknowledgementCard({
  acknowledgement,
}: {
  acknowledgement: AmenityPaymentAcknowledgement;
}) {
  return (
    <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        Payment acknowledgement
      </p>
      <p className="mt-1 text-[12px] font-medium text-emerald-800">{acknowledgement.message}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-emerald-900">
        <div>
          <dt className="font-semibold text-emerald-600">Amenity</dt>
          <dd>{acknowledgement.amenity_name}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-600">Billing month</dt>
          <dd>{acknowledgement.billing_month_label}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-600">Amount</dt>
          <dd>{formatBillAmount(acknowledgement.amount)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-600">Payment date</dt>
          <dd>{formatBillDate(acknowledgement.payment_date)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-600">Approved date</dt>
          <dd>{formatBillDate(acknowledgement.approved_at)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-600">Status</dt>
          <dd>{acknowledgement.status_label}</dd>
        </div>
        {acknowledgement.payment_reference ? (
          <div className="col-span-2">
            <dt className="font-semibold text-emerald-600">Payment / reference</dt>
            <dd>{acknowledgement.payment_reference}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="font-semibold text-emerald-600">Community acknowledgment</dt>
          <dd>{acknowledgement.acknowledged_by_label}</dd>
        </div>
      </dl>
    </div>
  );
}
