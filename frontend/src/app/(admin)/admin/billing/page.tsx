"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CreditCard,
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
import { isWebHandoffPending } from "@/lib/auth/web-handoff";

const TRIAL_DAYS = 30;

function planTrialDays(plan?: Pick<BillingPlan, "trial_period_days"> | null, fallback = TRIAL_DAYS) {
  return typeof plan?.trial_period_days === "number" ? plan.trial_period_days : fallback;
}

function communityTrialEligible(data: BillingPayload): boolean {
  if (data.subscription?.trial_consumed) return false;
  return (data.trial_period_days ?? TRIAL_DAYS) > 0;
}

function statusLabel(
  status: string | null | undefined,
  leftover = false,
  cancelAtPeriodEnd = false,
) {
  if (leftover) return "Leftover period";
  if (cancelAtPeriodEnd && (status === "active" || status === "trialing")) {
    return status === "trialing" ? "Trial ending" : "Canceling";
  }
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

function statusTone(
  status: string | null | undefined,
  leftover = false,
  cancelAtPeriodEnd = false,
) {
  if (leftover) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (cancelAtPeriodEnd && (status === "active" || status === "trialing")) {
    return "bg-rose-50 text-rose-800 ring-rose-200";
  }
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "trialing":
      return "bg-teal-50 text-teal-800 ring-teal-200";
    case "pending_trial":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    case "grace":
    case "past_due":
    case "unpaid":
      return "bg-orange-50 text-orange-800 ring-orange-200";
    case "canceled":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function formatBillingDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

function planHighlights(_plan: BillingPlan, trialEligible: boolean) {
  if (trialEligible) {
    return ["Admin dashboard & invites", "Notices, events & feed", "Residents join free", "Cancel anytime during trial"];
  }
  return ["Admin dashboard & invites", "Notices, events & feed", "Residents join free", "Cancel anytime from billing"];
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

function CompactPaidResumeBanner({ communityName }: { communityName: string }) {
  const steps = [
    { label: "Today", value: "Save card" },
    { label: "After approval", value: "Paid plan starts" },
    { label: "Ongoing", value: "Monthly billing" },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0A2A43] via-[#123652] to-slate-700 text-white shadow-md shadow-slate-900/10">
      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-slate-400/10 blur-2xl"
          aria-hidden
        />

        <div className="relative space-y-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-100 ring-1 ring-white/15">
              <CreditCard className="h-3 w-3" aria-hidden />
              Paid subscription
            </span>
            <span className="truncate text-[12px] font-medium text-white/70">{communityName}</span>
          </div>

          <div>
            <h2 className="font-[family-name:var(--font-brand)] text-xl font-bold leading-tight tracking-tight sm:text-2xl">
              Restart billing on your plan
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/75">
              Your community already used its one-time free trial. Add a card to resume a paid subscription — billing
              starts after a system administrator approves you.
            </p>
          </div>

          <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {steps.map((step, index) => (
              <li
                key={step.label}
                className="rounded-xl bg-white/10 px-2 py-2 text-center ring-1 ring-white/10 sm:px-3 sm:py-2.5"
              >
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-100/90 sm:text-[10px]">
                  {index + 1}. {step.label}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-white sm:text-[13px]">{step.value}</p>
              </li>
            ))}
          </ol>

          <ul className="flex flex-col gap-1.5 border-t border-white/10 pt-3 text-[11px] text-white/70 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:text-[12px]">
            <li className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
              No second free trial
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
              Secured by Stripe
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
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
  trialEligible,
}: {
  plan: BillingPlan;
  interval: BillingInterval;
  selected: boolean;
  onSelect: () => void;
  trialEligible: boolean;
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
        {trialEligible ? (
          <>
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
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Plan price</p>
            <p className="mt-1 font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-none text-teal-800">
              {formatMoney(price, plan.currency)}
              <span className="text-[14px] font-medium text-slate-500">/{periodShort}</span>
            </p>
            <p className="mt-2 text-[12px] leading-snug text-slate-600">
              Paid subscription after approval. Your community&apos;s free trial was already used.
            </p>
          </>
        )}
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
        {planHighlights(plan, trialEligible).map((item) => (
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
  trialEligible,
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
  trialEligible: boolean;
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
              (trialEligible
                ? `Every plan includes a ${planTrialDays(selectedPlan)}-day trial. Add a card now — the trial clock starts only after a system admin approves you.`
                : "Your community already used its one-time free trial. Choose a plan and add a card to restart paid billing after approval.")}
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
            trialEligible={trialEligible}
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
                  {trialEligible
                    ? `$0 today · then ${formatMoney(selectedPrice, selectedPlan.currency)}/${interval === "year" ? "yr" : "mo"}`
                    : `${formatMoney(selectedPrice, selectedPlan.currency)}/${interval === "year" ? "yr" : "mo"} after approval`}
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
        {trialEligible
          ? `By continuing you agree to enter a card. Havena charges that card after ${planTrialDays(selectedPlan)} days unless you cancel. Secure checkout powered by Stripe.`
          : "By continuing you agree to enter a card for a paid subscription. Billing starts after system approval. Secure checkout powered by Stripe."}
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

        <div className="mt-4 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white px-3.5 py-3.5">
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
  trialEligible,
}: {
  billingReady: boolean;
  data: BillingPayload;
  seats: BillingPayload["seats"];
  compact?: boolean;
  trialEligible: boolean;
}) {
  const items = [
    {
      done: data.setup.community_details_complete,
      label: "Community details",
      hint: data.community.name,
    },
    {
      done: billingReady,
      label: trialEligible ? "Billing & free trial" : "Billing",
      hint: data.setup.subscription_active
        ? trialEligible
          ? "Trial active"
          : "Paid subscription active"
        : data.setup.trial_pending_approval || data.setup.card_on_file
          ? trialEligible
            ? "Card saved · trial starts after approval"
            : "Card saved · paid billing starts after approval"
          : trialEligible
            ? "$0 today · trial starts after approval"
            : "Add card · paid billing after approval",
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
        : trialEligible
          ? "Unlocks after trial + approval"
          : "Unlocks after paid billing + approval",
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
    const refreshAfterPortal = () => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    };

    window.addEventListener("focus", refreshAfterPortal);
    document.addEventListener("visibilitychange", refreshAfterPortal);

    return () => {
      window.removeEventListener("focus", refreshAfterPortal);
      document.removeEventListener("visibilitychange", refreshAfterPortal);
    };
  }, [load]);

  useEffect(() => {
    if (isWebHandoffPending()) return;

    const token = getToken();
    if (!token) {
      const qs = typeof window !== "undefined" ? window.location.search : "";
      router.replace(qs ? `/login${qs}` : "/login");
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
  const leftover = Boolean(sub?.has_leftover_service);
  const needsReplacementCard = Boolean(sub?.requires_replacement_card || data.setup.requires_replacement_card);
  const paidPendingApproval = cardSavedAwaitingApproval || (billingReady && data.community.review_status === "pending");
  const checkoutComplete = (billingReady || cardSavedAwaitingApproval || leftover) && !needsReplacementCard;
  const seatLimitLabel = seats.seat_limit > 0 ? String(seats.seat_limit) : "—";
  const trialEligible = communityTrialEligible(data);
  const effectiveTrialDays = trialEligible ? (data.trial_period_days ?? TRIAL_DAYS) : 0;
  const cancelScheduled = Boolean(sub?.cancel_at_period_end);
  const statusBannerText =
    confirmMessage ||
    (busy && searchParams.get("plan")
      ? "Starting checkout for your selected plan…"
      : busy
        ? "Opening billing portal…"
        : confirmingCheckout
          ? trialEligible
            ? "Confirming your free trial…"
            : "Confirming your subscription…"
          : null);

  return (
    <div className="space-y-6">
      <header className={checkoutComplete ? undefined : "mt-0.5 sm:mt-1"}>
        {checkoutComplete ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">Billing</p>
        ) : null}
        <h1
          className={[
            "font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-2xl",
            checkoutComplete ? "mt-1 sm:text-[2rem] sm:leading-tight" : "",
          ].join(" ")}
        >
          {checkoutComplete ? "Community subscription" : "Choose your plan"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-600 sm:mt-2 sm:text-[15px]">
          {checkoutComplete
            ? "One Havena subscription covers your whole community. Residents never pay Havena — you invite them into your seat pool."
            : trialEligible
              ? "Compare seat packs, then add a card. Your free trial starts after a system administrator approves you — $0 today."
              : "Compare seat packs, then add a card. Your community already used its free trial — paid billing starts after approval."}
        </p>
      </header>

      {statusBannerText ? (
        <div
          className={[
            "rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed",
            searchParams.get("checkout") === "cancel"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-teal-200 bg-teal-50 text-teal-950",
          ].join(" ")}
        >
          {statusBannerText}
        </div>
      ) : null}

      {leftover ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] leading-relaxed text-amber-950">
          This community is finishing the leftover days of the previous subscription
          {sub?.leftover_ends_at ? ` until ${formatBillingDate(sub.leftover_ends_at)}` : ""}. The previous
          admin is not being charged. You can keep using the community until then — add your card and choose a
          plan when that period ends.
        </div>
      ) : null}

      {cancelScheduled && sub?.status !== "canceled" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] text-rose-950">
          Your subscription is scheduled to cancel on{" "}
          {formatBillingDate(sub.current_period_end)}. You keep access until then and will not be charged again
          after that date.
          {data.billing.stripe_configured ? (
            <button
              type="button"
              onClick={() => void onPortal()}
              className="ml-2 font-semibold underline"
            >
              Resume subscription
            </button>
          ) : null}
        </div>
      ) : null}

      {sub?.in_grace && !leftover && !sub?.admin_transition ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13px] text-amber-950">
          Payment failed. Update your payment method before{" "}
          {sub.grace_ends_at ? formatBillingDate(sub.grace_ends_at) : "the grace period ends"}{" "}
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
            ? trialEligible
              ? "Your card is saved. The 30-day free trial starts when a system administrator approves your profile and community — you will not be charged before then."
              : "Your card is saved. Paid billing starts when a system administrator approves your profile and community — no free trial remains for this community."
            : trialEligible
              ? "Your free trial is active — waiting for platform approval. Dashboard access unlocks once a system administrator approves your profile and community."
              : "Your paid subscription is active — waiting for platform approval. Dashboard access unlocks once a system administrator approves your profile and community."}
          <Link href="/admin/pending-approval" className="ml-2 font-semibold underline">
            View status
          </Link>
        </div>
      ) : null}

      {!checkoutComplete && !needsReplacementCard ? (
        trialEligible ? (
          <CompactTrialBanner communityName={data.community.name} trialDays={effectiveTrialDays} />
        ) : (
          <CompactPaidResumeBanner communityName={data.community.name} />
        )
      ) : null}

      {needsReplacementCard ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-[13px] text-teal-950">
          The leftover period has ended. Add your card to keep this community on Havena. The current plan is
          pre-selected — you can keep it or choose another plan that fits your resident count.
        </div>
      ) : null}

      {checkoutComplete ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-[#0A2A43] via-teal-600 to-teal-400" aria-hidden />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Current subscription
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <h2 className="font-[family-name:var(--font-brand)] text-[22px] font-bold tracking-tight text-slate-900 sm:text-[26px]">
                    {data.community.name}
                  </h2>
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                      statusTone(sub?.status ?? null, leftover, cancelScheduled),
                    ].join(" ")}
                  >
                    {statusLabel(sub?.status ?? null, leftover, cancelScheduled)}
                  </span>
                </div>
                <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-slate-500">
                  {leftover
                    ? `Service continues on the previous plan until ${formatBillingDate(sub?.leftover_ends_at)}. The previous admin is not being charged.`
                    : cancelScheduled
                      ? `Access continues until ${formatBillingDate(sub.current_period_end)}. You will not be charged again after that date.`
                      : sub?.status === "trialing"
                        ? `${daysUntil(sub.current_period_end) ?? "—"} days left in the free trial. Residents can join without paying Havena.`
                        : sub?.status === "pending_trial"
                          ? "Card is on file. The free trial starts after a system administrator approves this community."
                          : "One plan covers the whole community. Invite residents into your seat pool."}
                </p>
              </div>

              <div className="w-full min-w-[12rem] rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white px-4 py-3.5 sm:w-auto sm:min-w-[13.5rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                  Seats used
                </p>
                <p className="mt-1 font-[family-name:var(--font-brand)] text-[30px] font-bold leading-none tabular-nums text-slate-900">
                  {seats.seats_used}
                  <span className="text-[16px] font-medium text-slate-400"> / {seatLimitLabel}</span>
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-teal-100">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-all"
                    style={{
                      width: `${Math.min(100, seats.seat_limit > 0 ? (seats.seats_used / seats.seat_limit) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {seats.seats_available > 0
                    ? `${seats.seats_available} seats still open`
                    : seats.seat_limit > 0
                      ? "Seat pool is full"
                      : "Seats unlock with an active plan"}
                </p>
              </div>
            </div>

            {sub ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plan</p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-900">{sub.plan_name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{sub.seat_limit} resident seats</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {leftover
                      ? "Leftover ends"
                      : cancelScheduled
                        ? "Access ends"
                        : sub.status === "trialing"
                          ? "Trial ends"
                          : sub.status === "pending_trial"
                            ? "Trial starts"
                            : "Renews"}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-900">
                    {leftover
                      ? formatBillingDate(sub.leftover_ends_at)
                      : sub.status === "pending_trial"
                        ? "After approval"
                        : formatBillingDate(sub.current_period_end)}
                  </p>
                  {sub.status === "trialing" && daysUntil(sub.current_period_end) !== null ? (
                    <p className="mt-0.5 text-[12px] text-teal-700">
                      {daysUntil(sub.current_period_end)} days remaining
                    </p>
                  ) : leftover && daysUntil(sub.leftover_ends_at) !== null ? (
                    <p className="mt-0.5 text-[12px] text-amber-700">
                      {daysUntil(sub.leftover_ends_at)} days remaining
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Billing</p>
                  <p className="mt-1 text-[15px] font-semibold capitalize text-slate-900">
                    {sub.billing_interval === "year" ? "Yearly" : "Monthly"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {sub.card_on_file ? "Card on file" : leftover ? "Paused — previous card removed" : "No card on file"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {data.setup.can_invite_residents ? (
                <Link
                  href="/admin/members"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2A43] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0d3a5a]"
                >
                  Invite residents
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  Manage payment & invoices
                </button>
              ) : null}
            </div>
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
            trialEligible={trialEligible}
          />
          {!data.billing.stripe_configured ? (
            <p className="text-[12px] text-amber-700">
              Card checkout is not available until Stripe test keys are configured.
              {trialEligible ? " A free trial cannot start without a card." : " A card is required to restart billing."}
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">
              {trialEligible
                ? "Next you’ll enter card details. $0 is due today — the trial clock starts after approval."
                : "Next you’ll enter card details. Paid billing starts after system approval — no free trial remains."}
            </p>
          )}
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">Change plan</h2>
              <p className="mt-1 text-[13px] text-slate-500">
                {estimatedHint ?? "Switch anytime. Downgrades are blocked if your residents exceed the new seat limit."}
              </p>
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
          trialEligible={trialEligible}
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
