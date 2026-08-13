import api from "./client";

export type SubscriptionPlanStatus = "active" | "inactive";

export interface SubscriptionPlan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  seat_limit: number;
  price_monthly_cents: number;
  price_yearly_cents: number;
  trial_period_days: number;
  stripe_product_id: string | null;
  stripe_price_monthly: string | null;
  stripe_price_yearly: string | null;
  is_active: boolean;
  is_recommended: boolean;
  sort_order: number;
  has_stripe_prices: boolean;
  subscriber_count: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionPlanPayload {
  name: string;
  slug?: string;
  description?: string | null;
  seat_limit: number;
  price_monthly_cents: number;
  price_yearly_cents: number;
  trial_period_days: number;
  sort_order?: number;
  is_active?: boolean;
  is_recommended?: boolean;
}

export async function fetchSubscriptionPlans(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/subscription-plans", { params });
  return res.data as {
    data: SubscriptionPlan[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stripe_configured: boolean;
      currency: string;
    };
  };
}

export async function createSubscriptionPlan(data: SubscriptionPlanPayload) {
  const res = await api.post("/v1/admin/subscription-plans", data, { timeout: 45_000 });
  return res.data as { data: SubscriptionPlan; message: string };
}

export async function updateSubscriptionPlan(id: number, data: Partial<SubscriptionPlanPayload>) {
  const res = await api.put(`/v1/admin/subscription-plans/${id}`, data, { timeout: 45_000 });
  return res.data as { data: SubscriptionPlan; message: string };
}

export async function setSubscriptionPlanStatus(id: number, isActive: boolean) {
  const res = await api.patch(`/v1/admin/subscription-plans/${id}/status`, { is_active: isActive });
  return res.data as { data: SubscriptionPlan; message: string };
}

export async function fetchPublicBillingPlans() {
  const res = await api.get("/v1/billing/plans");
  return res.data as {
    data: Array<{
      slug: string;
      name: string;
      description: string;
      seat_limit: number;
      price_monthly_cents: number;
      price_yearly_cents: number;
      trial_period_days: number;
      currency: string;
      recommended: boolean;
    }>;
    currency: string;
  };
}
