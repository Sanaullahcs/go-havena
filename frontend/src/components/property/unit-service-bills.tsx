"use client";

import { useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { formatCommunityMoney } from "@/lib/money";
import {
  acknowledgeServiceBill,
  fetchResidentPropertyServices,
  fetchResidentServiceBills,
  serviceCategoryLabel,
  submitServiceBillProof,
  subscribeToPropertyService,
  unsubscribeFromPropertyService,
  type PropertyService,
  type UnitServiceBill,
} from "@/lib/api/property-services";
import { AmenityPaymentProofModal } from "@/components/property/amenity-payment-proof-modal";
import { KuickpayPayButton } from "@/components/payments/kuickpay-pay-button";
import { PAY_NOW_ENABLED } from "@/lib/payments-visibility";

export function UnitServiceWorkspace() {
  const [bills, setBills] = useState<UnitServiceBill[]>([]);
  const [services, setServices] = useState<PropertyService[]>([]);
  const [isContact, setIsContact] = useState(false);
  const [proofFor, setProofFor] = useState<UnitServiceBill | null>(null);

  async function load() {
    const [billRows, catalog] = await Promise.all([
      fetchResidentServiceBills(),
      fetchResidentPropertyServices(),
    ]);
    setBills(billRows);
    setServices(catalog.services.filter((service) => service.application_type === "optional"));
    setIsContact(Boolean(catalog.unit?.is_billing_contact));
  }

  useEffect(() => {
    void load().catch((err) => toastError(apiError(err)));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-bold text-slate-900">My unit bills</h3>
        <p className="mt-1 text-sm text-slate-500">
          {isContact ? "You are the billing contact for this unit." : "Only the unit billing contact can view and pay these bills."}
        </p>
        <div className="mt-4 space-y-3">
          {isContact && bills.length === 0 && <p className="text-sm text-slate-500">No unit service bills yet.</p>}
          {isContact && bills.map((bill) => (
            <article key={bill.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{bill.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatCommunityMoney(bill.amount)}
                    {bill.billing_frequency === "yearly"
                      ? " · per year"
                      : bill.billing_frequency === "one_time"
                        ? " · one-time"
                        : bill.billing_frequency === "monthly"
                          ? " · per month"
                          : ""}
                    {" · due "}{bill.due_date} · {bill.status_label}
                  </p>
                </div>
              </div>
              {bill.can_acknowledge && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-emerald-700"
                  onClick={async () => {
                    try {
                      await acknowledgeServiceBill(bill.id);
                      toastSuccess("Bill acknowledged.");
                      await load();
                    } catch (err) {
                      toastError(apiError(err));
                    }
                  }}
                >
                  First acknowledge, then pay the bill
                </button>
              )}
              {bill.can_submit_proof && bill.online_payment?.available ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <KuickpayPayButton
                    payableType="unit_service_bill"
                    payableId={bill.id}
                    title={bill.title}
                    subtitle={[bill.service_name, bill.unit_number ? `Unit ${bill.unit_number}` : null].filter(Boolean).join(" · ")}
                    amount={Number(bill.amount)}
                    dueDate={bill.due_date}
                    onlinePayment={bill.online_payment}
                    onSettled={() => void load()}
                  />
                  {bill.online_payment.active_payment?.status !== "processing" ? (
                    <button type="button" className="text-xs font-semibold text-slate-500" onClick={() => setProofFor(bill)}>
                      Upload proof instead
                    </button>
                  ) : null}
                </div>
              ) : bill.can_submit_proof && PAY_NOW_ENABLED ? (
                <button type="button" className="mt-2 ml-3 text-xs font-semibold text-slate-800" onClick={() => setProofFor(bill)}>
                  Pay now
                </button>
              ) : null}
              {bill.status === "paid" && bill.payment_method === "kuickpay" ? (
                <p className="mt-1 text-xs font-medium text-emerald-700">Paid online with KuickPay</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-bold text-slate-900">Available services</h3>
        <div className="mt-4 space-y-3">
          {services.length === 0 && <p className="text-sm text-slate-500">No optional services are published yet.</p>}
          {services.map((service) => (
            <article key={service.id} className="rounded-xl border border-slate-100 p-3">
              <p className="font-semibold text-slate-900">{service.name}</p>
              <p className="text-xs text-slate-500">
                {serviceCategoryLabel(service.category, service.custom_category)}
                {service.amount != null ? ` · ${formatCommunityMoney(service.amount)}` : ""}
                {service.billing_frequency ? ` · ${service.billing_frequency.replace("_", " ")}` : ""}
              </p>
              {service.unit_subscription &&
              ["active", "pending"].includes(service.unit_subscription.status) ? (
                <p className="mt-1 text-xs text-slate-500">Status: {service.unit_subscription.status}</p>
              ) : null}
              {!isContact && <p className="mt-2 text-xs text-amber-700">Ask your unit billing contact to subscribe.</p>}
              {isContact && service.can_subscribe && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-emerald-700"
                  onClick={async () => {
                    try {
                      const result = await subscribeToPropertyService(service.id);
                      toastSuccess(result.message);
                      await load();
                    } catch (err) {
                      toastError(apiError(err));
                    }
                  }}
                >
                  Subscribe for my unit
                </button>
              )}
              {isContact && service.unit_subscription?.status === "active" && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-rose-700"
                  onClick={async () => {
                    try {
                      await unsubscribeFromPropertyService(service.id);
                      toastSuccess("Subscription cancellation saved.");
                      await load();
                    } catch (err) {
                      toastError(apiError(err));
                    }
                  }}
                >
                  Unsubscribe
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      {proofFor && (
        <AmenityPaymentProofModal
          amenityName={proofFor.service_name || proofFor.title}
          bill={{
            id: proofFor.id,
            amenity_id: proofFor.service_id,
            community_id: 0,
            billing_month: proofFor.billing_period,
            billing_month_label: proofFor.billing_period_label || proofFor.billing_period,
            title: proofFor.title,
            description: proofFor.description ?? null,
            amount_per_resident: proofFor.amount,
            due_date: proofFor.due_date,
            file_url: proofFor.invoice?.file_url ?? null,
            file_name: proofFor.invoice?.file_name ?? null,
          }}
          submitting={false}
          onClose={() => setProofFor(null)}
          onSubmit={async (payload) => {
            if (!payload.file) return;
            await submitServiceBillProof(proofFor.id, {
              file: payload.file,
              payment_date: payload.payment_date,
              payment_reference: payload.payment_reference,
              payment_bank: payload.payment_bank,
              payment_note: payload.payment_note,
            });
            toastSuccess("Payment proof submitted.");
            setProofFor(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
