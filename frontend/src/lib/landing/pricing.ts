/** Public marketing plan shape — values come from GET /v1/billing/plans. */

export type PublicPlan = {
  slug: string;
  name: string;
  description: string;
  seatLimit: number;
  monthlyCents: number;
  yearlyCents: number;
  trialDays: number;
  recommended?: boolean;
};

export function formatPlanPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  })
    .format(cents / 100)
    .replace(/^US\s?/, "");
}
