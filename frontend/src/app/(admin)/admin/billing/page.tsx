"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CreditCard,
  Gift,
  Home,
  Landmark,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import api, { apiError } from "@/lib/api/client";
import {
  changeBillingPlan,
  confirmBillingCheckout,
  fetchBilling,
  formatMoney,
  isCommunityBillingExempt,
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

/** Every paid package includes the full platform. Seat count is the only difference. */
const PACKAGE_FEATURES = [
  "Admin dashboard",
  "Resident invites",
  "Residents join free",
  "Community feed",
  "Notices",
  "Events and RSVPs",
  "Emergency alerts",
  "Direct messages",
  "Document library",
  "Community rules",
  "Complaints",
  "Amenities",
  "Bookings",
  "Marketplace",
  "Wellness",
  "Family accounts",
  "Guest invites",
  "Points and rank",
  "Nearby places",
  "Refer and earn",
] as const;

function yearlySavePercent(plans: Array<Pick<BillingPlan, "price_monthly_cents" | "price_yearly_cents">>): number | null {
  const values = plans
    .map((plan) => {
      const full = plan.price_monthly_cents * 12;
      if (full <= 0 || plan.price_yearly_cents <= 0 || plan.price_yearly_cents >= full) return 0;
      return Math.round(((full - plan.price_yearly_cents) / full) * 100);
    })
    .filter((value) => value > 0);
  if (values.length === 0) return null;
  return Math.min(...values);
}

const PLAN_MARKS = [Home, Building2, Landmark] as const;

function PlanPriceStack({
  priceCents,
  currency,
  periodShort,
  trialDays,
  trialEligible,
  note,
}: {
  priceCents: number;
  currency: string;
  periodShort: string;
  trialDays: number;
  trialEligible: boolean;
  note?: string | null;
}) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Plan price</p>
      <p className="mt-1 font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-none tracking-tight text-slate-900">
        {formatMoney(priceCents, currency)}
        <span className="text-[14px] font-medium text-slate-500">/{periodShort}</span>
      </p>
      {trialEligible ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-teal-200/80">
          <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
          <div>
            <p className="text-[12px] font-semibold text-teal-800">First {trialDays} days on us</p>
            <p className="text-[11px] leading-snug text-slate-600">
              Card saved now. First charge after the trial.
            </p>
          </div>
        </div>
      ) : note ? (
        <p className="mt-2 text-[12px] leading-snug text-slate-600">{note}</p>
      ) : null}
    </div>
  );
}

