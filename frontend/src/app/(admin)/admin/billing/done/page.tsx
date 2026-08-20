"use client";

import { useEffect, useState } from "react";
import { Check, Smartphone } from "lucide-react";
import { cameFromMobileApp, openMobileAppReturn, readAppReturnTo, redirectToMobileAppIfPresent } from "@/lib/auth/app-return";

export default function BillingDonePage() {
  const [tried, setTried] = useState(false);
  const returnTo = typeof window === "undefined" ? null : readAppReturnTo();
  const fromApp = typeof window === "undefined" ? false : cameFromMobileApp();

  useEffect(() => {
    if (!fromApp) return;
    const timer = window.setTimeout(() => {
      redirectToMobileAppIfPresent();
      setTried(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fromApp]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-100">
        <Check className="h-8 w-8 text-teal-600" aria-hidden />
      </div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Card saved</p>
      <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.75rem] font-bold tracking-tight text-slate-900">
        Return to the Havena app
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
        Your card is on file. You will not be charged until a system administrator approves your community and the
        free trial ends. Open the app and tap <span className="font-semibold text-slate-800">Refresh status</span>.
      </p>

      {returnTo ? (
        <button
          type="button"
          onClick={() => {
            openMobileAppReturn();
            setTried(true);
          }}
          className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          <Smartphone className="h-4 w-4" aria-hidden />
          {tried ? "Open Havena again" : "Open Havena"}
        </button>
      ) : (
        <p className="mt-8 text-[13px] text-slate-500">Switch back to the Havena app on this phone, then refresh status.</p>
      )}
    </div>
  );
}
