import api from "./client";

export type CouponDiscountType = "percent" | "fixed";
export type CouponDiscountDuration = "once" | "repeating" | "forever";

export interface SubscriptionCoupon {
  id: number;
  code: string;
  name: string;
  description: string | null;
  discount_type: CouponDiscountType;
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string;
  discount_duration: CouponDiscountDuration;
  discount_months: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  reserved_redemptions: number;
  applicable_plan_slugs: string[] | null;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
  has_stripe_coupon: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionCouponListResponse {
  data: SubscriptionCoupon[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    stripe_configured: boolean;
    currency: string;
  };
}

export async function fetchSubscriptionCoupons(params?: Record<string, unknown>): Promise<SubscriptionCouponListResponse> {
  const res = await api.get("/v1/admin/subscription-coupons", { params });
  return res.data as SubscriptionCouponListResponse;
}

export async function createSubscriptionCoupon(data: Record<string, unknown>): Promise<SubscriptionCoupon> {
  const res = await api.post("/v1/admin/subscription-coupons", data, { timeout: 45_000 });
  return res.data.data as SubscriptionCoupon;
}

export async function updateSubscriptionCoupon(id: number, data: Record<string, unknown>): Promise<SubscriptionCoupon> {
  const res = await api.put(`/v1/admin/subscription-coupons/${id}`, data, { timeout: 45_000 });
  return res.data.data as SubscriptionCoupon;
}

export async function setSubscriptionCouponStatus(id: number, isActive: boolean): Promise<SubscriptionCoupon> {
  const res = await api.post(`/v1/admin/subscription-coupons/${id}/status`, { is_active: isActive });
  return res.data.data as SubscriptionCoupon;
}
