"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Landmark, Loader2 } from "lucide-react";
import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { usePlaidLink } from "react-plaid-link";
import { AdminBadge } from "@/components/admin/ui";
import { apiError } from "@/lib/api/client";
import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  type PlaidExchangePayload,
} from "@/lib/api/plaid";
import { toastError, toastSuccess } from "@/lib/alert";

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [connection, setConnection] = useState<PlaidExchangePayload | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const completeExchange = useCallback(async (publicToken: string) => {
    setExchanging(true);
    setLinkError(null);

    try {
      const payload = await exchangePlaidPublicToken(publicToken);
      setConnection(payload);
      toastSuccess("Bank account connected and saved securely.");
    } catch (err) {
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    } finally {
      setExchanging(false);
    }
  }, []);

  const handlePlaidSuccess = useCallback(
    (publicToken: string | null, _metadata: PlaidLinkOnSuccessMetadata) => {
      setLinkToken(null);

      if (!publicToken) {
        setLinkError("Plaid did not return a public token.");
        return;
      }

      void completeExchange(publicToken);
    },
    [completeExchange],
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

  const handleConnect = async () => {
    if (connection?.connected) {
      setLinkError("This community already has a connected bank account.");
      return;
    }

    setConnecting(true);
    setLinkError(null);
    setConnection(null);

    try {
      const payload = await createPlaidLinkToken();
      setLinkToken(payload.link_token);
    } catch (err) {
      setConnecting(false);
      const message = apiError(err);
      setLinkError(message);
      toastError(message);
    }
  };

  const isBusy = connecting || exchanging || Boolean(linkToken && !ready);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Plaid</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Connect a bank account through Plaid Sandbox for community admin verification.
          </p>
        </div>
        <AdminBadge tone="sky">Sandbox</AdminBadge>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <Landmark className="h-7 w-7" />
          </div>

          <h3 className="mt-5 text-lg font-semibold text-slate-900">
            {connection?.connected ? "Bank Account Connected" : "Connect Bank Account"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            {connection?.connected
              ? "Your community bank connection is stored securely on the Havena backend."
              : "Use Plaid Link to authenticate with a Sandbox institution. Havena exchanges the connection securely on the server — no access tokens are exposed to the browser."}
          </p>

          {!connection?.connected ? (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={isBusy}
              className="nl-btn-primary mt-6 inline-flex min-w-[220px] items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
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

          {linkError ? (
            <p className="mt-4 text-sm text-rose-600" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      </div>

      {connection?.connected ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-emerald-900">Bank connection saved</h3>
                <p className="mt-1 text-sm text-emerald-800">
                  Plaid Sandbox authentication completed and the connection was stored for your
                  community. Access tokens remain on the server only.
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200/80 bg-white/70 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Institution
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    {connection.institution_name ?? "Connected institution"}
                  </dd>
                </div>

                <div className="rounded-xl border border-emerald-200/80 bg-white/70 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Item ID
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-slate-700">{connection.item_id}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
