"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PauseCircle, PlayCircle, RefreshCw, Search } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { PageLoader } from "@/components/shared/page-states";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  fetchAdminPlaidOverview,
  fetchAdminPlaidTransfers,
  refreshAdminPlaidTransfer,
  resolveAdminPlaidException,
  setCommunityBankPayments,
  syncAdminPlaidEvents,
  type AdminPlaidCommunity,
  type AdminPlaidOverview,
  type AdminPlaidStatusFilter,
  type AdminPlaidTransfer,
} from "@/lib/api/admin-plaid";

const STATUS_FILTERS: { value: AdminPlaidStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Posted / settled" },
  { value: "failed", label: "Failed" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunds", label: "Refunds" },
  { value: "exceptions", label: "Needs review" },
  { value: "stale", label: "Stale" },
];

function when(value?: string | null) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-[#0D9488]" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

export default function BankPaymentsPage() {
  const [overview, setOverview] = useState<AdminPlaidOverview | null>(null);
  const [transfers, setTransfers] = useState<AdminPlaidTransfer[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<AdminPlaidStatusFilter>("exceptions");
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pauseTarget, setPauseTarget] = useState<AdminPlaidCommunity | null>(null);
  const [reason, setReason] = useState("");
  const [noteTarget, setNoteTarget] = useState<AdminPlaidTransfer | null>(null);
  const [note, setNote] = useState("");

  const loadOverview = useCallback(async () => {
    setOverview(await fetchAdminPlaidOverview());
  }, []);

  const loadTransfers = useCallback(async () => {
    const res = await fetchAdminPlaidTransfers({ status, community_id: communityId, search: search.trim() || undefined });
    setTransfers(res.data);
    setTotal(res.meta.total);
  }, [communityId, search, status]);

  useEffect(() => {
    void (async () => {
      try {
        await loadOverview();
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadOverview]);

  useEffect(() => {
    let cancelled = false;
    fetchAdminPlaidTransfers({ status, community_id: communityId, search: search.trim() || undefined })
      .then((res) => {
        if (cancelled) return;
        setTransfers(res.data);
        setTotal(res.meta.total);
      })
      .catch((err) => toastError(apiError(err)));
    return () => {
      cancelled = true;
    };
  }, [communityId, search, status]);

  const run = async (key: string, action: () => Promise<{ message: string }>) => {
    setBusy(key);
    try {
      const res = await action();
      toastSuccess(res.message);
      await Promise.all([loadOverview(), loadTransfers()]);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(null);
    }
  };

  const submitPause = async () => {
    if (!pauseTarget || reason.trim().length < 5) return;
    const target = pauseTarget;
    await run(`pause-${target.id}`, () => setCommunityBankPayments(target.id, target.payments_paused, reason.trim()));
    setPauseTarget(null);
    setReason("");
  };

  const submitNote = async () => {
    if (!noteTarget || note.trim().length < 5) return;
    const target = noteTarget;
    await run(`note-${target.id}`, () => resolveAdminPlaidException(target.id, note.trim()));
    setNoteTarget(null);
    setNote("");
  };

  if (loading) return <PageLoader text="Loading US bank payments…" variant="form" />;
  if (!overview) return <p className="text-sm text-rose-600">Could not load bank payment status.</p>;

  const { config, health, counts } = overview;
  const modeTone = config.environment === "production" && !config.simulated ? "green" : "amber";

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">US Bank Payments</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Plaid Transfer: resident ACH debit into the Havena Plaid Ledger, then a credit to the community bank.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge tone={modeTone}>
            {config.simulated ? "Simulated (no Plaid calls)" : config.environment === "production" ? "Production" : `Plaid ${config.environment}`}
          </AdminBadge>
          {!config.transfers_enabled ? <AdminBadge tone="red">New payments off</AdminBadge> : null}
          {config.sandbox_blocked_in_production ? <AdminBadge tone="red">Sandbox blocked on live site</AdminBadge> : null}
          <button
            type="button"
            onClick={() => void run("sync", syncAdminPlaidEvents)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Plaid events
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Server configuration</h3>
          <div className="mt-3 space-y-2">
            <Flag ok={config.client_id_set && config.secret_set} label="Plaid client ID and secret set" />
            <Flag ok={config.transfers_enabled} label="New bank payments enabled" />
            <Flag ok={config.webhook_url_set} label="Webhook URL configured" />
            <Flag ok={config.verify_webhooks} label="Webhook signatures verified" />
            <Flag ok={!config.sandbox_blocked_in_production} label={`App ${config.app_environment} · Plaid ${config.environment}`} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Webhook & sync health</h3>
          <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
            <div className="flex justify-between gap-3"><dt>Last webhook</dt><dd>{when(health.last_webhook_received_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last failure</dt><dd>{when(health.last_webhook_failed_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Last event sync</dt><dd>{when(health.last_event_sync_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Event cursor</dt><dd>{health.event_cursor}</dd></div>
            <div className="flex justify-between gap-3"><dt>Unmatched Plaid events</dt><dd>{health.unmatched_events}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Attention</h3>
          <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
            <div className="flex justify-between"><dt>Needs review</dt><dd className="font-semibold">{counts.open_exceptions}</dd></div>
            <div className="flex justify-between"><dt>Pending</dt><dd>{counts.pending}</dd></div>
            <div className="flex justify-between"><dt>Stale (unresolved too long)</dt><dd>{counts.stale}</dd></div>
            <div className="flex justify-between"><dt>Refunds in progress</dt><dd>{counts.refunds_pending}</dd></div>
            <div className="flex justify-between"><dt>Returned (30 days)</dt><dd>{counts.returned_30d}</dd></div>
            <div className="flex justify-between"><dt>Failed (30 days)</dt><dd>{counts.failed_30d}</dd></div>
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Communities</h3>
        <p className="mt-1 text-sm text-slate-500">
          “Bank connected” only means Plaid linked an account. “Ready” also requires the server, the community and payments to be enabled.
          Pausing stops new payments; existing payments keep updating from Plaid.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Community</th>
                <th className="py-2 pr-4">Bank</th>
                <th className="py-2 pr-4">Payments</th>
                <th className="py-2 pr-4">Open</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overview.communities.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="py-2.5 pr-4">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.country_code ?? "Country not set"} · {c.status}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {c.bank.connected ? `${c.bank.institution_name ?? "Bank"} •••• ${c.bank.account_mask ?? "----"}` : c.bank.status.replace("_", " ")}
                  </td>
                  <td className="py-2.5 pr-4">
                    {c.ready ? <AdminBadge tone="green">Ready</AdminBadge> : <AdminBadge tone={c.payments_paused ? "red" : "amber"}>{c.readiness_message}</AdminBadge>}
                    {c.payments_pause_reason ? <p className="mt-1 text-xs text-slate-500">{c.payments_pause_reason}</p> : null}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">{c.open_payments}</td>
                  <td className="py-2.5 text-right">
                    {c.bank.status !== "not_connected" ? (
                      <button
                        type="button"
                        onClick={() => { setPauseTarget(c); setReason(""); }}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-60"
                      >
                        {c.payments_paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                        {c.payments_paused ? "Resume" : "Pause"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pauseTarget ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <label htmlFor="pause-reason" className="text-sm font-semibold text-slate-900">
              {pauseTarget.payments_paused ? "Resume" : "Pause"} bank payments for {pauseTarget.name} — reason (required)
            </label>
            <textarea
              id="pause-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={255}
              rows={2}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void submitPause()} disabled={reason.trim().length < 5 || busy !== null} className="nl-btn-primary disabled:opacity-60">
                Confirm
              </button>
              <button type="button" onClick={() => setPauseTarget(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Payments</h3>
            <p className="mt-1 text-sm text-slate-500">
              Status comes from Plaid only. Refresh asks Plaid again; it cannot mark a payment paid or refunded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as AdminPlaidStatusFilter)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label="Status filter">
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={communityId ?? ""} onChange={(e) => setCommunityId(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label="Community filter">
              <option value="">All communities</option>
              {overview.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Resident or Plaid ID"
                aria-label="Search payments"
                className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm"
              />
            </label>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">{total} payment(s)</p>
        <div className="mt-2 divide-y divide-slate-100">
          {transfers.length === 0 ? <p className="py-4 text-sm text-slate-500">No payments match these filters.</p> : null}
          {transfers.map((t) => (
            <div key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0A2A43]">{t.purpose_label} · {t.community_name ?? `Community #${t.community_id}`}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t.user_name ?? "Resident"} · •••• {t.source.mask ?? "----"} → •••• {t.destination.mask ?? "----"}
                  {t.simulated ? " · simulated" : ""} · {when(t.created_at)}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  debit {t.debit_transfer_id ?? "—"} · payout {t.credit_transfer_id ?? "—"} ({t.credit_status ?? "—"})
                  {t.refund_transfer_id ? ` · refund ${t.refund_transfer_id}` : ""}
                </p>
                {t.exception_open ? <p className="mt-1 text-xs font-medium text-amber-700">{t.exception_message}</p> : null}
                {t.failure_message && !t.exception_open ? <p className="mt-1 text-xs text-rose-600">{t.failure_message}</p> : null}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#0A2A43]">{money(t.amount, t.currency)}</p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">{t.status_label}</p>
                <div className="mt-1 flex justify-end gap-3">
                  {!t.simulated ? (
                    <button type="button" onClick={() => void run(`refresh-${t.id}`, () => refreshAdminPlaidTransfer(t.id))} disabled={busy !== null} className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60">
                      Refresh
                    </button>
                  ) : null}
                  {t.exception_open ? (
                    <button type="button" onClick={() => { setNoteTarget(t); setNote(""); }} disabled={busy !== null} className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60">
                      Mark reviewed
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        {noteTarget ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-[#F4F8FD] p-4">
            <label htmlFor="exception-note" className="text-sm font-semibold text-slate-900">
              What did you check or do? (required — the payment status will not change)
            </label>
            <textarea id="exception-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void submitNote()} disabled={note.trim().length < 5 || busy !== null} className="nl-btn-primary disabled:opacity-60">Save note</button>
              <button type="button" onClick={() => setNoteTarget(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
