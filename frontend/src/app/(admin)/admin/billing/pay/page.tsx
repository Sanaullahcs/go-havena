"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { apiError } from "@/lib/api/client";
import {
  applyBillingCoupon,
  confirmElementsCheckout,
  formatMoney,
  removeBillingCoupon,
  startBillingCheckout,
  type BillingCouponSummary,
  type BillingInterval,
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

const stripeAppearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0d9488",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    colorDanger: "#e11d48",
    colorTextSecondary: "#64748b",
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "15px",
    borderRadius: "12px",
    spacingUnit: "4px",
    gridRowSpacing: "14px",
  },
  rules: {
    ".Label": {
      fontWeight: "600",
      fontSize: "12px",
      letterSpacing: "0.01em",
      color: "#334155",
      marginBottom: "6px",
    },
    ".Input": {
      border: "1px solid #e2e8f0",
      boxShadow: "none",
      backgroundColor: "#f8fafc",
      padding: "12px 14px",
      lineHeight: "1.4",
    },
    ".Input:focus": {
      border: "1px solid #14b8a6",
      boxShadow: "0 0 0 3px rgba(13, 148, 136, 0.16)",
      backgroundColor: "#ffffff",
    },
    ".Tab": {
      border: "1px solid #e2e8f0",
      boxShadow: "none",
    },
    ".Tab--selected": {
      border: "1px solid #14b8a6",
      boxShadow: "0 0 0 3px rgba(13, 148, 136, 0.12)",
    },
  },
};

const stripePromiseByKey = new Map<string, Promise<Stripe | null>>();

function stripePromiseFor(publishableKey: string) {
  const existing = stripePromiseByKey.get(publishableKey);
  if (existing) return existing;
  const created = loadStripe(publishableKey);
  stripePromiseByKey.set(publishableKey, created);
  return created;
}

function paymentElementOptions(hasEmail: boolean) {
  return {
    layout: { type: "tabs" as const },
    paymentMethodOrder: ["card"],
    wallets: {
      applePay: "never" as const,
      googlePay: "never" as const,
    },
    fields: {
      billingDetails: {
        name: "never" as const,
        ...(hasEmail ? { email: "never" as const } : {}),
        address: "if_required" as const,
      },
    },
  };
}

function stripePersonName(raw: string | null | undefined, fallback: string) {
  const words = String(raw || "")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
  if (words.length >= 2) return `${words[0]} ${words[1]}`;
  if (words.length === 1) return `${words[0]} Admin`;
  return fallback;
}

type CheckoutSession = {
  clientSecret: string;
  intentType: "setup" | "payment";
  stripeSubscriptionId: string;
  publishableKey: string;
  trialDays: number;
  trialStartsOnApproval: boolean;
  customerEmail: string | null;
  customerName: string;
  customerPhone: string | null;
  communityName: string;
  plan: {
    slug: string;
    name: string;
    seat_limit: number;
    interval: BillingInterval;
    price_cents: number;
    currency: string;
  };
  coupon?: BillingCouponSummary | null;
};

function intentAlreadyComplete(status: string | undefined) {
  return status === "succeeded" || status === "processing";
}

function readableStripeError(error: { message?: string; code?: string; type?: string } | undefined) {
  const message = error?.message?.trim() || "";
  if (message && message !== "Something went wrong. Please try again.") {
    return message;
  }
  if (error?.code === "setup_intent_unexpected_state" || error?.code === "payment_intent_unexpected_state") {
    return "This checkout session expired. Refresh the page and try again.";
  }
  return "Could not save your card. Refresh this page, then try again.";
}

function readableThrownError(err: unknown) {
  if (err && typeof err === "object") {
    const message = "message" in err && typeof err.message === "string" ? err.message.trim() : "";
    if (message && message !== "Something went wrong. Please try again.") {
      return message;
    }
  }
  const fallback = apiError(err);
  return fallback === "Something went wrong. Please try again."
    ? "Could not save your card. Refresh this page, then try again."
    : fallback;
}

