"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { usePlaidLink } from "react-plaid-link";
import { AdminBadge } from "@/components/admin/ui";
import { PageLoader } from "@/components/shared/page-states";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  createPlaidLinkToken,
  disconnectPlaidConnection,
  exchangePlaidPublicToken,
  fetchPlaidConnection,
  reconnectPlaidConnection,
  type PlaidExchangePayload,
} from "@/lib/api/plaid";
import { fetchAdminPlaidPayments, type PlaidPayment } from "@/lib/api/resident-plaid";

type LinkMode = "create" | "update" | "replace";

function formatWhen(value?: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function accountLabel(connection: PlaidExchangePayload) {
  const account = connection.account;
  const name = account?.name || account?.official_name;
  const mask = account?.mask ? `•••• ${account.mask}` : null;
  if (name && mask) return `${name} ${mask}`;
  if (name) return name;
  if (mask) return mask;
  return null;
}

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("create");
  const [connecting, setConnecting] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [connection, setConnection] = useState<PlaidExchangePayload | null>(null);
  const [payments, setPayments] = useState<PlaidPayment[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);

  const status = connection?.status ?? "not_connected";
  const isConnected = Boolean(connection?.connected);
  const needsReconnect = Boolean(connection?.needs_reconnect) || status === "needs_attention" || status === "error";
  const isDisconnected = status === "disconnected";

  const loadConnection = useCallback(async () => {
    const payload = await fetchPlaidConnection();
    setConnection(payload);
    return payload;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [payload, ledger] = await Promise.all([
          fetchPlaidConnection(),
          fetchAdminPlaidPayments().catch(() => []),
        ]);
        if (!cancelled) {
          setConnection(payload);
          setPayments(ledger);
        }
      } catch (err) {
        if (!cancelled) {
          setLinkError(apiError(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingConnection(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const completeExchange = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata, replace: boolean) => {
    setExchanging(true);
    setLinkError(null);

    const selected = metadata.accounts?.[0];

    try {
      const payload = await exchangePlaidPublicToken(publicToken, {
        account_id: selected?.id ?? null,
        account: selected
          ? {
              name: selected.name,
              type: selected.type,
              subtype: selected.subtype,
              mask: selected.mask,
            }
          : undefined,
        institution_id: metadata.institution?.institution_id ?? null,
        institution_name: metadata.institution?.name ?? null,
        replace,
      });
      setConnection(payload);
      toastSuccess(replace ? "Bank account replaced." : "Bank account connected and saved securely.");
    } catch (err) {
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    } finally {
      setExchanging(false);
    }
  }, []);

  const completeUpdate = useCallback(async () => {
    setExchanging(true);
    setLinkError(null);

    try {
      const payload = await reconnectPlaidConnection();
      setConnection(payload);
      toastSuccess("Bank reconnection completed.");
    } catch (err) {
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    } finally {
      setExchanging(false);
    }
  }, []);

  const handlePlaidSuccess = useCallback(
    (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      const mode = linkMode;
      setLinkToken(null);

      if (mode === "update") {
        void completeUpdate();
        return;
      }

      if (!publicToken) {
        setLinkError("Plaid did not return a public token.");
        return;
      }

      void completeExchange(publicToken, metadata, mode === "replace");
    },
    [completeExchange, completeUpdate, linkMode],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handlePlaidSuccess,
    onExit: (error) => {
      setConnecting(false);
      setLinkToken(null);

      if (error) {
        const message =
          error.display_message ||
          error.error_message ||
          "Plaid Link closed before the connection finished.";
        setLinkError(message);
        toastError(message);
        return;
      }

      if (!exchanging) {
        toastSuccess("Plaid Link closed.");
      }
    },
  });

  useEffect(() => {
    if (!linkToken || !ready) return;
    open();
    setConnecting(false);
  }, [linkToken, ready, open]);

  const startLink = async (mode: LinkMode) => {
    setConnecting(true);
    setLinkError(null);
    setLinkMode(mode);

    try {
      const payload = await createPlaidLinkToken(mode);
      setLinkMode(payload.mode === "update" ? "update" : mode);
      setLinkToken(payload.link_token);
    } catch (err) {
      setConnecting(false);
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirmAction({
      title: "Disconnect bank?",
      text: "This removes the Plaid Item for your community. You can connect a bank again later.",
      confirmText: "Disconnect",
    });
    if (!confirmed) return;

    setDisconnecting(true);
    setLinkError(null);
    try {
      const payload = await disconnectPlaidConnection();
      setConnection(payload);
      toastSuccess("Bank disconnected.");
    } catch (err) {
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    } finally {
      setDisconnecting(false);
    }
  };

  const isBusy = connecting || exchanging || disconnecting || Boolean(linkToken && !ready);

  const headline = useMemo(() => {
    if (isConnected) return "Bank Account Connected";
    if (needsReconnect) return "Bank connection needs attention";
    if (isDisconnected) return "Bank disconnected";
    return "Connect Bank Account";
  }, [isConnected, isDisconnected, needsReconnect]);

  const description = useMemo(() => {
    if (isConnected) {
      return "This is the community receiving account. Resident amenity fees and shared bills debit their bank and credit this account via ACH.";
    }
    if (needsReconnect) {
      return connection?.error_message
        || "This Plaid Item is expired or invalid. Reconnect the same bank, or replace it with a different institution.";
    }
    if (isDisconnected) {
      return "No active Plaid Item is linked. Connect a bank again to restore the community connection.";
    }
    return "Use Plaid Link to authenticate with a Sandbox institution. Havena exchanges the connection securely on the server — no access tokens are exposed to the browser.";
  }, [connection?.error_message, isConnected, isDisconnected, needsReconnect]);

  if (loadingConnection) {
    return <PageLoader text="Loading bank connection…" variant="form" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Plaid</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Connect the community bank that receives resident ACH for amenity fees and shared bills.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge tone="teal">Plaid</AdminBadge>
          {isConnected ? <AdminBadge tone="green">Connected</AdminBadge> : null}
          {needsReconnect ? <AdminBadge tone="amber">Needs attention</AdminBadge> : null}
          {isDisconnected ? <AdminBadge tone="slate">Disconnected</AdminBadge> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div
            className={[
              "flex h-14 w-14 items-center justify-center rounded-2xl ring-1",
              isConnected
                ? "bg-[#D1FAF5] text-[#0D9488] ring-[#D1FAF5]"
                : needsReconnect
                  ? "bg-amber-50 text-amber-700 ring-amber-100"
                  : "bg-[#F4F8FD] text-[#0A2A43] ring-slate-200",
            ].join(" ")}
          >
            {isConnected ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : needsReconnect ? (
              <AlertTriangle className="h-7 w-7" />
            ) : (
              <Landmark className="h-7 w-7" />
            )}
          </div>

          <h3 className="mt-5 text-lg font-semibold text-slate-900">{headline}</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">{description}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {!isConnected && !needsReconnect ? (
              <button
                type="button"
                onClick={() => void startLink("create")}
                disabled={isBusy}
                className="nl-btn-primary inline-flex min-w-[220px] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connecting || (linkToken && !ready) ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening Plaid Link…
                  </>
                ) : exchanging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving connection…
                  </>
                ) : (
                  "Connect with Plaid"
                )}
              </button>
            ) : null}

            {needsReconnect ? (
              <button
                type="button"
                onClick={() => void startLink("update")}
                disabled={isBusy}
                className="nl-btn-primary inline-flex min-w-[200px] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connecting || exchanging ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Reconnect bank
              </button>
            ) : null}

            {isConnected || needsReconnect ? (
              <button
                type="button"
                onClick={() => void startLink("replace")}
                disabled={isBusy}
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Replace bank
              </button>
            ) : null}

            {isConnected || needsReconnect ? (
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={isBusy}
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                Disconnect bank
              </button>
            ) : null}
          </div>

          {linkError ? (
            <p className="mt-4 text-sm text-rose-600" role="alert">
              {linkError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void loadConnection().catch((err) => toastError(apiError(err)))}
            disabled={isBusy}
            className="mt-4 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Refresh status
          </button>
        </div>
      </div>

      {connection && (isConnected || needsReconnect || isDisconnected) ? (
        <div
          className={[
            "rounded-2xl border p-5 shadow-sm sm:p-6",
            isConnected
              ? "border-teal-200 bg-[#D1FAF5]/70"
              : needsReconnect
                ? "border-amber-200 bg-amber-50/70"
                : "border-slate-200 bg-[#F4F8FD]",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            {isConnected ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0D9488]" />
            ) : needsReconnect ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <Unplug className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {isConnected ? "Bank connection saved" : needsReconnect ? "Connection status" : "Previous bank"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Access tokens stay on the server. Account and routing numbers are never sent to the browser.
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Institution
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    {connection.institution_name ?? "Connected institution"}
                  </dd>
                </div>

                {accountLabel(connection) ? (
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Account
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{accountLabel(connection)}</dd>
                    {connection.account?.type || connection.account?.subtype ? (
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {[connection.account?.type, connection.account?.subtype].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {connection.item_id ? (
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Item ID
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-slate-700">{connection.item_id}</dd>
                  </div>
                ) : null}

                {connection.connected_at ? (
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {isDisconnected ? "Last connected" : "Updated"}
                    </dt>
                    <dd className="mt-1 text-sm text-slate-700">{formatWhen(connection.connected_at)}</dd>
                  </div>
                ) : null}

                {connection.error_code ? (
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3 sm:col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Plaid error
                    </dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {connection.error_code}
                      {connection.error_message ? ` — ${connection.error_message}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-slate-900">Incoming ACH</h3>
        <p className="mt-1 text-sm text-slate-500">
          Resident bank payments into this community account. Posted payments do not need screenshot review.
        </p>
        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No resident bank payments yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-[#0A2A43]">{payment.purpose_label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payment.user_name || "Resident"}
                    {payment.source?.mask ? ` · •••• ${payment.source.mask}` : ""}
                    {" → "}
                    {payment.destination?.mask ? `•••• ${payment.destination.mask}` : "community bank"}
                    {payment.simulated ? " · ledgered sandbox" : " · live ACH"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[#0A2A43]">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency || "USD" }).format(payment.amount)}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0D9488]">{payment.status_label}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#0A2A43]">How residents pay amenities</h3>
        <p className="mt-1 text-sm text-slate-500">
          Money always moves resident bank → this community account. Havena never takes the funds.
          Live Plaid Transfer runs when the product is enabled on the Plaid dashboard; otherwise sandbox posts a ledgered payment so bookings still complete.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Resort pool booking", "$25 weekend swim. Resident pays at reserve. Cancel or decline refunds the ACH."],
            ["Clubhouse event", "$150 private party. Admin can approve after the bank payment posts."],
            ["Tennis court", "Booking fails if the community bank is not linked. No reservation is left behind."],
            ["Fitness center dues", "October gym bill. One tap Pay with bank marks the resident paid — no screenshot review."],
            ["Pool chemicals", "Shared monthly charge. Paying twice is blocked after the first posted transfer."],
            ["Guest suite fallback", "If a resident has not linked a bank, they still upload payment proof."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-xl border border-slate-100 bg-[#F4F8FD] px-4 py-3">
              <p className="text-sm font-semibold text-[#0A2A43]">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
