/** Public marketing plans — mirrors backend config/billing.php seat packs. */

export type PublicPlan = {
  slug: string;
  name: string;
  description: string;
  seatLimit: number;
  monthlyCents: number;
  yearlyCents: number;
  recommended?: boolean;
};

export const publicPlans: PublicPlan[] = [
  {
    slug: "starter",
    name: "Starter",
    description: "For smaller communities getting started.",
    seatLimit: 50,
    monthlyCents: 9900,
    yearlyCents: 99000,
  },
  {
    slug: "growth",
    name: "Growth",
    description: "For mid-size neighborhoods and HOAs.",
    seatLimit: 150,
    monthlyCents: 24900,
    yearlyCents: 249000,
    recommended: true,
  },
  {
    slug: "campus",
    name: "Campus",
    description: "For large communities and multi-building campuses.",
    seatLimit: 500,
    monthlyCents: 59900,
    yearlyCents: 599000,
  },
];

export function formatPlanPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
