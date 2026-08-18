import api from "./client";
import { getManagedCommunityId } from "@/lib/auth/session";

export type BillingInterval = "month" | "year";

export interface BillingPlan {
  slug: string;
  name: string;
  description: string;
  seat_limit: number;
  price_monthly_cents: number;
  price_yearly_cents: number;
  trial_period_days: number;
  currency: string;
  recommended: boolean;
  has_stripe_prices: boolean;
}

export interface BillingSeats {
  seats_used: number;
  seat_limit: number;
  seats_available: number;
  has_subscription: boolean;
  subscription_status: string | null;
  allows_allocation: boolean;
  in_grace: boolean;
  grace_ends_at: string | null;
  plan_slug: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface BillingSubscription {
  plan_slug: string;
  plan_name: string;
  billing_interval: string;
  status: string;
  seat_limit: number;
  extra_seats: number;
  total_seat_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_ends_at: string | null;
  allows_allocation: boolean;
  in_grace: boolean;
  card_on_file?: boolean;
  trial_pending_approval?: boolean;
  admin_transition?: boolean;
  leftover_ends_at?: string | null;
  has_leftover_service?: boolean;
  requires_replacement_card?: boolean;
  trial_consumed?: boolean;
  inherited_plan_slug?: string | null;
}

export interface BillingSetup {
  community_details_complete: boolean;
  community_approved: boolean;
  subscription_active: boolean;
  can_invite_residents: boolean;
  card_on_file?: boolean;
  trial_pending_approval?: boolean;
  admin_transition?: boolean;
  has_leftover_service?: boolean;
  requires_replacement_card?: boolean;
}

export interface BillingPayload {
  community: {
    id: number;
    name: string;
    status: string;
    review_status: string | null;
    estimated_residents: number | null;
    is_active_for_residents: boolean;
  };
  plans: BillingPlan[];
  recommended_plan: string;
  trial_period_days?: number;
  subscription: BillingSubscription | null;
  seats: BillingSeats;
  billing: {
    enabled: boolean;
    enforce: boolean;
    driver: string;
    stripe_configured: boolean;
    publishable_key: string | null;
  };
  setup: BillingSetup;
  coupon?: BillingCouponSummary | null;
}

export interface BillingCouponSummary {
  id: number;
  code: string;
  discount_type: "percent" | "fixed";
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string;
  discount_duration: "once" | "repeating" | "forever";
  discount_months: number | null;
  plan_slug: string;
  billing_interval: string;
  status: string;
  original_price_cents: number;
  discounted_price_cents: number;
  savings_cents: number;
  is_pending?: boolean;
  redeemed_at?: string | null;
  applied_at?: string | null;
}

function communityParams(communityId?: number | null) {
  const id = communityId ?? getManagedCommunityId();
  return id ? { community_id: id } : {};
}

export async function fetchBilling(communityId?: number | null): Promise<BillingPayload> {
  const { data } = await api.get("/v1/admin/billing", { params: communityParams(communityId) });
  return data.data as BillingPayload;
}

export async function startBillingCheckout(input: {
  plan_slug: string;
  interval?: BillingInterval;
  estimated_residents?: number;
  community_id?: number;
  /** Current browser origin so Stripe returns to the same host (localhost vs LAN). */
  return_origin?: string;
}): Promise<{
  mode: "stripe" | "manual" | "elements" | "already_active";
  checkout_url?: string | null;
  session_id?: string;
  client_secret?: string;
  intent_type?: "setup" | "payment";
  stripe_subscription_id?: string;
  stripe_setup_intent_id?: string;
  trial_starts_on_approval?: boolean;
  publishable_key?: string | null;
  trial_days?: number;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  community_name?: string;
  plan?: {
    slug: string;
    name: string;
    seat_limit: number;
    interval: BillingInterval;
    price_cents: number;
    currency: string;
  };
  coupon?: BillingCouponSummary | null;
  message?: string;
}> {
  const returnOrigin =
    input.return_origin ||
    (typeof window !== "undefined" ? window.location.origin : undefined);

  const { data } = await api.post(
    "/v1/admin/billing/checkout",
    {
      ...communityParams(input.community_id),
      plan_slug: input.plan_slug,
      interval: input.interval ?? "month",
      estimated_residents: input.estimated_residents,
      return_origin: returnOrigin,
    },
    { timeout: 45_000 },
  );
  return data.data;
}

export async function confirmBillingCheckout(
  sessionId: string,
  communityId?: number | null,
): Promise<BillingPayload> {
  const { data } = await api.post(
    "/v1/admin/billing/confirm-checkout",
    {
      ...communityParams(communityId),
      session_id: sessionId,
    },
    { timeout: 45_000 },
  );
  return data.data as BillingPayload;
}

export async function confirmElementsCheckout(
  stripeSubscriptionId: string,
  communityId?: number | null,
): Promise<BillingPayload> {
  const { data } = await api.post(
    "/v1/admin/billing/confirm-checkout",
    {
      ...communityParams(communityId),
      ...(stripeSubscriptionId.startsWith("seti_")
        ? { stripe_setup_intent_id: stripeSubscriptionId }
        : { stripe_subscription_id: stripeSubscriptionId }),
    },
    { timeout: 45_000 },
  );
  return data.data as BillingPayload;
}

export async function openBillingPortal(communityId?: number | null): Promise<string> {
  const { data } = await api.post(
    "/v1/admin/billing/portal",
    communityParams(communityId),
    { timeout: 45_000 },
  );
  return data.data.portal_url as string;
}

export async function changeBillingPlan(input: {
  plan_slug: string;
  interval?: BillingInterval;
  community_id?: number;
}): Promise<BillingPayload> {
  const { data } = await api.post(
    "/v1/admin/billing/change-plan",
    {
      ...communityParams(input.community_id),
      plan_slug: input.plan_slug,
      interval: input.interval ?? "month",
    },
    { timeout: 45_000 },
  );
  return data.data as BillingPayload;
}

export function formatMoney(cents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/** Landing/pricing CTA target for a plan. */
export function planCheckoutPath(planSlug: string, interval: BillingInterval = "month"): string {
  return `/admin/billing?plan=${encodeURIComponent(planSlug)}&interval=${interval}`;
}

export function planLoginPath(planSlug: string, interval: BillingInterval = "month"): string {
  return `/login?plan=${encodeURIComponent(planSlug)}&interval=${interval}`;
}

export async function applyBillingCoupon(input: {
  code: string;
  plan_slug: string;
  interval?: BillingInterval;
  community_id?: number;
}): Promise<{ coupon: BillingCouponSummary; billing: BillingPayload }> {
  const { data } = await api.post(
    "/v1/admin/billing/coupon/apply",
    {
      ...communityParams(input.community_id),
      code: input.code,
      plan_slug: input.plan_slug,
      interval: input.interval ?? "month",
    },
    { timeout: 45_000 },
  );
  return data.data;
}

export async function removeBillingCoupon(communityId?: number | null): Promise<BillingPayload> {
  const { data } = await api.delete("/v1/admin/billing/coupon", {
    params: communityParams(communityId),
    timeout: 45_000,
  });
  return data.data as BillingPayload;
}
