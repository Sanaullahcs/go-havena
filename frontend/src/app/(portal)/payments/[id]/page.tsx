"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Check, Clock, Copy, Loader2, X } from "lucide-react";
import { apiError } from "@/lib/api/client";
import { cancelKuickpayPayment, fetchKuickpayPayment, type PaymentDetail } from "@/lib/api/kuickpay";
import { toastError } from "@/lib/alert";

const TONE = {
  success: { ring: "bg-emerald-50 border-emerald-200 text-emerald-700", Icon: Check },
  pending: { ring: "bg-amber-50 border-amber-200 text-amber-700", Icon: Clock },
  danger: { ring: "bg-rose-50 border-rose-200 text-rose-700", Icon: X },
  muted: { ring: "bg-slate-100 border-slate-200 text-slate-600", Icon: AlertCircle },
} as const;

function when(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Row({ label, value, copy }: { label: string; value?: string | null; copy?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2 text-right font-semibold text-slate-900">
        {value}
        {copy ? (
          <button type="button" onClick={() => void navigator.clipboard?.writeText(value)} className="text-[#1B4F8A]" aria-label={`Copy ${label}`}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** KuickPay return page for web payments. Reads the outcome from the server, never the URL. */
export default function PaymentResultPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const started = useRef(Date.now());

  const load = useCallback(async (sync: boolean) => {
    try {
      const next = await fetchKuickpayPayment(id, sync);
      setPayment(next);
      setError(null);
      return next;
    } catch (err) {
      setError(apiError(err));
      return null;
    }
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async (sync: boolean) => {
      const next = await load(sync);
      if (!alive || (next && next.is_final)) return;
      const delay = Date.now() - started.current < 90_000 ? 2000 : 8000;
      timer = setTimeout(() => void tick(true), delay);
    };
    void tick(true);
    return () => { alive = false; clearTimeout(timer); };
  }, [load]);

  async function cancel() {
    if (!window.confirm("Only cancel if you have not paid on the KuickPay page. Your bill will stay unpaid.")) return;
    setCancelling(true);
    try {
      setPayment(await cancelKuickpayPayment(id));
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setCancelling(false);
    }
  }

  if (!payment) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
        {error ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin text-[#EF4B23]" />}
        <p>{error ?? "Confirming your payment with KuickPay…"}</p>
      </div>
    );
  }

  const tone = TONE[payment.tone] ?? TONE.pending;
  const spinning = payment.status === "processing" || payment.status === "awaiting_payment";

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 py-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-[6px] ${tone.ring}`}>
          {spinning ? <Loader2 className="h-8 w-8 animate-spin" /> : <tone.Icon className="h-8 w-8" />}
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{payment.status_label}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{payment.message}</p>
        <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">{payment.formatted_amount}</p>
        <p className="mt-1 text-sm text-slate-500">{payment.title}</p>
        {payment.test_mode ? (
          <span className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Test mode</span>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <p className="flex items-center gap-2 border-b border-dashed border-slate-300 pb-3 pt-1 text-sm font-semibold text-slate-900">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#EF4B23] text-xs font-extrabold text-white">K</span>
          {payment.receipt ? "Receipt" : "Payment details"}
        </p>
        <div className="divide-y divide-slate-100">
          <Row label="Paid to" value={payment.receipt?.paid_to} />
          <Row label="Bill" value={payment.subtitle || payment.title} />
          <Row label="Method" value={payment.receipt?.method_label || payment.method_label || "KuickPay"} />
          <Row label="Reference" value={payment.reference} copy />
          <Row label="KuickPay transaction" value={payment.receipt?.transaction_id} copy />
          <Row label="Paid on" value={when(payment.receipt?.paid_at)} />
        </div>
      </section>

      {payment.status === "processing" ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your bank or wallet may already have deducted this amount. Please don&apos;t pay again — this page updates automatically.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {payment.status === "awaiting_payment" && payment.resume_url ? (
          <a href={payment.resume_url} className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-[#EF4B23] text-sm font-bold text-white">
            Continue payment
          </a>
        ) : null}
        {payment.can_cancel ? (
          <button type="button" onClick={() => void cancel()} disabled={cancelling} className="flex h-11 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700">
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel payment"}
          </button>
        ) : null}
        <Link href="/property" className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-[#1B4F8A] text-sm font-bold text-white">
          Back to bills
        </Link>
      </div>
    </div>
  );
}
