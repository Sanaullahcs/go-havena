"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { apiError } from "@/lib/api/client";
import {
  changeBillingPlan,
  confirmBillingCheckout,
  fetchBilling,
  formatMoney,
  openBillingPortal,
  type BillingInterval,
  type BillingPayload,
  type BillingPlan,
} from "@/lib/api/billing";
import { toastError, toastSuccess } from "@/lib/alert";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import {
  canAccessCommunityDashboard,
  getCommunityAdminNextStep,
  getToken,
  getUser,
  updateUser,
} from "@/lib/auth/session";
import { cameFromMobileApp, withAppReturnParams } from "@/lib/auth/app-return";

const TRIAL_DAYS = 30;

function planTrialDays(plan?: Pick<BillingPlan, "trial_period_days"> | null, fallback = TRIAL_DAYS) {
  return typeof plan?.trial_period_days === "number" ? plan.trial_period_days : fallback;
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Free trial";
    case "grace":
    case "past_due":
      return "Payment past due";
    case "pending_trial":
      return "Card saved — trial starts after approval";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    default:
      return status ? status.replace(/_/g, " ") : "No subscription";
  }
}

function planHighlights(_plan: BillingPlan) {
  return ["Admin dashboard & invites", "Notices, events & feed", "Residents join free", "Cancel anytime during trial"];
}

