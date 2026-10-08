"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search, Wallet, X } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  fetchAdminPayment,
  fetchAdminPayments,
  fetchAdminPaymentsSummary,
  markAdminPaymentRefunded,
  reconcileAdminPayment,
  updateAdminPaymentSettings,
  type AdminPaymentsSummary,
  type PaymentDetail,
} from "@/lib/api/kuickpay";
import { formatMoney } from "@/lib/money";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "succeeded", label: "Successful" },
  { id: "processing", label: "Processing" },
  { id: "attention", label: "Needs attention" },
  { id: "unsuccessful", label: "Unsuccessful" },
];

const TYPE_LABEL: Record<string, string> = {
  unit_service_bill: "Unit service",
  amenity_resident_bill: "Amenity",
  utility_bill: "Utility",
};

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  muted: "bg-slate-100 text-slate-600",
};

function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminKuickpayPage() {
  const [summary, setSummary] = useState<AdminPaymentsSummary | null>(null);
  const [rows, setRows] = useState<PaymentDetail[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const [nextSummary, list] = await Promise.all([
        fetchAdminPaymentsSummary(),
        fetchAdminPayments({ status, search: search.trim() || undefined, page }),
      ]);
      setSummary(nextSummary);
      setRows(list.data);
      setMeta(list.meta);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(id: string) {
    try {
      setDetail(await fetchAdminPayment(id));
    } catch (err) {
      toastError(apiError(err));
    }
  }

  async function reconcile(id: string) {
    setActing(true);
    try {
      const result = await reconcileAdminPayment(id);
      toastSuccess(result.message);
      setDetail(await fetchAdminPayment(id));
      void load(meta.current_page);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActing(false);
    }
  }

  async function refunded(id: string) {
    const note = window.prompt("KuickPay refund reference (optional)") ?? undefined;
    setActing(true);
    try {
      const result = await markAdminPaymentRefunded(id, note || undefined);
      toastSuccess(result.message);
      setDetail(await fetchAdminPayment(id));
      void load(meta.current_page);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActing(false);
    }
  }

  async function toggle(key: "payments_enabled" | "utilities_enabled" | "residents_can_link_utilities", value: boolean) {
    try {
      const result = await updateAdminPaymentSettings({ [key]: value });
      setSummary((current) => (current ? { ...current, profile: { ...current.profile, ...result.data } } : current));
      toastSuccess(result.message);
    } catch (err) {
      toastError(apiError(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Pakistan payments</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EF4B23] text-sm font-extrabold text-white">K</span>
            KuickPay
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Residents pay unit, amenity and utility bills with Easypaisa, JazzCash, cards, bank accounts or Raast. Bills mark themselves paid once KuickPay confirms — no screenshots to check.
          </p>
        </div>
        <button type="button" onClick={() => void load(meta.current_page)} className="nl-btn-secondary inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {summary?.test_mode ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Test mode — payments use the KuickPay sandbox and no real money moves.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collected this month" value={formatMoney(summary?.collected_this_month ?? 0, "PKR")} sub={`${summary?.collected_count_this_month ?? 0} payments`} />
        <Stat label="Processing" value={String(summary?.processing ?? 0)} sub="Waiting for KuickPay" />
        <Stat label="Needs attention" value={String(summary?.needs_attention ?? 0)} sub="Refunds and mismatches" tone={summary?.needs_attention ? "warn" : undefined} />
        <Stat label="Linked utility accounts" value={String(summary?.linked_utility_accounts ?? 0)} sub="K-Electric, LESCO, SNGPL…" />
      </div>

      {summary ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Settings</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Toggle label="Online payments" hint="Show Pay with KuickPay on resident bills." checked={summary.profile.payments_enabled} onChange={(v) => void toggle("payments_enabled", v)} />
            <Toggle label="Utility bills" hint="Let residents pay electricity, gas, water and internet bills." checked={summary.profile.utilities_enabled} onChange={(v) => void toggle("utilities_enabled", v)} />
            <Toggle label="Residents can link utilities" hint="Unit billing contacts can add their own accounts." checked={summary.profile.residents_can_link_utilities} onChange={(v) => void toggle("residents_can_link_utilities", v)} />
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === filter.id ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {filter.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
              placeholder="Reference, resident or bill"
              className="w-56 text-sm outline-none"
            />
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#EF4B23]" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-500">
            <Wallet className="h-6 w-6" /> No KuickPay payments yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Resident</th>
                  <th className="px-4 py-2">Bill</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => void openDetail(row.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{when(row.confirmed_at || row.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.payer?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.title}</p>
                      <p className="text-xs text-slate-500">{TYPE_LABEL[row.payable_type] ?? row.payable_type}{row.subtitle ? ` · ${row.subtitle}` : ""}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{row.formatted_amount}</td>
                    <td className="px-4 py-3 text-slate-600">{row.method_label ?? (row.channel === "kuickpay" ? "Bank / voucher" : "—")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE_CLASS[row.tone] ?? TONE_CLASS.muted}`}>{row.status_label}</span>
                      {row.needs_attention ? <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Needs attention" /> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.last_page > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">{meta.total} payments</span>
            <div className="flex gap-2">
              <button type="button" disabled={meta.current_page <= 1} onClick={() => void load(meta.current_page - 1)} className="nl-btn-secondary disabled:opacity-50">Previous</button>
              <button type="button" disabled={meta.current_page >= meta.last_page} onClick={() => void load(meta.current_page + 1)} className="nl-btn-secondary disabled:opacity-50">Next</button>
            </div>
          </div>
        ) : null}
      </section>

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setDetail(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{detail.reference}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{detail.title}</h2>
                <p className="text-sm text-slate-500">{detail.subtitle}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-4 text-3xl font-extrabold text-slate-900">{detail.formatted_amount}</p>
            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${TONE_CLASS[detail.tone] ?? TONE_CLASS.muted}`}>{detail.status_label}</span>
            {detail.failure_message ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{detail.failure_message}</p> : null}

            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              <Detail label="Resident" value={detail.payer?.name} />
              <Detail label="Method" value={detail.method_label} />
              <Detail label="Channel" value={detail.receipt?.channel_label ?? detail.channel} />
              <Detail label="KuickPay transaction" value={detail.provider_transaction_id} />
              <Detail label="Started" value={when(detail.created_at)} />
              <Detail label="Confirmed" value={when(detail.confirmed_at)} />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {["processing", "awaiting_payment"].includes(detail.status) ? (
                <button type="button" disabled={acting} onClick={() => void reconcile(detail.id)} className="nl-btn-primary inline-flex items-center gap-2">
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check with KuickPay
                </button>
              ) : null}
              {detail.status === "refund_pending" ? (
                <button type="button" disabled={acting} onClick={() => void refunded(detail.id)} className="nl-btn-primary">Mark refunded</button>
              ) : null}
            </div>

            <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Timeline</h3>
            <ol className="mt-2 space-y-2">
              {(detail.events ?? []).map((event, index) => (
                <li key={`${event.event}-${index}`} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1B4F8A]" />
                  <div>
                    <p className="font-medium text-slate-800">{event.event.replaceAll("_", " ")}</p>
                    <p className="text-xs text-slate-500">{when(event.created_at)}{event.status_to ? ` · ${event.status_to.replaceAll("_", " ")}` : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1B4F8A]" />
    </label>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
