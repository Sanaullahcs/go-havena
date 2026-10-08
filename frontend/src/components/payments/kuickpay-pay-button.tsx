"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Check, Copy, Loader2, Lock, X } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { startKuickpayPayment, type OnlinePayment, type PayableType } from "@/lib/api/kuickpay";
import { formatMoney } from "@/lib/money";

const METHODS = [
  { id: "easypaisa", label: "Easypaisa", short: "ep", color: "#12B347" },
  { id: "jazzcash", label: "JazzCash", short: "JC", color: "#D71F26" },
  { id: "card", label: "Card", short: "▭", color: "#1E3A8A" },
  { id: "bank", label: "Bank", short: "⌂", color: "#0F766E" },
  { id: "raast", label: "Raast", short: "R", color: "#6D28D9" },
];

type Props = {
  payableType: PayableType;
  payableId: number;
  title: string;
  subtitle?: string | null;
  amount: number;
  dueDate?: string | null;
  onlinePayment?: OnlinePayment | null;
  onSettled?: () => void;
  className?: string;
};

/** Pay Now for Pakistan communities: confirm the amount, then hand off to KuickPay's hosted page. */
export function KuickpayPayButton({ payableType, payableId, title, subtitle, amount, dueDate, onlinePayment, onSettled, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState(amount);
  const [amountNotice, setAmountNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const active = onlinePayment?.active_payment ?? null;
  const processing = active?.status === "processing";

  if (!onlinePayment?.available) return null;

  if (processing && active) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/payments/${active.id}`)}
        className={className ?? "inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Payment processing — view
      </button>
    );
  }

  async function pay() {
    setBusy(true);
    try {
      const result = await startKuickpayPayment(payableType, payableId, Math.round(confirmAmount * 100));
      if (result.outcome === "already_paid") {
        toastSuccess(result.message || "This bill has already been paid.");
        setOpen(false);
        onSettled?.();
        return;
      }
      if (result.outcome === "processing" && result.payment) {
        router.push(`/payments/${result.payment.id}`);
        return;
      }
      if (result.next_action?.url) {
        window.location.assign(result.next_action.url);
        return;
      }
      toastError("We could not open KuickPay. You have not been charged.");
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.code === "amount_changed") {
        const next = Number(err.response.data?.meta?.amount ?? confirmAmount);
        setConfirmAmount(next);
        setAmountNotice(`The amount due changed to ${formatMoney(next, "PKR")}. Please review it before paying.`);
      } else {
        toastError(apiError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyVoucher() {
    if (!onlinePayment?.voucher) return;
    await navigator.clipboard?.writeText(onlinePayment.voucher.consumer_number).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setConfirmAmount(amount); setAmountNotice(null); setOpen(true); }}
        className={className ?? "inline-flex items-center gap-2 rounded-lg bg-[#EF4B23] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#C23812]"}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden />
        {active?.status === "awaiting_payment" ? "Continue payment" : "Pay with KuickPay"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pay with KuickPay">
          <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center gap-3 px-5 pt-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EF4B23] text-sm font-extrabold text-white">K</span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900">Pay with KuickPay</p>
                <p className="truncate text-xs text-slate-500">{title}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {onlinePayment.test_mode ? (
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  Test mode · no real money moves
                </span>
              ) : null}
              <div className="rounded-2xl border border-[#EF4B23]/20 bg-[#FFF1EC] px-4 py-5 text-center">
                <p className="text-xs font-semibold text-[#C23812]">Amount due</p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{formatMoney(confirmAmount, "PKR")}</p>
                {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
                {dueDate ? <p className="mt-2 text-xs text-slate-500">Due {new Date(`${dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p> : null}
              </div>
              {amountNotice ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{amountNotice}</p> : null}

              <div>
                <p className="text-xs font-semibold text-slate-500">Pay using</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {METHODS.map((method) => (
                    <span key={method.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                      <span className="grid h-4 w-4 place-items-center rounded text-[8px] font-bold text-white" style={{ background: method.color }}>{method.short}</span>
                      {method.label}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">You&apos;ll choose on the secure KuickPay page.</p>
              </div>

              <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
                Secured by KuickPay on the 1LINK network. Havena never sees your card, wallet PIN or bank login.
              </p>

              {onlinePayment.voucher ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">Or pay from any banking app</p>
                    <p className="mt-0.5 font-mono text-sm font-bold tracking-wide text-[#1B4F8A]">{onlinePayment.voucher.display}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Bill Payment → KuickPay in your bank, Easypaisa or JazzCash app.</p>
                  </div>
                  <button type="button" onClick={() => void copyVoucher()} className="inline-flex items-center gap-1 rounded-lg bg-[#E8F0F7] px-2.5 py-1.5 text-xs font-semibold text-[#1B4F8A]">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => void pay()}
                disabled={busy || confirmAmount <= 0}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#EF4B23] text-sm font-bold text-white transition hover:bg-[#C23812] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                {busy ? "Opening KuickPay…" : `Pay ${formatMoney(confirmAmount, "PKR")}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