function CheckoutForm({
  session,
  onPaid,
  onIntentExpired,
  couponCode,
  setCouponCode,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  couponLoading,
}: {
  session: CheckoutSession;
  onPaid: () => Promise<void>;
  onIntentExpired: () => Promise<void>;
  couponCode: string;
  setCouponCode: (value: string) => void;
  appliedCoupon: BillingCouponSummary | null;
  onApplyCoupon: () => Promise<void>;
  onRemoveCoupon: () => Promise<void>;
  couponLoading: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const confirmParams = {
        elements,
        confirmParams: {
          return_url: withAppReturnParams(
            `${window.location.origin}/admin/billing/pay?plan=${encodeURIComponent(session.plan.slug)}&interval=${session.plan.interval}`,
          ),
          payment_method_data: {
            billing_details: {
              name: stripePersonName(session.customerName, "Community Admin"),
              ...(session.customerEmail ? { email: session.customerEmail } : {}),
            },
          },
        },
        redirect: "if_required" as const,
      };

      const result =
        session.intentType === "payment"
          ? await stripe.confirmPayment(confirmParams)
          : await stripe.confirmSetup(confirmParams);

      const error = result.error;
      const errorIntent =
        error && "setup_intent" in error
          ? error.setup_intent
          : error && "payment_intent" in error
            ? error.payment_intent
            : null;
      const status =
        ("setupIntent" in result && result.setupIntent?.status) ||
        ("paymentIntent" in result && result.paymentIntent?.status) ||
        errorIntent?.status ||
        "";

      if (error) {
        const code = error.code || "";
        if (intentAlreadyComplete(status)) {
          await onPaid();
          return;
        }

        if (
          code === "setup_intent_unexpected_state" ||
          code === "payment_intent_unexpected_state" ||
          status === "canceled"
        ) {
          await onIntentExpired();
          return;
        }

        setFormError(readableStripeError(error));
        return;
      }

      if (status && !intentAlreadyComplete(status) && status !== "requires_action") {
        setFormError("Card confirmation is still pending. Try again.");
        return;
      }

      await onPaid();
    } catch (err) {
      setFormError(readableThrownError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {session.trialDays > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[12px] font-semibold text-slate-700">Promo code</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Applied after your free trial on the first paid invoice.
          </p>
          {appliedCoupon ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-teal-900">{appliedCoupon.code}</p>
                <p className="text-[12px] text-teal-800">
                  Save {formatMoney(appliedCoupon.savings_cents, appliedCoupon.currency)} per {session.plan.interval}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onRemoveCoupon()}
                disabled={couponLoading}
                className="text-[12px] font-semibold text-teal-700 hover:text-teal-900"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void onApplyCoupon()}
                disabled={couponLoading || !couponCode.trim()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      ) : null}

      {session.customerEmail ? (
        <div>
          <p className="text-[12px] font-semibold text-slate-600">Email</p>
          <p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[14px] text-slate-800">
            {session.customerEmail}
          </p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[12px] font-semibold text-slate-600">Card details</p>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <PaymentElement
            id="havena-card-element"
            options={paymentElementOptions(Boolean(session.customerEmail))}
          />
        </div>
      </div>

      {formError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700" role="alert">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Lock className="h-4 w-4" aria-hidden />
        {submitting
          ? session.trialDays > 0
            ? session.trialStartsOnApproval
              ? "Saving your card…"
              : "Starting your trial…"
            : "Saving your card…"
          : session.trialDays > 0
            ? session.trialStartsOnApproval
              ? "Save card"
              : `Start ${session.trialDays}-day free trial`
            : "Save card and resume billing"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-[12px]">
        {session.trialDays <= 0
          ? "Your card replaces the previous admin’s payment method. Billing resumes on the plan you selected."
          : session.trialStartsOnApproval
            ? `$0 due today. Your ${session.trialDays}-day free trial starts after a system administrator approves your account. You are not charged until that trial ends.`
            : `$0 due today. Your card is saved by Stripe and billed in USD after the trial unless you cancel.`}
      </p>
    </form>
  );
}

function PayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planSlug = searchParams.get("plan") || "";
  const interval: BillingInterval = searchParams.get("interval") === "year" ? "year" : "month";

  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<BillingCouponSummary | null>(null);
  const [basePlanPriceCents, setBasePlanPriceCents] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const startGen = useRef(0);

  const start = useCallback(async () => {
    if (!planSlug) {
      setError("Choose a plan first.");
      setLoading(false);
      return;
    }

    const gen = ++startGen.current;
    setLoading(true);
    setError(null);
    try {
      const result = await startBillingCheckout({
        plan_slug: planSlug,
        interval,
      });
      if (gen !== startGen.current) return;

      if (result.mode === "already_active") {
        toastSuccess(result.message || "Trial is already active.");
        const me = await fetchMe();
        updateUser(meToSessionUser(me));
        if (cameFromMobileApp()) {
          router.replace(withAppReturnParams("/admin/billing/done"));
          return;
        }
        router.replace(communityAdminOnboardingPath(getCommunityAdminNextStep(getUser())));
        return;
      }

      if (result.mode === "manual") {
        throw new Error("Card details are required before your free trial can start.");
      }

      if (result.mode === "stripe" && result.checkout_url) {
        window.location.href = result.checkout_url;
        return;
      }

      if (
        result.mode !== "elements" ||
        !result.client_secret ||
        !(result.stripe_setup_intent_id || result.stripe_subscription_id) ||
        !result.publishable_key ||
        !result.plan
      ) {
        throw new Error("Checkout could not be started. Refresh and try again.");
      }

      setStripePromise(stripePromiseFor(result.publishable_key));
      setBasePlanPriceCents(result.plan.price_cents);
      setSession({
        clientSecret: result.client_secret,
        intentType: result.intent_type === "payment" ? "payment" : "setup",
        stripeSubscriptionId: result.stripe_setup_intent_id || result.stripe_subscription_id || "",
        publishableKey: result.publishable_key,
        trialDays: result.trial_days ?? TRIAL_DAYS,
        trialStartsOnApproval: result.trial_starts_on_approval !== false && !getUser()?.access?.platform_approved,
        customerEmail: result.customer_email ?? null,
        customerName: stripePersonName(
          result.customer_name || result.community_name,
          "Community Admin",
        ),
        customerPhone: result.customer_phone ?? null,
        communityName: result.community_name || "your community",
        plan: {
          ...result.plan,
          interval: result.plan.interval === "year" ? "year" : "month",
        },
        coupon: result.coupon ?? null,
      });
      setAppliedCoupon(result.coupon ?? null);
    } catch (err) {
      if (gen !== startGen.current) return;
      setError(apiError(err));
    } finally {
      if (gen === startGen.current) setLoading(false);
    }
  }, [planSlug, interval, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    if (canAccessCommunityDashboard(user)) {
      router.replace("/admin");
      return;
    }
    void start();
    return () => {
      startGen.current += 1;
    };
  }, [router, start]);

  const onPaid = async () => {
    if (!session) return;

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const payload = await confirmElementsCheckout(session.stripeSubscriptionId);
        const status = payload.subscription?.status;
        const cardSaved =
          payload.setup.card_on_file ||
          payload.setup.trial_pending_approval ||
          status === "pending_trial";
        const trialLive =
          payload.setup.subscription_active ||
          status === "trialing" ||
          status === "active";
        if (cardSaved || trialLive) {
          toastSuccess(
            trialLive
              ? "30-day free trial started. You won’t be charged until the trial ends."
              : "Card saved. Your 30-day free trial starts when a system administrator approves your account.",
          );
          const me = await fetchMe();
          updateUser(meToSessionUser(me));
          if (cameFromMobileApp()) {
            router.replace(withAppReturnParams("/admin/billing/done"));
            return;
          }
          const step = getCommunityAdminNextStep(getUser());
          router.replace(communityAdminOnboardingPath(step === "complete_billing_web" ? "await_approval" : step));
          return;
        }
      } catch (err) {
        lastError = err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    throw lastError || new Error("Card saved, but the trial is still confirming. Refresh billing in a moment.");
  };

  const onApplyCoupon = async () => {
    if (!session || !couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const result = await applyBillingCoupon({
        code: couponCode.trim(),
        plan_slug: session.plan.slug,
        interval: session.plan.interval,
      });
      setAppliedCoupon(result.coupon);
      setSession((current) =>
        current
          ? {
              ...current,
              coupon: result.coupon,
              plan: {
                ...current.plan,
                price_cents: result.coupon.discounted_price_cents,
              },
            }
          : current,
      );
      toastSuccess("Coupon applied.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setCouponLoading(false);
    }
  };

  const onRemoveCoupon = async () => {
    setCouponLoading(true);
    try {
      await removeBillingCoupon();
      setAppliedCoupon(null);
      setCouponCode("");
      setSession((current) =>
        current
          ? {
              ...current,
              coupon: null,
              plan: {
                ...current.plan,
                price_cents: basePlanPriceCents || current.plan.price_cents,
              },
            }
          : current,
      );
      toastSuccess("Coupon removed.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setCouponLoading(false);
    }
  };

  const period = session?.plan.interval === "year" ? "year" : "month";
  const billedPriceCents =
    appliedCoupon?.discounted_price_cents ?? session?.plan.price_cents ?? 0;
  const originalPriceCents =
    appliedCoupon?.original_price_cents ?? session?.plan.price_cents ?? 0;
  const trialEnd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + (session?.trialDays ?? TRIAL_DAYS));
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }, [session?.trialDays]);

  if (loading && !session) return <PageLoader text="Preparing checkout…" />;
  if (error && !session) {
    return (
      <PageError
        message={error}
        onRetry={() => {
          if (!planSlug) router.replace(withAppReturnParams("/admin/billing"));
          else void start();
        }}
      />
    );
  }
  if (!session || !stripePromise) return null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl pb-8">
      <Link
        href={withAppReturnParams("/admin/billing")}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to plans
      </Link>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)] lg:items-start">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0A2A43] via-[#0c3550] to-teal-800 p-5 text-white shadow-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-100/80">
            {session.trialDays > 0 ? `Try Havena ${session.plan.name}` : `Resume ${session.plan.name}`}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-brand)] text-[1.75rem] font-bold leading-tight">
            {session.trialDays > 0 ? `${session.trialDays} days free` : "Add your card"}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/75">
            {session.trialDays <= 0
              ? `${formatMoney(billedPriceCents, session.plan.currency)} per ${period} after you save your card. The previous admin is not charged.`
              : `Then ${formatMoney(billedPriceCents, session.plan.currency)} per ${period}${
                  appliedCoupon
                    ? ` (${formatMoney(originalPriceCents, session.plan.currency)} before discount)`
                    : ""
                }${
                  session.trialStartsOnApproval
                    ? ` after your ${session.trialDays}-day trial (trial starts when you’re approved).`
                    : ` starting ${trialEnd}.`
                }`}
          </p>

          <ul className="mt-5 space-y-2.5 border-t border-white/15 pt-4 text-[13px] text-white/85">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              $0 due today
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              {session.plan.seat_limit} resident seats
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              For {session.communityName}
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              {session.trialStartsOnApproval
                ? "Card saved now — trial starts after approval"
                : "Card billed in USD after trial"}
            </li>
          </ul>
        </aside>

        <section className="relative z-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-[16px] font-bold text-slate-900">Enter payment details</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Card number, expiry, and CVC only. No billing address required.
          </p>
          <div className="mt-5">
            <Elements
              key={session.clientSecret}
              stripe={stripePromise}
              options={{
                clientSecret: session.clientSecret,
                appearance: stripeAppearance,
              }}
            >
              <CheckoutForm
                session={session}
                onPaid={onPaid}
                onIntentExpired={async () => {
                  setSession(null);
                  await start();
                }}
                couponCode={couponCode}
                setCouponCode={setCouponCode}
                appliedCoupon={appliedCoupon}
                onApplyCoupon={onApplyCoupon}
                onRemoveCoupon={onRemoveCoupon}
                couponLoading={couponLoading}
              />
            </Elements>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function BillingPayPage() {
  return (
    <Suspense fallback={<PageLoader text="Preparing checkout…" />}>
      <PayInner />
    </Suspense>
  );
}
