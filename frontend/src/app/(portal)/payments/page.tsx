"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Landmark,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { DashboardHero, DashboardEmptyState } from "@/components/admin/dashboard/dashboard-shared";
import { PlaidLinkLauncher } from "@/components/plaid/plaid-link-launcher";
import { DashboardPanel } from "@/components/admin/dashboard/dashboard-panel";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import type { PlaidExchangePayload } from "@/lib/api/plaid";
import {
  bankAccountLabel,
  createResidentPlaidLinkToken,
  disconnectResidentPlaid,
  exchangeResidentPlaidToken,
  fetchAchCapability,
  fetchResidentPayments,
  reconnectResidentPlaid,
  type AchCapability,
  type PlaidPayment,
} from "@/lib/api/resident-plaid";
import { getUser } from "@/lib/auth/session";

type LinkMode = "create" | "update" | "replace";

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function statusTone(status: string) {
  if (status === "posted" || status === "settled") return "bg-teal-50 text-[#0D9488]";
  if (status === "failed" || status === "returned" || status === "cancelled") return "bg-rose-50 text-rose-700";
  if (status === "refunded") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-800";
}

export default function ResidentPaymentsPage() {
  const user = getUser();
  const [capability, setCapability] = useState<AchCapability | null>(null);
  const [payments, setPayments] = useState<PlaidPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("create");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextCapability, nextPayments] = await Promise.all([
      fetchAchCapability(),
      fetchResidentPayments().catch(() => []),
    ]);
    setCapability(nextCapability);
    setPayments(nextPayments);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(apiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const completeExchange = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata, replace: boolean) => {
    const selected = metadata.accounts?.[0];
    const payload = await exchangeResidentPlaidToken(publicToken, {
      account_id: selected?.id ?? null,
      account: selected
        ? { name: selected.name, type: selected.type, subtype: selected.subtype, mask: selected.mask }
        : undefined,
      institution_id: metadata.institution?.institution_id ?? null,
      institution_name: metadata.institution?.name ?? null,
      replace,
    });
    setCapability((current) => current ? { ...current, resident: payload, can_pay_with_bank: Boolean(current.community.bank_connected && payload.connected), requires_resident_link: !payload.connected } : current);
    toastSuccess(replace ? "Bank account replaced." : "Bank connected. Amenity fees can now debit this account.");
    await load();
  }, [load]);

  const handleLinkSuccess = useCallback((publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    const mode = linkMode;
    setLinkToken(null);
    if (mode === "update") {
      void reconnectResidentPlaid()
        .then((payload) => {
          setCapability((current) => current ? { ...current, resident: payload, can_pay_with_bank: Boolean(current.community.bank_connected && payload.connected) } : current);
          toastSuccess("Bank reconnection completed.");
        })
        .catch((err) => toastError(apiError(err)))
        .finally(() => setBusy(false));
      return;
    }
    if (!publicToken) {
      toastError("Plaid did not return a public token.");
      setBusy(false);
      return;
    }
    void completeExchange(publicToken, metadata, mode === "replace")
      .catch((err) => toastError(apiError(err)))
      .finally(() => setBusy(false));
  }, [completeExchange, linkMode]);

  const startLink = async (mode: LinkMode) => {
    setBusy(true);
    setLinkMode(mode);
    try {
      const payload = await createResidentPlaidLinkToken(mode);
      setLinkMode(payload.mode === "update" ? "update" : mode);
      setLinkToken(payload.link_token);
    } catch (err) {
      setBusy(false);
      toastError(apiError(err));
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirmAction({
      title: "Disconnect your bank?",
      text: "Future amenity fees will need a payment screenshot unless you connect a bank again.",
      confirmText: "Disconnect",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const payload = await disconnectResidentPlaid();
      setCapability((current) => current ? { ...current, resident: payload, can_pay_with_bank: false, requires_resident_link: true } : current);
      toastSuccess("Bank disconnected.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader text="Loading payments…" variant="form" />;
  if (error) return <PageError message={error} />;

  const resident = capability?.resident;
  const community = capability?.community;
  const connected = Boolean(resident?.connected);
  const needsReconnect = Boolean(resident?.needs_reconnect);
  const available = Boolean(capability?.plaid_available && capability?.ach_enabled);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      {linkToken ? (
        <PlaidLinkLauncher
          token={linkToken}
          onSuccess={handleLinkSuccess}
          onExit={() => {
            setBusy(false);
            setLinkToken(null);
          }}
        />
      ) : null}
      <DashboardHero
        eyebrow="Resident payments"
        title="Bank & amenity ACH"
        description={
          available
            ? "Pay amenity fees and shared bills from your bank to the community account. Havena never charges residents."
            : "Bank payments are not available for this community. You can still upload payment proof on Property."
        }
        variant="community"
        compact
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
        <DashboardPanel title="Your bank" description="The account we debit for community charges" icon={Landmark} tone="blue">
          {!available ? (
            <DashboardEmptyState title="ACH not available" description="This community is outside the US Plaid region, or billing-exempt." />
          ) : (
            <ResidentBankCard
              connection={resident ?? null}
              busy={busy}
              sandbox={capability?.environment === "sandbox"}
              onConnect={() => void startLink(connected || needsReconnect ? "replace" : "create")}
              onReconnect={needsReconnect ? () => void startLink("update") : undefined}
              onDisconnect={connected || needsReconnect ? () => void handleDisconnect() : undefined}
            />
          )}
        </DashboardPanel>

        <DashboardPanel title="Community receiving account" description="Where amenity ACH lands" icon={Building2} tone="green">
          {community?.bank_connected ? (
            <div className="rounded-2xl border border-teal-200 bg-[#D1FAF5]/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0A2A43]">
                <CheckCircle2 className="h-4 w-4" />
                {community.name || "Community"} accepts bank payments
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {community.institution_name || "Community bank"}
                {community.account_mask ? ` •••• ${community.account_mask}` : ""}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Money moves resident bank → community bank. It does not go to Havena.
              </p>
            </div>
          ) : (
            <DashboardEmptyState
              title="Community bank not connected yet"
              description="Ask your community admin to connect a receiving bank on Plaid. Until then, upload payment proof."
            />
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title="What you can pay from this bank" description="Typical community amenity charges" icon={Building2} tone="teal">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["Pool or court booking", "Pay the reservation fee when you book. Cancel before it happens and the ACH is refunded."],
            ["Clubhouse event", "Larger one-time fee for a private party. The owner sees it as posted, not a screenshot."],
            ["Monthly gym or pool bill", "Shared amenity dues. Pay once — a second charge is blocked."],
            ["If bank is not linked", "Upload a receipt on Property. Community admin reviews that proof as before."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-xl border border-slate-100 bg-[#F4F8FD] px-3 py-3">
              <p className="text-sm font-semibold text-[#0A2A43]">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
        {capability?.transfer_mode ? (
          <p className="mt-3 text-xs text-slate-500">
            Transfer mode: {capability.live_transfer_ready ? "live ACH" : "sandbox ledger"}
            {capability.environment ? ` · ${capability.environment}` : ""}. Funds still never go to Havena.
          </p>
        ) : null}
      </DashboardPanel>

      <DashboardPanel title="Payment activity" description={`Bank transfers for ${user?.name || "this account"}`} icon={RefreshCw} tone="slate">
        {payments.length === 0 ? (
          <DashboardEmptyState title="No bank payments yet" description="When you pay a booking fee or shared bill from your bank, it will appear here." />
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{payment.purpose_label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payment.source?.institution_name || "Your bank"}
                    {payment.source?.mask ? ` •••• ${payment.source.mask}` : ""}
                    {" → "}
                    {payment.destination?.institution_name || "Community"}
                    {payment.destination?.mask ? ` •••• ${payment.destination.mask}` : ""}
                  </p>
                  {payment.failure_message ? (
                    <p className="mt-1 text-xs text-rose-600">{payment.failure_message}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{money(payment.amount, payment.currency)}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(payment.status)}`}>
                    {payment.status_label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}

function ResidentBankCard({
  connection,
  busy,
  sandbox,
  onConnect,
  onReconnect,
  onDisconnect,
}: {
  connection: PlaidExchangePayload | null;
  busy: boolean;
  sandbox?: boolean;
  onConnect: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}) {
  const connected = Boolean(connection?.connected);
  const needsReconnect = Boolean(connection?.needs_reconnect);

  return (
    <div className="space-y-4">
      <div
        className={[
          "rounded-2xl border p-4",
          connected ? "border-teal-200 bg-[#D1FAF5]/70" : needsReconnect ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          {connected ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#0D9488]" /> : needsReconnect ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /> : <Landmark className="mt-0.5 h-5 w-5 text-slate-500" />}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {connected ? "Bank connected" : needsReconnect ? "Reconnect your bank" : "No bank linked"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {connected
                ? bankAccountLabel(connection?.account, connection?.institution_name)
                : needsReconnect
                  ? connection?.error_message || "Plaid needs you to sign in again."
                  : "Connect once, then pay amenity fees without uploading a screenshot."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!connected && !needsReconnect ? (
          <button type="button" onClick={onConnect} disabled={busy} className="nl-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-60 sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
            Connect bank
          </button>
        ) : null}
        {needsReconnect && onReconnect ? (
          <button type="button" onClick={onReconnect} disabled={busy} className="nl-btn-primary inline-flex w-full items-center justify-center gap-2 disabled:opacity-60 sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reconnect
          </button>
        ) : null}
        {connected || needsReconnect ? (
          <button type="button" onClick={onConnect} disabled={busy} className="nl-btn-secondary w-full sm:w-auto">
            Replace bank
          </button>
        ) : null}
        {onDisconnect ? (
          <button type="button" onClick={onDisconnect} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-60 sm:w-auto">
            <Unplug className="h-4 w-4" />
            Disconnect
          </button>
        ) : null}
      </div>
      {sandbox && !connected ? (
        <p className="text-xs leading-relaxed text-slate-500">
          Sandbox: use phone <span className="font-semibold text-[#0A2A43]">(415) 555-0011</span>, or tap
          {" "}<span className="font-semibold text-[#0A2A43]">Continue without phone number</span>, then First Platypus Bank.
        </p>
      ) : null}
    </div>
  );
}
