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
import { ArrowLeft, Check, Lock, Mail, ShieldCheck } from "lucide-react";
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

function useCompactViewport() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

function stripeAppearance(compact: boolean) {
  return {
    theme: "flat" as const,
    variables: {
      colorPrimary: "#0d9488",
      colorBackground: "#ffffff",
      colorText: "#0f3d57",
      colorDanger: "#e11d48",
      colorTextSecondary: "#6b7c8f",
      colorTextPlaceholder: "#94a3b8",
      fontFamily: "Poppins, ui-sans-serif, system-ui, sans-serif",
      fontSizeBase: compact ? "16px" : "14.5px",
      borderRadius: "14px",
      spacingUnit: compact ? "3px" : "3.5px",
      gridRowSpacing: compact ? "12px" : "14px",
    },
    rules: {
      ".Label": {
        fontWeight: "600",
        fontSize: "11px",
        letterSpacing: "0.04em",
        color: "#6b7c8f",
        marginBottom: "6px",
      },
      ".Input": {
        border: "1px solid #d7e3ee",
        boxShadow: "none",
        backgroundColor: "#ffffff",
        padding: compact ? "13px 12px" : "12px 13px",
        lineHeight: "1.4",
      },
      ".Input:focus": {
        border: "1px solid #14b8a6",
        boxShadow: "0 0 0 4px rgba(13, 148, 136, 0.12)",
      },
      ".Tab": {
        border: "1px solid transparent",
        backgroundColor: "transparent",
        boxShadow: "none",
        color: "#5c6d80",
      },
      ".Tab:hover": {
        color: "#0f3d57",
        backgroundColor: "#f3f8fb",
      },
      ".Tab--selected": {
        border: "1px solid #c9ebe4",
        backgroundColor: "#f3fbf8",
        boxShadow: "none",
        color: "#0f766e",
      },
      ".TabIcon--selected": {
        fill: "#0d9488",
      },
      ".Block": {
        backgroundColor: "transparent",
        boxShadow: "none",
        border: "none",
      },
    },
  };
}

const stripePromiseByKey = new Map<string, Promise<Stripe | null>>();

function stripePromiseFor(publishableKey: string) {
  const existing = stripePromiseByKey.get(publishableKey);
  if (existing) return existing;
  const created = loadStripe(publishableKey);
  stripePromiseByKey.set(publishableKey, created);
  return created;
}

function paymentElementOptions(compact: boolean) {
  return {
    layout: { type: compact ? ("accordion" as const) : ("tabs" as const) },
    paymentMethodOrder: ["card"],
    wallets: {
      applePay: "never" as const,
      googlePay: "never" as const,
      link: "never" as const,
    },
    fields: {
      billingDetails: {
        name: "never" as const,
        email: "never" as const,
        phone: "never" as const,
        address: "never" as const,
      },
    },
  };
}

function countryChoices() {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    const codes =
      typeof Intl !== "undefined" && "supportedValuesOf" in Intl
        ? Intl.supportedValuesOf("region")
        : ["US", "PK", "GB", "AE", "CA", "AU", "SA", "IN"];
    return codes
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .map((code) => ({ code, name: display.of(code) || code }))
      .filter((item) => item.name !== item.code)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [
      { code: "PK", name: "Pakistan" },
      { code: "US", name: "United States" },
    ];
  }
}

const checkoutFieldClass =
  "h-11 w-full rounded-[14px] border border-[#d7e3ee] bg-white px-3 text-[14px] text-[#0f3d57] outline-none focus:border-[#14b8a6]";

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
  requiresReplacementCard: boolean;
  showPromoCode: boolean;
  promoHint: string;
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

