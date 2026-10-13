"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  downloadKuickpayPlatformCsv,
  fetchKuickpayPlatformOverview,
  fetchKuickpayPlatformPayments,
  type KuickpayPlatformOverview,
  type PlatformPaymentRow,
} from "@/lib/api/kuickpay";
import { formatMoney } from "@/lib/money";

const PAYMENT_FILTERS = [
  { id: "attention", label: "Exceptions" },
  { id: "failed", label: "Failed" },
  { id: "succeeded", label: "Successful" },
  { id: "all", label: "All" },
];

const CREDENTIAL_LABELS: Record<string, string> = {
  company_id: "Company ID",
  secured_key: "Secured key",
  bill_initiator_key: "Bill initiator key",
  initiator_id: "Initiator ID",
  institution_id: "Institution ID",
  institution_username: "Institution username",
  institution_password: "Institution password",
};

export default function KuickpayOversightPage() {
  const [overview, setOverview] = useState<KuickpayPlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("attention");
  const [rows, setRows] = useState<PlatformPaymentRow[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    fetchKuickpayPlatformOverview()
      .then(setOverview)
      .catch((err) => toastError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const loadPayments = useCallback(async (page = 1) => {
    setListLoading(true);
    try {
      const list = await fetchKuickpayPlatformPayments({ status, page });
      setRows(list.data);
      setMeta(list.meta);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setListLoading(false);
    }
  }, [status]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-[#EF4B23]" /></div>;
  }
  if (!overview) return null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">System admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">KuickPay oversight</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{overview.note}</p>
      </div>

      {!overview.operational ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          KuickPay is not operational. Mode is {overview.mode}. Sandbox is refused when the app environment is production.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Succeeded" value={overview.counts.succeeded} />
        <Tile label="Processing" value={overview.counts.processing} />
        <Tile label="Failed" value={overview.counts.failed} />
        <Tile label="Needs attention" value={overview.counts.needs_attention} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">Integration health</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Mode" value={overview.mode} />
          <Row label="Checkout status API" value={overview.checkout_status_api === "configured" ? "Configured" : "Not published by KuickPay"} />
          <Row label="Payment method" value="Chosen on KuickPay's hosted page" />
          <Row label="Open cases" value={String(overview.counts.open_cases)} />
        </dl>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {Object.entries(overview.credentials).map(([key, present]) => (
            <li key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span>{CREDENTIAL_LABELS[key] ?? key}</span>
              <span className={present ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"}>{present ? "Set" : "Missing"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Pakistan communities</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2">Community</th>
              <th className="px-4 py-2">Rail</th>
              <th className="px-4 py-2">Payments</th>
              <th className="px-4 py-2">Utilities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overview.communities.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No Pakistan communities.</td></tr>
            ) : overview.communities.map((community) => (
              <tr key={community.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{community.name}</td>
                <td className="px-4 py-3 text-slate-600">{community.rail ?? "Off"}</td>
                <td className="px-4 py-3">{community.payments_enabled ? "On" : "Off"}</td>
                <td className="px-4 py-3">{community.utilities_enabled ? "On" : "Off"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="mr-2 text-sm font-bold text-slate-900">Payments</h2>
          {PAYMENT_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${status === filter.id ? "bg-[#1B4F8A] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {filter.label}
            </button>
          ))}
          <button type="button" onClick={() => void downloadKuickpayPlatformCsv(status)} className="nl-btn-secondary ml-auto">Download CSV</button>
        </div>
        {listLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#EF4B23]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Community</th>
                  <th className="px-4 py-2">Resident</th>
                  <th className="px-4 py-2">Bill</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No payments in this view.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.community || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.resident || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.title || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{row.reference}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.status.replaceAll("_", " ")}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatMoney(row.amount, row.currency || "PKR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">{meta.total} payments</span>
          <div className="flex gap-2">
            <button type="button" disabled={meta.current_page <= 1} onClick={() => void loadPayments(meta.current_page - 1)} className="nl-btn-secondary disabled:opacity-50">Previous</button>
            <button type="button" disabled={meta.current_page >= meta.last_page} onClick={() => void loadPayments(meta.current_page + 1)} className="nl-btn-secondary disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
