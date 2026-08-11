"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { apiError } from "@/lib/api/client";
import {
  changeBillingPlan,
  confirmBillingCheckout,
  fetchBilling,
  formatMoney,
  openBillingPortal,
  startBillingCheckout,
  type BillingInterval,
  type BillingPayload,
  type BillingPlan,
} from "@/lib/api/billing";
import { toastError, toastSuccess } from "@/lib/alert";

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "grace":
    case "past_due":
      return "Payment past due";
    case "incomplete":
      return "Checkout incomplete";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    default:
      return status ? status.replace(/_/g, " ") : "No subscription";
  }
}

function ChecklistItem({
  done,
  label,
  hint,
}: {
  done: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3">
      <span
        className={[
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400",
        ].join(" ")}
        aria-hidden
      >
        {done ? "✓" : "•"}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-800">{label}</p>
        {hint ? <p className="mt-0.5 text-[12px] text-slate-500">{hint}</p> : null}
      </div>
    </li>
  );
}

function PlanCard({
  plan,
  interval,
  selected,
  busy,
  onSelect,
  onCheckout,
  isCurrent,
  canChange,
}: {
  plan: BillingPlan;
  interval: BillingInterval;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCheckout: () => void;
  isCurrent: boolean;
  canChange: boolean;
}) {
  const price = interval === "year" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const period = interval === "year" ? "/year" : "/month";

  return (
    <div
      className={[
        "flex h-full w-full flex-col rounded-2xl border p-5 text-left transition",
        selected
          ? "border-[#14B8A6] bg-[#F0FDFA] shadow-md ring-1 ring-[#14B8A6]/25"
          : "border-slate-200 bg-white hover:border-slate-300",
      ].join(" ")}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[15px] font-semibold text-slate-900">{plan.name}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{plan.description}</p>
          </div>
          {plan.recommended ? (
            <span className="rounded-full bg-[#0A2A43] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Recommended
            </span>
          ) : null}
        </div>

        <p className="text-[28px] font-semibold tracking-tight text-slate-900">
          {formatMoney(price, plan.currency)}
          <span className="text-[13px] font-medium text-slate-500">{period}</span>
        </p>
        <p className="mt-1 text-[13px] text-slate-600">{plan.seat_limit} resident seats</p>
      </button>

      <div className="mt-auto pt-5">
        {isCurrent ? (
          <span className="inline-flex rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
            Current plan
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onCheckout}
            className={[
              "inline-flex rounded-xl px-3 py-2 text-[12px] font-semibold",
              busy
                ? "cursor-wait bg-slate-100 text-slate-400"
                : "cursor-pointer bg-[#0A2A43] text-white hover:bg-[#14384f]",
            ].join(" ")}
          >
            {busy ? "Starting…" : canChange ? "Switch to this plan" : "Choose plan"}
          </button>
        )}
      </div>
    </div>
  );
}

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<BillingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const autoStartedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const payload = await fetchBilling();
      setData(payload);
      setSelected((prev) => prev ?? payload.recommended_plan ?? payload.plans[0]?.slug ?? null);
      if (payload.subscription?.billing_interval === "year") {
        setInterval("year");
      }
      return payload;
    } catch (err) {
      setError(apiError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCheckout = useCallback(
    async (planSlug: string, billingInterval?: BillingInterval) => {
      if (!data) return;
      const nextInterval = billingInterval ?? interval;
      setBusy(true);
      try {
        const hasActive = data.setup.subscription_active;
        if (hasActive && data.subscription) {
          const next = await changeBillingPlan({
            plan_slug: planSlug,
            interval: nextInterval,
          });
          setData(next);
          toastSuccess("Plan updated.");
          return;
        }

        const result = await startBillingCheckout({
          plan_slug: planSlug,
          interval: nextInterval,
          estimated_residents: data.community.estimated_residents ?? undefined,
        });

        if (result.mode === "stripe" && result.checkout_url) {
          window.location.href = result.checkout_url;
          return;
        }

        toastSuccess(result.message || "Subscription activated.");
        await load(true);
        router.replace("/admin/billing");
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setBusy(false);
      }
    },
    [data, interval, load, router],
  );

  // After Stripe return: confirm session even if webhook is delayed.
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    if (checkout !== "success" || !sessionId) return;

    let cancelled = false;
    setConfirmingCheckout(true);

    (async () => {
      try {
        const payload = await confirmBillingCheckout(sessionId);
        if (cancelled) return;
        setData(payload);
        if (payload.setup.subscription_active) {
          toastSuccess("Subscription active. You can invite residents now.");
        }
        router.replace("/admin/billing");
      } catch (err) {
        // Fallback: poll billing status in case webhook already activated it.
        for (let i = 0; i < 6 && !cancelled; i += 1) {
          await new Promise((r) => setTimeout(r, 1500));
          const payload = await fetchBilling().catch(() => null);
          if (payload?.setup.subscription_active) {
            setData(payload);
            toastSuccess("Subscription active. You can invite residents now.");
            router.replace("/admin/billing");
            break;
          }
          if (i === 5) toastError(apiError(err));
        }
      } finally {
        if (!cancelled) setConfirmingCheckout(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  // From website/login: /admin/billing?plan=growth&interval=month → start checkout once.
  useEffect(() => {
    if (!data || busy || autoStartedRef.current) return;
    if (searchParams.get("checkout") === "success") return;

    const plan = searchParams.get("plan");
    if (!plan) return;
    if (!data.plans.some((p) => p.slug === plan)) {
      toastError("That plan is not available.");
      return;
    }

    const qInterval = searchParams.get("interval");
    const nextInterval: BillingInterval = qInterval === "year" ? "year" : "month";
    setInterval(nextInterval);
    setSelected(plan);

    if (data.setup.subscription_active && data.subscription?.plan_slug === plan) {
      toastSuccess("This plan is already active.");
      router.replace("/admin/billing");
      return;
    }

    autoStartedRef.current = true;
    void onCheckout(plan, nextInterval);
  }, [data, busy, searchParams, onCheckout, router]);

  const estimatedHint = useMemo(() => {
    if (!data?.community.estimated_residents) return null;
    const plan = data.plans.find((p) => p.slug === data.recommended_plan);
    if (!plan) return null;
    return `You estimated ~${data.community.estimated_residents} residents → ${plan.name} (${plan.seat_limit}) recommended.`;
  }, [data]);

  const onPortal = async () => {
    setBusy(true);
    try {
      const url = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      toastError(apiError(err));
      setBusy(false);
    }
  };

  if (loading && !data) return <PageLoader label="Loading billing…" />;
  if (error && !data) return <PageError message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const seats = data.seats;
  const sub = data.subscription;
  const paidPendingApproval =
    Boolean(sub?.allows_allocation) && data.community.review_status === "pending";
  const seatLimitLabel = seats.seat_limit > 0 ? String(seats.seat_limit) : "—";

  return (
    <div className="space-y-6">
      {(confirmingCheckout || searchParams.get("checkout") === "cancel" || busy) && (
        <div
          className={[
            "rounded-2xl border px-4 py-3 text-[13px]",
            searchParams.get("checkout") === "cancel"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-sky-200 bg-sky-50 text-sky-900",
          ].join(" ")}
        >
          {searchParams.get("checkout") === "cancel"
            ? "Checkout canceled. Your community does not have a new subscription yet."
            : confirmingCheckout
              ? "Confirming payment… this usually takes a few seconds."
              : busy && searchParams.get("plan")
                ? "Starting checkout for your selected plan…"
                : null}
        </div>
      )}

      {sub?.in_grace ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          Payment failed. Update your payment method before{" "}
          {sub.grace_ends_at ? new Date(sub.grace_ends_at).toLocaleDateString() : "the grace period ends"}{" "}
          to keep inviting residents.
          {data.billing.stripe_configured ? (
            <button type="button" onClick={() => void onPortal()} className="ml-2 font-semibold underline">
              Update payment
            </button>
          ) : null}
        </div>
      ) : null}

      {paidPendingApproval ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[13px] text-indigo-950">
          Paid — waiting for platform approval. Invites unlock once your community is approved.
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Community subscription
            </p>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">
              {data.community.name}
            </h1>
            <p className="mt-1 max-w-xl text-[13px] text-slate-500">
              One subscription covers your whole community. Residents do not pay Havena — you invite
              them into your seat pool.
            </p>
          </div>
          <div className="rounded-2xl bg-[#F0FDFA] px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seats used</p>
            <p className="text-[28px] font-semibold tabular-nums text-slate-900">
              {seats.seats_used}
              <span className="text-[16px] font-medium text-slate-500"> / {seatLimitLabel}</span>
            </p>
            <p className="text-[12px] text-slate-500">{statusLabel(sub?.status ?? null)}</p>
          </div>
        </div>

        {sub ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan</p>
              <p className="text-[13px] font-semibold text-slate-800">{sub.plan_name}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Renews</p>
              <p className="text-[13px] font-semibold text-slate-800">
                {sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Interval</p>
              <p className="text-[13px] font-semibold capitalize text-slate-800">
                {sub.billing_interval}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {data.setup.can_invite_residents ? (
            <Link
              href="/admin/members"
              className="inline-flex rounded-xl bg-[#0A2A43] px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Invite residents
            </Link>
          ) : (
            <span className="inline-flex rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-400">
              Invite residents
            </span>
          )}
          {sub?.stripe_customer_id && data.billing.stripe_configured ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onPortal()}
              className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Manage payment & invoices
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-2 text-[14px] font-semibold text-slate-900">Community setup</h2>
          <ul className="space-y-2">
            <ChecklistItem
              done={data.setup.community_details_complete}
              label="Community details complete"
            />
            <ChecklistItem
              done={data.setup.community_approved}
              label="Community approved"
              hint={
                data.community.review_status === "pending"
                  ? "We’re reviewing your community."
                  : undefined
              }
            />
            <ChecklistItem
              done={data.setup.subscription_active}
              label="Subscription active"
              hint="Required before inviting residents"
            />
            <ChecklistItem
              done={data.setup.subscription_active && seats.seats_used > 0}
              label="Invite first residents"
              hint={
                data.setup.subscription_active
                  ? `${seats.seats_used} of ${seats.seat_limit} seats filled`
                  : "Choose a plan first"
              }
            />
          </ul>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-slate-900">Choose a plan</h2>
              {estimatedHint ? (
                <p className="mt-1 text-[12px] text-slate-500">{estimatedHint}</p>
              ) : (
                <p className="mt-1 text-[12px] text-slate-500">
                  Pick the seat pack that fits your community size.
                </p>
              )}
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              {(["month", "year"] as BillingInterval[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInterval(value)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize",
                    interval === value
                      ? "bg-[#0A2A43] text-white"
                      : "text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {value === "month" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.plans.map((plan) => (
              <PlanCard
                key={plan.slug}
                plan={plan}
                interval={interval}
                selected={selected === plan.slug}
                busy={busy}
                isCurrent={sub?.plan_slug === plan.slug && sub.allows_allocation}
                canChange={Boolean(sub?.allows_allocation)}
                onSelect={() => setSelected(plan.slug)}
                onCheckout={() => void onCheckout(plan.slug)}
              />
            ))}
          </div>

          {data.billing.driver === "manual" ? (
            <p className="mt-3 text-[12px] text-slate-500">
              Local billing driver is active — choosing a plan activates immediately without Stripe.
            </p>
          ) : !data.billing.stripe_configured ? (
            <p className="mt-3 text-[12px] text-amber-700">
              Stripe is not configured. Add test-mode keys in the API `.env` before taking payments.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading billing…" />}>
      <BillingPageInner />
    </Suspense>
  );
}