function CompactTrialBanner({ communityName, trialDays }: { communityName: string; trialDays: number }) {
  const steps = [
    { label: "Today", value: "Save card" },
    { label: "After approval", value: `${trialDays}-day trial` },
    { label: `Day ${trialDays + 1}+`, value: "Billing starts" },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-teal-200/70 bg-gradient-to-br from-[#0A2A43] via-[#0c3550] to-teal-800 text-white shadow-md shadow-teal-900/10">
      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-teal-400/15 blur-2xl"
          aria-hidden
        />

        <div className="relative space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-100 ring-1 ring-white/15">
              <Sparkles className="h-3 w-3" aria-hidden />
              {trialDays}-day free trial
            </span>
            <span className="truncate text-[12px] font-medium text-white/70">{communityName}</span>
          </div>

          <div>
            <h2 className="font-[family-name:var(--font-brand)] text-xl font-bold leading-tight tracking-tight sm:text-2xl">
              Start at <span className="text-teal-200">$0 today</span>
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/75">
              Add a card today. Your {trialDays}-day trial starts after a system admin approves you — you won&apos;t be charged until that trial ends.
            </p>
          </div>

          <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {steps.map((step, index) => (
              <li
                key={step.label}
                className="rounded-xl bg-white/10 px-2 py-2 text-center ring-1 ring-white/10 sm:px-3 sm:py-2.5"
              >
                <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-100/90 sm:text-[10px]">
                  {index + 1}. {step.label}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-white sm:text-[13px]">{step.value}</p>
              </li>
            ))}
          </ol>

          <ul className="flex flex-col gap-1.5 border-t border-white/10 pt-3 text-[11px] text-white/70 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-[12px]">
            <li className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden />
              Cancel anytime during trial
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden />
              Secured by Stripe
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden />
              Residents never pay Havena
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function BillingIntervalToggle({
  interval,
  onChange,
  className = "",
}: {
  interval: BillingInterval;
  onChange: (value: BillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      className={[
        "inline-flex w-full max-w-sm rounded-full border border-slate-200 bg-slate-100 p-1 sm:w-auto sm:max-w-none",
        className,
      ].join(" ")}
      role="group"
      aria-label="Billing interval"
    >
      {(["month", "year"] as BillingInterval[]).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={[
            "flex-1 rounded-full px-4 py-2 text-[12px] font-semibold transition sm:flex-none sm:min-w-[7.5rem]",
            interval === value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
        >
          {value === "month" ? "Monthly" : "Yearly"}
          {value === "year" ? (
            <span
              className={[
                "ml-1.5 text-[10px] font-bold uppercase tracking-wide",
                interval === "year" ? "text-teal-700" : "text-teal-600",
              ].join(" ")}
            >
              Save
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function OnboardingPlanOption({
  plan,
  interval,
  selected,
  onSelect,
}: {
  plan: BillingPlan;
  interval: BillingInterval;
  selected: boolean;
  onSelect: () => void;
}) {
  const price = interval === "year" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const periodShort = interval === "year" ? "yr" : "mo";
  const yearlySavings =
    interval === "year"
      ? Math.max(0, plan.price_monthly_cents * 12 - plan.price_yearly_cents)
      : 0;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "relative flex h-full w-full min-w-0 flex-col rounded-2xl border p-4 text-left transition-all duration-200 sm:p-5",
        selected
          ? "border-teal-500 bg-gradient-to-b from-teal-50 to-white shadow-md ring-2 ring-teal-500/20"
          : "border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm",
        plan.recommended && !selected ? "border-teal-200" : "",
        plan.recommended ? "md:-translate-y-1" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {plan.recommended ? (
            <span className="mb-2 inline-flex rounded-full bg-[#0A2A43] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
              Recommended
            </span>
          ) : null}
          <p className="text-[17px] font-bold leading-tight text-slate-900">{plan.name}</p>
          <p className="mt-1 text-[12px] leading-snug text-slate-500">{plan.description}</p>
        </div>
        <span
          className={[
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-teal-600 bg-teal-600" : "border-slate-300 bg-white",
          ].join(" ")}
          aria-hidden
        >
          {selected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/70 px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Due today</p>
        <p className="mt-1 font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-none text-teal-800">
          $0
        </p>
        <p className="mt-2 text-[12px] leading-snug text-slate-600">
          Then{" "}
          <span className="font-semibold text-slate-900">
            {formatMoney(price, plan.currency)}/{periodShort}
          </span>{" "}
          after {planTrialDays(plan)} days
        </p>
        {yearlySavings > 0 ? (
          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
            Save {formatMoney(yearlySavings, plan.currency)}/yr vs monthly
          </p>
        ) : null}
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
        <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        {plan.seat_limit} resident seats
      </p>

      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {planHighlights(plan).map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12px] leading-snug text-slate-600">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </button>
  );
}

function OnboardingPlanPicker({
  plans,
  interval,
  selected,
  busy,
  checkoutDisabled,
  onSelect,
  onCheckout,
  onIntervalChange,
  estimatedHint,
}: {
  plans: BillingPlan[];
  interval: BillingInterval;
  selected: string | null;
  busy: boolean;
  checkoutDisabled: boolean;
  onSelect: (slug: string) => void;
  onCheckout: (slug: string) => void;
  onIntervalChange: (value: BillingInterval) => void;
  estimatedHint: string | null;
}) {
  const selectedPlan = plans.find((p) => p.slug === selected) ?? plans[0] ?? null;
  const selectedPrice = selectedPlan
    ? interval === "year"
      ? selectedPlan.price_yearly_cents
      : selectedPlan.price_monthly_cents
    : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-slate-900">Select a plan</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            {estimatedHint ??
              `Every plan includes a ${planTrialDays(selectedPlan)}-day trial. Add a card now — the trial clock starts only after a system admin approves you.`}
          </p>
        </div>
        <BillingIntervalToggle interval={interval} onChange={onIntervalChange} />
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3"
        role="radiogroup"
        aria-label="Subscription plans"
      >
        {plans.map((plan) => (
          <OnboardingPlanOption
            key={plan.slug}
            plan={plan}
            interval={interval}
            selected={selected === plan.slug}
            onSelect={() => onSelect(plan.slug)}
          />
        ))}
      </div>

      {selectedPlan ? (
        <>
          <button
            type="button"
            disabled={busy || checkoutDisabled}
            onClick={() => onCheckout(selectedPlan.slug)}
            className="hidden h-12 w-full items-center justify-center rounded-xl bg-teal-600 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex"
          >
            {busy ? "Starting checkout…" : `Continue to card details →`}
          </button>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm md:hidden">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-900">{selectedPlan.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  $0 today · then {formatMoney(selectedPrice, selectedPlan.currency)}/
                  {interval === "year" ? "yr" : "mo"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || checkoutDisabled}
                onClick={() => onCheckout(selectedPlan.slug)}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 px-4 text-[13px] font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Starting…" : "Add card"}
              </button>
            </div>
          </div>
          <div className="h-20 md:hidden" aria-hidden />
        </>
      ) : null}

      <p className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-[12px]">
        By continuing you agree to enter a card. Havena charges that card after {planTrialDays(selectedPlan)} days
        unless you cancel. Secure checkout powered by Stripe.
      </p>
    </section>
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
  onboarding,
}: {
  plan: BillingPlan;
  interval: BillingInterval;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCheckout: () => void;
  isCurrent: boolean;
  canChange: boolean;
  onboarding: boolean;
}) {
  const price = interval === "year" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const periodShort = interval === "year" ? "yr" : "mo";

  return (
    <article
      className={[
        "relative flex h-full flex-col rounded-2xl border p-5 transition-all duration-200",
        selected
          ? "border-teal-500 bg-gradient-to-b from-teal-50/90 to-white shadow-md ring-2 ring-teal-500/25"
          : "border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm",
        plan.recommended && !selected ? "border-teal-200/80" : "",
      ].join(" ")}
    >
      {plan.recommended ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0A2A43] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
          Recommended
        </span>
      ) : null}

      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="text-[16px] font-bold text-slate-900">{plan.name}</p>
        <p className="mt-1 min-h-[2.5rem] text-[12px] leading-relaxed text-slate-500">{plan.description}</p>

        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 px-3.5 py-3">
          {onboarding ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">Due today</p>
              <p className="mt-0.5 font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-none tracking-tight text-teal-800">
                $0
              </p>
              <p className="mt-2 text-[12px] text-slate-600">
                Then{" "}
                <span className="font-semibold text-slate-800">
                  {formatMoney(price, plan.currency)}/{periodShort}
                </span>{" "}
                after your {planTrialDays(plan)}-day free trial
              </p>
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-none tracking-tight text-slate-900">
                {formatMoney(price, plan.currency)}
                <span className="text-[14px] font-medium text-slate-500">/{periodShort}</span>
              </p>
              {plan.recommended ? (
                <p className="mt-2 text-[12px] font-medium text-teal-700">Includes {planTrialDays(plan)}-day free trial</p>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
          <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            <strong className="font-semibold text-slate-800">{plan.seat_limit}</strong> resident seats
          </span>
        </div>
      </button>

      <div className="mt-auto pt-5">
        {isCurrent ? (
          <span className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-3 text-[13px] font-semibold text-emerald-700">
            <Check className="h-4 w-4" aria-hidden />
            Current plan
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onCheckout}
            className={[
              "flex w-full items-center justify-center rounded-xl px-4 py-3 text-[13px] font-semibold transition",
              busy
                ? "cursor-wait bg-slate-100 text-slate-400"
                : selected
                  ? "bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                  : "bg-[#0A2A43] text-white hover:bg-[#0d3a5a]",
            ].join(" ")}
          >
            {busy ? "Starting checkout…" : canChange ? "Switch to this plan" : onboarding ? "Continue to card details →" : "Add card"}
          </button>
        )}
      </div>
    </article>
  );
}

function SetupChecklist({
  billingReady,
  data,
  seats,
  compact = false,
}: {
  billingReady: boolean;
  data: BillingPayload;
  seats: BillingPayload["seats"];
  compact?: boolean;
}) {
  const items = [
    {
      done: data.setup.community_details_complete,
      label: "Community details",
      hint: data.community.name,
    },
    {
      done: billingReady,
      label: "Billing & free trial",
      hint: data.setup.subscription_active
        ? "Trial active"
        : data.setup.trial_pending_approval || data.setup.card_on_file
          ? "Card saved · trial starts after approval"
          : `$0 today · trial starts after approval`,
      active: !billingReady,
    },
    {
      done: data.setup.community_approved,
      label: "System approval",
      hint:
        data.community.review_status === "pending"
          ? "Waiting for Havena review"
          : "Platform sign-off",
    },
    {
      done: data.setup.can_invite_residents,
      label: "Invite residents",
      hint: billingReady
        ? `${seats.seats_used} of ${seats.seat_limit || "—"} seats used`
        : "Unlocks after trial + approval",
    },
  ];

  return (
    <ul
      className={
        compact
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          : "grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      }
    >
      {items.map((item) => (
        <li
          key={item.label}
          className={[
            "flex items-start gap-3 rounded-xl border px-3.5 py-3",
            item.active
              ? "border-teal-200 bg-teal-50/50"
              : item.done
                ? "border-teal-100 bg-white"
                : "border-slate-100 bg-slate-50/50",
          ].join(" ")}
        >
          <span
            className={[
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              item.done
                ? "bg-teal-600 text-white"
                : item.active
                  ? "bg-white text-teal-700 ring-2 ring-teal-500/30"
                  : "bg-slate-200 text-slate-500",
            ].join(" ")}
          >
            {item.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : "•"}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">{item.label}</p>
            {item.hint ? <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{item.hint}</p> : null}
          </div>
        </li>
      ))}
    </ul>
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
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const confirmAttemptedRef = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!getToken()) {
      setLoading(false);
      return null;
    }
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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    const user = getUser();
    if (canAccessCommunityDashboard(user)) return;

    const step = getCommunityAdminNextStep(user);
    if (step !== "complete_billing_web") {
      if (cameFromMobileApp() && (step === "await_approval" || step === "rejected")) {
        router.replace(withAppReturnParams("/admin/billing/done"));
        return;
      }
      router.replace(communityAdminOnboardingPath(step));
    }
  }, [router]);

  const clearCheckoutQuery = useCallback(() => {
    router.replace(withAppReturnParams("/admin/billing"));
  }, [router]);

  const redirectAfterBillingReady = useCallback(async () => {
    try {
      const me = await fetchMe();
      updateUser(meToSessionUser(me));
      const step = getCommunityAdminNextStep(getUser());
      if (cameFromMobileApp()) {
        router.replace(withAppReturnParams("/admin/billing/done"));
        return;
      }
      if (step === "await_approval" || step === "rejected") {
        router.replace("/admin/pending-approval");
        return;
      }
      if (step === "ready") {
        router.replace("/admin");
        return;
      }
    } catch {
      // Stay on billing if /me fails.
    }
    clearCheckoutQuery();
  }, [router, clearCheckoutQuery]);

  const onCheckout = useCallback(
    async (planSlug: string, billingInterval?: BillingInterval) => {
      if (!data) return;
      const nextInterval = billingInterval ?? interval;
      setBusy(true);
      try {
        const hasActive = data.setup.subscription_active;
        if (!hasActive && !data.billing.stripe_configured) {
          toastError("Card checkout is unavailable until Stripe is configured. A trial cannot start without a card.");
          return;
        }
        if (hasActive && data.subscription) {
          const next = await changeBillingPlan({
            plan_slug: planSlug,
            interval: nextInterval,
          });
          setData(next);
          toastSuccess("Plan updated.");
          return;
        }

        router.push(
          withAppReturnParams(
            `/admin/billing/pay?plan=${encodeURIComponent(planSlug)}&interval=${nextInterval}`,
          ),
        );
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setBusy(false);
      }
    },
    [data, interval, router],
  );

  // After Stripe return: confirm session even if webhook is delayed.
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkout === "cancel") {
      setConfirmMessage("Checkout canceled. Your community does not have a new subscription yet.");
      return;
    }

    if (checkout !== "success" || !sessionId) return;
    if (confirmAttemptedRef.current === sessionId) return;
    confirmAttemptedRef.current = sessionId;

    let cancelled = false;
    setConfirmingCheckout(true);
    setConfirmMessage("Confirming your free trial… this usually takes a few seconds.");

    (async () => {
      try {
        const payload = await confirmBillingCheckout(sessionId);
        if (cancelled) return;
        setData(payload);

        const status = payload.subscription?.status;
        const cardSaved =
          payload.setup.card_on_file ||
          payload.setup.trial_pending_approval ||
          status === "pending_trial";
        const ready =
          payload.setup.subscription_active ||
          status === "trialing" ||
          status === "active";

        if (ready || cardSaved) {
          toastSuccess(
            ready
              ? "30-day free trial started. You won’t be charged until the trial ends."
              : "Card saved. Your 30-day free trial starts when a system administrator approves your account.",
          );
          await redirectAfterBillingReady();
          return;
        }

        setConfirmMessage(
          "Checkout returned, but the subscription is still processing. Waiting for Stripe…",
        );

        for (let i = 0; i < 8 && !cancelled; i += 1) {
          await new Promise((r) => setTimeout(r, 1500));
          const polled = await fetchBilling().catch(() => null);
          if (!polled) continue;
          setData(polled);
          const polledReady =
            polled.setup.subscription_active ||
            polled.setup.card_on_file ||
            polled.setup.trial_pending_approval ||
            polled.subscription?.status === "pending_trial" ||
            polled.subscription?.status === "trialing" ||
            polled.subscription?.status === "active";
          if (polledReady) {
            toastSuccess(
              polled.setup.subscription_active || polled.subscription?.status === "trialing"
                ? "30-day free trial started."
                : "Card saved. Your 30-day free trial starts after approval.",
            );
            await redirectAfterBillingReady();
            return;
          }
        }

        toastError(
          "We couldn’t confirm the subscription yet. Refresh this page in a moment, or contact support if it stays incomplete.",
        );
        clearCheckoutQuery();
      } catch (err) {
        if (cancelled) return;
        toastError(apiError(err));
        clearCheckoutQuery();
      } finally {
        if (!cancelled) {
          setConfirmingCheckout(false);
          setConfirmMessage(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, redirectAfterBillingReady, clearCheckoutQuery]);

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
      router.replace(withAppReturnParams("/admin/billing"));
      return;
    }

    autoStartedRef.current = true;
    void onCheckout(plan, nextInterval);
  }, [data, busy, searchParams, onCheckout, router]);

  const estimatedHint = useMemo(() => {
    if (!data?.community.estimated_residents) return null;
    const plan = data.plans.find((p) => p.slug === data.recommended_plan);
    if (!plan) return null;
    return `You estimated ~${data.community.estimated_residents} residents → ${plan.name} (${plan.seat_limit} seats) recommended.`;
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

  if (loading && !data) return <PageLoader text="Loading billing…" />;
  if (error && !data) return <PageError message={error} onRetry={() => void load()} />;
  if (!data) return null;

  const seats = data.seats;
  const sub = data.subscription;
  const billingReady = Boolean(data.setup.subscription_active);
  const cardSavedAwaitingApproval = Boolean(
    data.setup.trial_pending_approval || (data.setup.card_on_file && !billingReady),
  );
  const paidPendingApproval = cardSavedAwaitingApproval || (billingReady && data.community.review_status === "pending");
  const checkoutComplete = billingReady || cardSavedAwaitingApproval;
  const seatLimitLabel = seats.seat_limit > 0 ? String(seats.seat_limit) : "—";

  return (
    <div className="mx-auto w-full min-w-0 max-w-full space-y-4 overflow-x-hidden pb-6 sm:max-w-6xl sm:space-y-5">
      <header className={checkoutComplete ? undefined : "mt-0.5 sm:mt-1"}>
        {checkoutComplete ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Billing</p>
        ) : null}
        <h1
          className={[
            "font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-2xl",
            checkoutComplete ? "mt-1 sm:text-3xl" : "",
          ].join(" ")}
        >
          {checkoutComplete ? "Community subscription" : "Choose your plan"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-600 sm:mt-2 sm:text-sm">
          {checkoutComplete
            ? "One Havena subscription covers your whole community. Residents never pay Havena — you invite them into your seat pool."
            : "Compare seat packs, then add a card. Your free trial starts after a system administrator approves you — $0 today."}
        </p>
      </header>

      {(confirmingCheckout || confirmMessage || busy) && (
        <div
          className={[
            "rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed",
            searchParams.get("checkout") === "cancel"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-teal-200 bg-teal-50 text-teal-950",
          ].join(" ")}
        >
          {confirmMessage ||
            (busy && searchParams.get("plan")
              ? "Starting checkout for your selected plan…"
              : confirmingCheckout
                ? "Confirming your free trial…"
                : null)}
        </div>
      )}

      {sub?.in_grace ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] text-amber-950">
          Payment failed. Update your payment method before{" "}
          {sub.grace_ends_at
            ? new Date(sub.grace_ends_at).toLocaleDateString()
            : "the grace period ends"}{" "}
          to keep inviting residents.
          {data.billing.stripe_configured ? (
            <button
              type="button"
              onClick={() => void onPortal()}
              className="ml-2 font-semibold underline"
            >
              Update payment
            </button>
          ) : null}
        </div>
      ) : null}

      {paidPendingApproval ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-[13px] text-teal-950">
          {cardSavedAwaitingApproval
            ? "Your card is saved. The 30-day free trial starts when a system administrator approves your profile and community — you will not be charged before then."
            : "Your free trial is active — waiting for platform approval. Dashboard access unlocks once a system administrator approves your profile and community."}
          <Link href="/admin/pending-approval" className="ml-2 font-semibold underline">
            View status
          </Link>
        </div>
      ) : null}

      {!checkoutComplete ? (
        <CompactTrialBanner
          communityName={data.community.name}
          trialDays={data.trial_period_days ?? TRIAL_DAYS}
        />
      ) : null}

      {checkoutComplete ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Community
              </p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-slate-900">
                {data.community.name}
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">{statusLabel(sub?.status ?? null)}</p>
            </div>
            <div className="rounded-2xl bg-teal-50 px-4 py-3 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Seats used
              </p>
              <p className="text-[28px] font-semibold tabular-nums text-slate-900">
                {seats.seats_used}
                <span className="text-[16px] font-medium text-slate-500"> / {seatLimitLabel}</span>
              </p>
            </div>
          </div>

          {sub ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Plan</p>
                <p className="text-[13px] font-semibold text-slate-800">{sub.plan_name}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  {sub.status === "trialing" ? "Trial ends" : sub.status === "pending_trial" ? "Trial starts" : "Renews"}
                </p>
                <p className="text-[13px] font-semibold text-slate-800">
                  {sub.status === "pending_trial"
                    ? "After approval"
                    : sub.current_period_end
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
      ) : null}

      {!checkoutComplete ? (
        <>
          <OnboardingPlanPicker
            plans={data.plans}
            interval={interval}
            selected={selected}
            busy={busy}
            checkoutDisabled={!data.billing.stripe_configured}
            onSelect={setSelected}
            onCheckout={(slug) => void onCheckout(slug)}
            onIntervalChange={setInterval}
            estimatedHint={estimatedHint}
          />
          {!data.billing.stripe_configured ? (
            <p className="text-[12px] text-amber-700">
              Card checkout is not available until Stripe test keys are configured. A free trial cannot start without a card.
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">
              Next you’ll enter card details. $0 is due today — the trial clock starts after approval.
            </p>
          )}
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">Plans</h2>
              {estimatedHint ? (
                <p className="mt-1 text-[13px] text-slate-500">{estimatedHint}</p>
              ) : null}
            </div>
            <BillingIntervalToggle interval={interval} onChange={setInterval} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.plans.map((plan) => (
              <PlanCard
                key={plan.slug}
                plan={plan}
                interval={interval}
                selected={selected === plan.slug}
                busy={busy}
                onboarding={false}
                isCurrent={sub?.plan_slug === plan.slug && Boolean(sub?.allows_allocation)}
                canChange={Boolean(sub?.allows_allocation)}
                onSelect={() => setSelected(plan.slug)}
                onCheckout={() => void onCheckout(plan.slug)}
              />
            ))}
          </div>

          {data.billing.stripe_configured ? null : (
            <p className="text-[12px] text-amber-700">
              Stripe is not configured. Card details are required before a trial can start.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2.5 sm:space-y-3">
        <h2 className="text-[13px] font-semibold text-slate-900 sm:text-[14px]">What happens next</h2>
        <SetupChecklist
          billingReady={checkoutComplete}
          data={data}
          seats={seats}
          compact={!checkoutComplete}
        />
      </section>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader text="Loading billing…" />}>
      <BillingPageInner />
    </Suspense>
  );
}