function BillingIntervalToggle({
  interval,
  onChange,
  savePercent = null,
  className = "",
  bare = false,
}: {
  interval: BillingInterval;
  onChange: (value: BillingInterval) => void;
  savePercent?: number | null;
  className?: string;
  bare?: boolean;
}) {
  if (bare) {
    return (
      <div className="inline-flex rounded-full bg-[#E7EEF3] p-1" role="group" aria-label="Billing cycle">
        <button
          type="button"
          aria-pressed={interval === "month"}
          onClick={() => onChange("month")}
          className={
            interval === "month"
              ? "rounded-full bg-[#0A2A43] px-3.5 py-1.5 text-[13px] font-semibold text-white"
              : "rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[#4d6274]"
          }
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={interval === "year"}
          onClick={() => onChange("year")}
          className={
            interval === "year"
              ? "inline-flex items-center rounded-full bg-[#0A2A43] px-3.5 py-1.5 text-[13px] font-semibold text-white"
              : "inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[#4d6274]"
          }
        >
          Yearly
          {savePercent ? (
            <span
              className={
                interval === "year"
                  ? "ml-1.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#9aefe4]"
                  : "ml-1.5 rounded-full bg-[#D1FAF5] px-1.5 py-0.5 text-[10px] font-semibold text-[#0F766E]"
              }
            >
              −{savePercent}%
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div className={["lp-pricing__cycle", className].join(" ")}>
      <span className="lp-pricing__cycle-label">
        <Calendar className="h-4 w-4" aria-hidden />
        Billing
      </span>
      <div className="lp-pricing__toggle" role="group" aria-label="Billing cycle">
        <button
          type="button"
          aria-pressed={interval === "month"}
          className={interval === "month" ? "is-on" : ""}
          onClick={() => onChange("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={interval === "year"}
          className={interval === "year" ? "is-on" : ""}
          onClick={() => onChange("year")}
        >
          Yearly
          <span
            className={`lp-pricing__save${savePercent ? "" : " lp-pricing__save--reserve"}`}
            aria-hidden={!savePercent}
          >
            {savePercent ? `−${savePercent}%` : "−0%"}
          </span>
        </button>
      </div>
    </div>
  );
}

function PackageFeatureList() {
  return (
    <ul className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-1 rounded-xl bg-[#F7FAFE] px-2.5 py-2 ring-1 ring-[#E3ECF6]">
      {PACKAGE_FEATURES.map((item) => (
        <li key={item} className="flex min-w-0 items-center gap-1.5">
          <Check className="h-3 w-3 shrink-0 text-[#0D9488]" strokeWidth={2.5} aria-hidden />
          <span className="truncate text-[11px] leading-4 text-[#0A2A43]/85">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function OnboardingPlanOption({
  plan,
  index,
  interval,
  selected,
  trialEligible,
  onSelect,
}: {
  plan: BillingPlan;
  index: number;
  interval: BillingInterval;
  selected: boolean;
  trialEligible: boolean;
  onSelect: () => void;
}) {
  const Icon = PLAN_MARKS[index] ?? Building2;
  const monthlyShown = interval === "year" ? Math.round(plan.price_yearly_cents / 12) : plan.price_monthly_cents;

  return (
    <article
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "flex h-full cursor-pointer flex-col rounded-[1.35rem] px-5 pb-5 pt-5 outline-none transition focus-visible:ring-2 focus-visible:ring-[#14B8A6]/50",
        selected
          ? "bg-[#0A2A43] text-white shadow-[0_18px_36px_-22px_rgba(10,42,67,0.7)]"
          : "bg-white text-[#0A2A43] ring-1 ring-[#0A2A43]/8 hover:ring-[#0D9488]/35",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={[
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            selected ? "bg-white/10 text-[#7EE0D4]" : "bg-[#E7F6F2] text-[#0D9488]",
          ].join(" ")}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[15px] font-semibold tracking-tight">{plan.name}</h3>
            {plan.recommended ? (
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                  selected ? "bg-[#14B8A6] text-[#07312E]" : "bg-[#E7F6F2] text-[#0F766E]",
                ].join(" ")}
              >
                Popular
              </span>
            ) : null}
          </div>
          <p className={["mt-0.5 text-[12px]", selected ? "text-white/65" : "text-[#6b7c8f]"].join(" ")}>
            Up to {plan.seat_limit.toLocaleString()} residents
          </p>
        </div>
      </div>

      <p className={["mt-4 text-[12.5px] leading-snug", selected ? "text-white/70" : "text-[#5c7284]"].join(" ")}>
        {plan.description}
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-x-2 gap-y-1.5">
        {PACKAGE_FEATURES.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-1 text-[11.5px] leading-4">
            <Check className={["mt-0.5 h-3 w-3 shrink-0", selected ? "text-[#7EE0D4]" : "text-[#0D9488]"].join(" ")} strokeWidth={2.5} aria-hidden />
            <span className={["min-w-0", selected ? "text-white/88" : "text-[#1e3a4c]"].join(" ")}>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        <p className="font-[family-name:var(--font-brand)] text-[1.7rem] font-semibold leading-none tracking-tight">
          {formatMoney(monthlyShown, plan.currency)}
          <span className={["ml-1 text-[13px] font-medium", selected ? "text-white/55" : "text-[#6b7c8f]"].join(" ")}>/mo</span>
        </p>
        {interval === "year" ? (
          <p className={["mt-2 text-[11px]", selected ? "text-white/55" : "text-[#6b7c8f]"].join(" ")}>
            Paid annually at {formatMoney(plan.price_yearly_cents, plan.currency)}
          </p>
        ) : null}
        <p className={["mt-3 text-[12px] font-semibold", selected ? "text-[#7EE0D4]" : "text-[#0D9488]"].join(" ")}>
          Residents join free
        </p>
        <p className={["mt-1 text-[11px]", selected ? "text-white/50" : "text-[#8aa0b3]"].join(" ")}>
          {trialEligible ? `First ${planTrialDays(plan)} days free after approval` : "Billed after approval"}
        </p>
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className={[
            "mt-4 flex h-10 w-full items-center justify-center rounded-2xl text-[13px] font-semibold",
            selected ? "bg-[#14B8A6] text-[#07312E]" : "bg-[#F3F7FA] text-[#0A2A43]",
          ].join(" ")}
        >
          {selected ? "Selected" : "Choose this package"}
        </button>
      </div>
    </article>
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
  savePercent,
  communityName,
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
  savePercent: number | null;
  communityName: string;
}) {
  const selectedPlan = plans.find((p) => p.slug === selected) ?? plans[0] ?? null;
  const selectedPrice = selectedPlan
    ? interval === "year"
      ? Math.round(selectedPlan.price_yearly_cents / 12)
      : selectedPlan.price_monthly_cents
    : 0;
  const session = getUser();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteForm, setQuoteForm] = useState({
    organization_name: communityName,
    contact_name: session?.name ?? "",
    email: session?.email ?? "",
    notes: "",
  });

  const submitQuote = async (event: FormEvent) => {
    event.preventDefault();
    const organization = quoteForm.organization_name.trim();
    const contact = quoteForm.contact_name.trim();
    const email = quoteForm.email.trim();
    if (!organization || !contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setQuoteError("Add the organization, your name, and a work email.");
      return;
    }
    setQuoteSending(true);
    setQuoteError("");
    try {
      await api.post("/v1/billing/saas/inquiries", {
        organization_name: organization,
        contact_name: contact,
        email,
        community_name: communityName,
        residents: 5000,
        communities: 1,
        billing_model: "per_community",
        interval,
        notes: ["Package: Custom", quoteForm.notes.trim()].filter(Boolean).join("\n"),
      });
      setQuoteSent(true);
    } catch {
      setQuoteError("We could not send that just now. Please try again.");
    } finally {
      setQuoteSending(false);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-brand)] text-[1.35rem] font-semibold tracking-tight text-[#0A2A43]">
            Choose a package
          </h1>
          <p className="mt-1 text-[13px] text-[#6b7c8f]">
            {communityName}
            {" · "}
            {trialEligible ? "Trial starts after approval." : "Billing starts after approval."}
            {estimatedHint ? ` ${estimatedHint}` : ""}
          </p>
        </div>
        <BillingIntervalToggle bare interval={interval} onChange={onIntervalChange} savePercent={savePercent} />
      </div>

      <div className="mt-7 grid items-stretch gap-4 lg:grid-cols-3" role="radiogroup" aria-label="Subscription plans">
        {plans.map((plan, index) => (
          <OnboardingPlanOption
            key={plan.slug}
            plan={plan}
            index={index}
            interval={interval}
            selected={selected === plan.slug}
            trialEligible={trialEligible}
            onSelect={() => onSelect(plan.slug)}
          />
        ))}
      </div>

      {selectedPlan ? (
        <>
        <div className="mb-8 mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="min-w-0 text-[12.5px] leading-relaxed text-[#6b7c8f]">
            {trialEligible
              ? `Card is saved now. Havena charges after ${planTrialDays(selectedPlan)} days unless you cancel.`
              : "Card is saved now. Billing starts after approval."}{" "}
            <button
              type="button"
              onClick={() => {
                setQuoteSent(false);
                setQuoteOpen(true);
              }}
              className="inline-flex items-center gap-1 align-baseline font-medium text-[#0A2A43] underline decoration-[#14B8A6] decoration-2 underline-offset-[5px] transition hover:text-[#0D9488]"
            >
              <Sparkles className="h-3 w-3 shrink-0 text-[#0D9488]" aria-hidden />
              Custom quote for 5,000+ residents or more than one community
            </button>
          </p>
          <div className="ml-auto flex items-center gap-4">
            <p className="text-right">
              <span className="block text-[13px] font-semibold text-[#0A2A43]">
                {selectedPlan.name} · {formatMoney(selectedPrice, selectedPlan.currency)}/mo
              </span>
              <span className="text-[11px] text-[#6b7c8f]">
                {selectedPlan.seat_limit.toLocaleString()} seats
                {interval === "year"
                  ? ` · ${formatMoney(selectedPlan.price_yearly_cents, selectedPlan.currency)}/yr`
                  : ""}
              </span>
            </p>
            <button
              type="button"
              disabled={busy || checkoutDisabled}
              onClick={() => onCheckout(selectedPlan.slug)}
              className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-[#0D9488] px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Starting…" : "Add card"}
              {!busy ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </button>
          </div>
        </div>
        </>
      ) : null}

      {quoteOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="marketing-landing lp-quote-host">
              <div className="lp-quote" role="presentation">
                <button type="button" className="lp-quote__backdrop" aria-label="Close quote request" onClick={() => setQuoteOpen(false)} />
                <div className="lp-quote__card" role="dialog" aria-modal="true" aria-labelledby="billing-quote-title">
                  <button type="button" className="lp-quote__close" aria-label="Close" onClick={() => setQuoteOpen(false)}>
                    <X className="h-4 w-4" />
                  </button>
                  <aside className="lp-quote__aside">
                    <p className="lp-quote__eyebrow">Custom quote</p>
                    <h2 id="billing-quote-title">Custom package</h2>
                    <p>We write the price with you. Nothing is switched on until you accept it.</p>
                    <ul>
                      <li>
                        <span>Package</span>
                        <strong>Custom</strong>
                      </li>
                      <li>
                        <span>Size</span>
                        <strong>5,000+ residents or multi-site</strong>
                      </li>
                      <li>
                        <span>Community</span>
                        <strong>{communityName}</strong>
                      </li>
                      <li>
                        <span>Billing</span>
                        <strong>{interval === "year" ? "Yearly" : "Monthly"}</strong>
                      </li>
                    </ul>
                  </aside>
                  {quoteSent ? (
                    <div className="lp-quote__form">
                      <p className="lp-quote__eyebrow">Request received</p>
                      <h3>We’ll reply with a written price.</h3>
                      <p className="lp-quote__hint">A note is on its way to {quoteForm.email.trim()}.</p>
                      <button type="button" className="lp-quote__submit" onClick={() => setQuoteOpen(false)}>
                        Done
                      </button>
                    </div>
                  ) : (
                    <form className="lp-quote__form" onSubmit={(event) => void submitQuote(event)}>
                      <div className="lp-quote__form-head">
                        <p className="lp-quote__eyebrow">Where should we send it?</p>
                        <h3>A few details, then we write the price.</h3>
                      </div>
                      <div className="lp-quote__fields">
                        <label>
                          Organization
                          <input
                            value={quoteForm.organization_name}
                            autoComplete="organization"
                            onChange={(event) => setQuoteForm({ ...quoteForm, organization_name: event.target.value })}
                          />
                        </label>
                        <label>
                          Your name
                          <input
                            value={quoteForm.contact_name}
                            autoComplete="name"
                            onChange={(event) => setQuoteForm({ ...quoteForm, contact_name: event.target.value })}
                          />
                        </label>
                        <label className="lp-quote__field--wide">
                          Work email
                          <input
                            type="email"
                            value={quoteForm.email}
                            autoComplete="email"
                            onChange={(event) => setQuoteForm({ ...quoteForm, email: event.target.value })}
                          />
                        </label>
                        <label className="lp-quote__field--wide">
                          Anything we should know
                          <textarea
                            value={quoteForm.notes}
                            rows={4}
                            onChange={(event) => setQuoteForm({ ...quoteForm, notes: event.target.value })}
                            placeholder="Communities, integrations, or a date you have in mind."
                          />
                        </label>
                      </div>
                      {quoteError ? (
                        <p className="lp-quote__error" role="alert">
                          {quoteError}
                        </p>
                      ) : null}
                      <button type="submit" className="lp-quote__submit" disabled={quoteSending}>
                        {quoteSending ? "Sending…" : "Send the request"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
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
          ? "border-[#1B4F8A] bg-white shadow-sm ring-1 ring-[#1B4F8A]/20"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
        plan.recommended && !selected ? "border-slate-300" : "",
      ].join(" ")}
    >
      {plan.recommended ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1B4F8A] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
          Recommended
        </span>
      ) : null}

      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="text-[16px] font-bold text-slate-900">{plan.name}</p>
        <p className="mt-1 min-h-[2.5rem] text-[12px] leading-relaxed text-slate-500">{plan.description}</p>

        <PlanPriceStack
          priceCents={price}
          currency={plan.currency}
          periodShort={periodShort}
          trialDays={planTrialDays(plan)}
          trialEligible={onboarding}
          note={
            onboarding
              ? null
              : plan.recommended
                ? `Includes ${planTrialDays(plan)}-day free trial`
                : null
          }
        />

        <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
          <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            <strong className="font-semibold text-slate-800">{plan.seat_limit}</strong> resident seats
          </span>
        </div>

        <PackageFeatureList />
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
                  : "bg-[#1B4F8A] text-white hover:bg-[#163A66]",
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
            ? "Plan reserved · first charge after trial"
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
      done: data.setup.can_invite_residents || Boolean(data.billing?.exempt || data.seats?.billing_exempt),
      label: "Invite residents",
      hint:
        data.billing?.exempt || data.seats?.billing_exempt
          ? "Unlimited seats — billing not required"
          : billingReady
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
      if (step === "configure_resident_features" || step === "await_approval" || step === "rejected") {
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
    if (isCommunityBillingExempt(data)) return;
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

  if (loading && !data) return <PageLoader text="Loading billing…" variant="billing" />;
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
  const billingExempt = isCommunityBillingExempt(data);
  const seatLimitLabel = billingExempt
    ? "Unlimited"
    : seats.seat_limit && seats.seat_limit > 0
      ? String(seats.seat_limit)
      : "—";

  if (billingExempt) {
    return (
      <div className="space-y-6 lg:space-y-8">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4F8A]">
            Billing
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-[2rem] sm:leading-tight">
            No subscription required
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-600 sm:mt-2 sm:text-[15px]">
            Communities in this region do not need a plan, card, or checkout. Resident seats are unlimited.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-0.5 bg-slate-200" aria-hidden />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Community
                </p>
                <h2 className="mt-1.5 font-[family-name:var(--font-brand)] text-[22px] font-bold tracking-tight text-slate-900 sm:text-[26px]">
                  {data.community.name}
                </h2>
                <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-slate-500">
                  Billing is not required here. Invite as many residents as you need — there is no seat pack or card on file.
                </p>
              </div>
              <div className="w-full min-w-[12rem] rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3.5 sm:w-auto sm:min-w-[13.5rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                  Seats used
                </p>
                <p className="mt-1 font-[family-name:var(--font-brand)] text-[30px] font-bold leading-none tabular-nums text-slate-900">
                  {seats.seats_used}
                  <span className="text-[16px] font-medium text-slate-400"> / Unlimited</span>
                </p>
                <p className="mt-2 text-[11px] text-slate-500">Unlimited resident seats in this region</p>
              </div>
            </div>
            {data.setup.can_invite_residents ? (
              <div className="mt-5">
                <Link
                  href="/admin/members"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#163A66]"
                >
                  Invite residents
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }
  const trialEligible = communityTrialEligible(data);
  const paidPlans = data.plans.filter(
    (plan) => plan.price_monthly_cents > 0 || plan.price_yearly_cents > 0,
  );
  const savePercent = yearlySavePercent(paidPlans);
  const previewPlan = paidPlans.find((p) => p.slug === selected) ?? paidPlans[0] ?? null;
  const currentPlan = sub
    ? data.plans.find((p) => p.slug === sub.plan_slug) ?? previewPlan
    : null;
  const currentPlanPrice = currentPlan
    ? (sub?.billing_interval === "year" ? currentPlan.price_yearly_cents : currentPlan.price_monthly_cents)
    : data.next_charge?.amount_cents ?? 0;
  const currentPeriodShort = (sub?.billing_interval ?? interval) === "year" ? "yr" : "mo";
  const onTrial = sub?.status === "trialing" || sub?.status === "pending_trial";
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

  const onboardingLayout = !checkoutComplete && !needsReplacementCard;

  return (
    <div
      className={[
        onboardingLayout ? "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3" : "space-y-6 lg:space-y-8",
      ].join(" ")}
    >
      {checkoutComplete ? (
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4F8A]">Billing</p>
          <h1 className="mt-1 font-[family-name:var(--font-brand)] text-xl font-bold tracking-tight text-slate-900 sm:text-[2rem] sm:leading-tight">
            Community subscription
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-600 sm:mt-2 sm:text-[15px]">
            One Havena subscription covers your whole community. Residents never pay Havena — you invite them into your seat pool.
          </p>
        </header>
      ) : null}

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

      {needsReplacementCard ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-[13px] text-teal-950">
          The leftover period has ended. Add your card to keep this community on Havena. The current plan is
          pre-selected — you can keep it or choose another plan that fits your resident count.
        </div>
      ) : null}

      {checkoutComplete ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-0.5 bg-slate-200" aria-hidden />
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

              <div className="w-full min-w-[12rem] rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3.5 sm:w-auto sm:min-w-[13.5rem]">
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
                      width: `${Math.min(100, !billingExempt && seats.seat_limit && seats.seat_limit > 0 ? (seats.seats_used / seats.seat_limit) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {billingExempt
                    ? "Unlimited resident seats in this region"
                    : seats.seats_available > 0
                      ? `${seats.seats_available} seats still open`
                      : seats.seat_limit && seats.seat_limit > 0
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {onTrial ? "Plan price" : "Billing"}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-900">
                    {currentPlanPrice > 0
                      ? `${formatMoney(currentPlanPrice, currentPlan?.currency ?? "usd")}/${currentPeriodShort}`
                      : sub.billing_interval === "year"
                        ? "Yearly"
                        : "Monthly"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {onTrial
                      ? sub.status === "pending_trial"
                        ? "First charge after trial starts"
                        : "First charge when the trial ends"
                      : sub.card_on_file
                        ? "Card on file"
                        : leftover
                          ? "Paused — previous card removed"
                          : "No card on file"}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {data.setup.can_invite_residents ? (
                <Link
                  href="/admin/members"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#163A66]"
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
            plans={paidPlans}
            interval={interval}
            selected={selected}
            busy={busy}
            checkoutDisabled={!data.billing.stripe_configured}
            onSelect={setSelected}
            onCheckout={(slug) => void onCheckout(slug)}
            onIntervalChange={setInterval}
            estimatedHint={estimatedHint}
            trialEligible={trialEligible}
            savePercent={savePercent}
            communityName={data.community.name}
          />
          {!data.billing.stripe_configured ? (
            <p className="text-[12px] text-amber-700">
              Card checkout is not available until Stripe test keys are configured.
              {trialEligible ? " A free trial cannot start without a card." : " A card is required to restart billing."}
            </p>
          ) : null}
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
            <div className="marketing-landing">
              <BillingIntervalToggle interval={interval} onChange={setInterval} savePercent={savePercent} />
            </div>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-3">
            {paidPlans.map((plan) => (
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

      {checkoutComplete ? (
        <section className="space-y-2.5 sm:space-y-3">
          <h2 className="text-[13px] font-semibold text-slate-900 sm:text-[14px]">What happens next</h2>
          <SetupChecklist
            billingReady={checkoutComplete}
            data={data}
            seats={seats}
            trialEligible={trialEligible}
          />
        </section>
      ) : null}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader text="Loading billing…" variant="billing" />}>
      <BillingPageInner />
    </Suspense>
  );
}