function promoHintForCheckout(trialDays: number, requiresReplacementCard: boolean): string {
  if (requiresReplacementCard) {
    return "Applied to your first invoice on the plan you select.";
  }
  if (trialDays > 0) {
    return "Applied after your free trial on the first paid invoice.";
  }
  return "Applied to your first invoice after approval.";
}

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
  compact,
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
  compact: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [billingName, setBillingName] = useState(session.customerName || "");
  const [billingEmail, setBillingEmail] = useState(session.customerEmail || "");
  const [billingPhone, setBillingPhone] = useState(session.customerPhone || "");
  const [billingCountry, setBillingCountry] = useState("");
  const countries = useMemo(() => countryChoices(), []);

  useEffect(() => {
    const region = navigator.language.split("-")[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) {
      setBillingCountry((current) => current || region.toUpperCase());
    }
  }, []);

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
              name: billingName.trim() || stripePersonName(session.customerName, "Community Admin"),
              ...(billingEmail.trim() ? { email: billingEmail.trim() } : {}),
              ...(billingPhone.trim() ? { phone: billingPhone.trim() } : {}),
              ...(billingCountry ? { address: { country: billingCountry } } : {}),
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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {session.customerEmail ? (
          <p className="flex min-w-0 items-center gap-2 text-[13px] text-[#3d5166]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f8fb] text-[#0f3d57]">
              <Mail className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 truncate">{session.customerEmail}</span>
          </p>
        ) : (
          <span />
        )}
        {session.showPromoCode ? (
          appliedCoupon ? (
            <p className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px] text-[#5c6d80]">
              <span className="rounded-full bg-[#E7F6F2] px-2 py-0.5 font-semibold tracking-wide text-[#0F766E]">
                {appliedCoupon.code}
              </span>
              <span>
                saves {formatMoney(appliedCoupon.savings_cents, appliedCoupon.currency)}/{session.plan.interval}
              </span>
              <button
                type="button"
                onClick={() => void onRemoveCoupon()}
                disabled={couponLoading}
                className="font-medium text-[#1B4F8A] underline decoration-[#1B4F8A]/30 underline-offset-2 hover:decoration-[#1B4F8A]"
              >
                Remove
              </button>
            </p>
          ) : promoOpen ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                placeholder="Code"
                aria-label="Promo code"
                className="h-8 w-28 rounded-full border border-[#d7e3ee] bg-[#f7fafc] px-3 text-[12px] font-semibold uppercase tracking-wide text-[#0A2A43] outline-none focus:border-[#0d9488]"
              />
              <button
                type="button"
                onClick={() => void onApplyCoupon()}
                disabled={couponLoading || !couponCode.trim()}
                className="text-[12px] font-semibold text-[#0D9488] disabled:opacity-50"
              >
                {couponLoading ? "…" : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => setPromoOpen(false)}
                className="text-[12px] text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="text-[12px] font-medium text-[#1B4F8A] underline decoration-[#1B4F8A]/30 underline-offset-4 hover:decoration-[#1B4F8A]"
            >
              Have a promo code?
            </button>
          )
        ) : null}
      </div>

      <div className="havena-checkout-element min-w-0 overflow-hidden rounded-[1.15rem] bg-[#f4f8fb] p-2.5 ring-1 ring-[#e3edf4] sm:p-3">
        <div className="mb-2 flex items-center justify-between px-1.5 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b7c8f]">Card</p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-[#0f766e]">
            <Lock className="h-3 w-3" aria-hidden />
            Encrypted
          </p>
        </div>
        <div className="min-w-0 overflow-x-hidden rounded-[0.9rem] bg-white px-3 py-3 shadow-[0_1px_0_rgba(15,61,87,0.04)] sm:px-4">
          <PaymentElement id="havena-card-element" options={paymentElementOptions(compact)} />
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[#e6eef4] pt-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#6b7c8f]">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
                className={checkoutFieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#6b7c8f]">Mobile number</span>
              <input
                type="tel"
                autoComplete="tel"
                value={billingPhone}
                onChange={(event) => setBillingPhone(event.target.value)}
                className={checkoutFieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#6b7c8f]">Full name</span>
              <input
                type="text"
                autoComplete="name"
                value={billingName}
                onChange={(event) => setBillingName(event.target.value)}
                placeholder="First and last name"
                className={checkoutFieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#6b7c8f]">Billing country</span>
              <select
                value={billingCountry}
                onChange={(event) => setBillingCountry(event.target.value)}
                className={checkoutFieldClass}
              >
                <option value="">Select country</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {formError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="hidden sm:block">
        <SubmitCardButton session={session} submitting={submitting} stripeReady={Boolean(stripe)} />
        <CheckoutLegal session={session} />
      </div>

      <div className="h-24 sm:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:hidden">
        <SubmitCardButton session={session} submitting={submitting} stripeReady={Boolean(stripe)} />
      </div>
    </form>
  );
}

function SubmitCardButton({
  session,
  submitting,
  stripeReady,
}: {
  session: CheckoutSession;
  submitting: boolean;
  stripeReady: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={!stripeReady || submitting}
      className="flex h-14 w-full flex-col items-center justify-center rounded-2xl bg-[#0f3d57] text-white shadow-[0_12px_24px_-16px_rgba(15,61,87,0.9)] transition hover:bg-[#0c3349] focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        <Lock className="h-3.5 w-3.5 text-[#5eead4]" aria-hidden />
        {submitting
          ? session.trialDays > 0 && !session.trialStartsOnApproval
            ? "Starting your trial…"
            : "Saving your card…"
          : session.trialDays > 0
            ? session.trialStartsOnApproval
              ? "Save card"
              : `Start ${session.trialDays}-day free trial`
            : "Save card and resume billing"}
      </span>
      {session.trialDays > 0 ? (
        <span className="mt-0.5 text-[11px] font-medium text-white/65">Nothing is charged today</span>
      ) : null}
    </button>
  );
}

function CheckoutLegal({ session }: { session: CheckoutSession }) {
  return (
    <p className="mt-3 text-center text-[11px] leading-relaxed text-[#8aa0b3]">
      {session.trialDays <= 0
        ? "No hidden charges. You can cancel anytime. Billing starts on the plan you selected."
        : `No hidden charges. Your ${session.trialDays}-day trial starts after approval, and you can cancel anytime before the first charge.`}
    </p>
  );
}

function PayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compact = useCompactViewport();
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
    if (getUser()?.access?.billing_exempt) {
      router.replace("/admin");
      return;
    }

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
      const trialDays = result.trial_days ?? TRIAL_DAYS;
      const requiresReplacementCard = Boolean(
        result.requires_replacement_card ?? getUser()?.access?.requires_replacement_card,
      );
      const showPromoCode = result.promo_code_allowed !== false;
      setSession({
        clientSecret: result.client_secret,
        intentType: result.intent_type === "payment" ? "payment" : "setup",
        stripeSubscriptionId: result.stripe_setup_intent_id || result.stripe_subscription_id || "",
        publishableKey: result.publishable_key,
        trialDays,
        trialStartsOnApproval: result.trial_starts_on_approval !== false && !getUser()?.access?.platform_approved,
        requiresReplacementCard,
        showPromoCode,
        promoHint: promoHintForCheckout(trialDays, requiresReplacementCard),
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
      const message = apiError(err);
      if (/not required|BILLING_EXEMPT/i.test(message)) {
        router.replace("/admin");
        return;
      }
      setError(message);
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
          const next = step === "configure_resident_features" ? "await_approval" : step;
          router.replace(communityAdminOnboardingPath(next));
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

  if (loading && !session) return <PageLoader text="Preparing checkout…" variant="form" />;
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
    <div className="mx-auto w-full min-w-0 max-w-5xl pb-2 sm:pb-8">
      <Link
        href={withAppReturnParams("/admin/billing")}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to plans
      </Link>

      <div className="mt-3 grid min-w-0 gap-4 sm:mt-4 sm:gap-5 lg:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)] lg:items-start">
        <aside className="relative min-w-0 overflow-hidden rounded-[1.35rem] bg-[#0f3d57] p-4 text-white shadow-[0_18px_40px_-24px_rgba(15,61,87,0.85)] sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#14b8a6]/25 blur-2xl" aria-hidden />
          <p className="relative text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100/80 sm:text-[11px]">
            {session.trialDays > 0 ? `Try Havena ${session.plan.name}` : `Resume ${session.plan.name}`}
          </p>
          <h1 className="relative mt-1.5 font-[family-name:var(--font-brand)] text-[1.45rem] font-bold leading-tight sm:mt-2 sm:text-[1.75rem]">
            {formatMoney(billedPriceCents, session.plan.currency)}
            <span className="text-[0.95rem] font-semibold text-white/70"> / {period}</span>
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-white/75 sm:text-[13px]">
            {session.trialDays <= 0
              ? `Paid after approval. Your community already used its one-time free trial.`
              : `First ${session.trialDays} days on us${
                  appliedCoupon
                    ? ` (${formatMoney(originalPriceCents, session.plan.currency)} before discount)`
                    : ""
                }. ${
                  session.trialStartsOnApproval
                    ? "The trial starts when you’re approved — first charge after it ends."
                    : `First charge ${trialEnd}.`
                }`}
          </p>

          <ul className="mt-4 grid grid-cols-1 gap-2 border-t border-white/15 pt-3 text-[12px] text-white/85 sm:mt-5 sm:grid-cols-2 sm:gap-2.5 sm:pt-4 lg:grid-cols-1 lg:text-[13px]">
            {session.trialDays > 0 ? (
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
                First {session.trialDays} days included
              </li>
            ) : (
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
                Paid subscription — no free trial
              </li>
            )}
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              {session.plan.seat_limit} resident seats
            </li>
            <li className="flex min-w-0 items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              <span className="truncate">For {session.communityName}</span>
            </li>
            <li className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-300" aria-hidden />
              {session.trialDays <= 0
                ? "Billing starts after approval"
                : session.trialStartsOnApproval
                  ? "Card saved now — trial starts after approval"
                  : "Card billed in USD after trial"}
            </li>
          </ul>
        </aside>

        <section className="relative z-10 min-w-0 overflow-hidden rounded-[1.35rem] border border-[#e3edf4] bg-white shadow-[0_18px_40px_-28px_rgba(15,61,87,0.55)]">
          <div className="h-1 bg-gradient-to-r from-[#0f3d57] via-[#0d9488] to-[#5eead4]" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pb-0 pt-4 sm:px-5 sm:pt-5">
            <div>
              <h2 className="font-[family-name:var(--font-brand)] text-[1.05rem] font-semibold text-[#0f3d57]">
                Payment
              </h2>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[#6b7c8f]">
                {session.trialDays > 0
                  ? `No hidden charges. ${session.trialDays}-day trial. Cancel anytime.`
                  : "No hidden charges. Cancel anytime."}
              </p>
            </div>
            {session.trialDays > 0 ? (
              <p className="shrink-0 rounded-full bg-[#f3fbf8] px-2.5 py-1 text-[11px] font-semibold text-[#0f766e]">
                Due today {formatMoney(0, session.plan.currency)}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <Elements
              key={`${session.clientSecret}-${compact ? "m" : "d"}`}
              stripe={stripePromise}
              options={{
                clientSecret: session.clientSecret,
                appearance: stripeAppearance(compact),
              }}
            >
              <CheckoutForm
                session={session}
                compact={compact}
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
    <Suspense fallback={<PageLoader text="Preparing checkout…" variant="form" />}>
      <PayInner />
    </Suspense>
  );
}
