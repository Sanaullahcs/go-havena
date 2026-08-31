"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { formatPlanPrice, type PublicPlan } from "@/lib/landing/pricing";
import { fetchPublicBillingPlans } from "@/lib/api/subscription-plans";
import {
  planCheckoutPath,
  planLoginPath,
  type BillingInterval,
} from "@/lib/api/billing";
import { canAccessCommunityDashboard, getToken, getUser } from "@/lib/auth/session";

export function Pricing({ hideIntro = false }: { hideIntro?: boolean }) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("month");
  /** null until client session is read — avoids SSR guessing. */
  const [signedInAdmin, setSignedInAdmin] = useState<boolean | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const token = getToken();
      const user = getUser();
      setSignedInAdmin(Boolean(token && canAccessCommunityDashboard(user)));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("nbr-session-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("nbr-session-updated", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBillingPlans()
      .then((res) => {
        if (cancelled) return;
        setPlans(
          (res.data ?? []).map((plan) => ({
            slug: plan.slug,
            name: plan.name,
            description: plan.description,
            seatLimit: plan.seat_limit,
            monthlyCents: plan.price_monthly_cents,
            yearlyCents: plan.price_yearly_cents,
            trialDays: plan.trial_period_days,
            recommended: plan.recommended,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setPlansError("Plans are temporarily unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToPlan = (slug: string) => {
    const token = getToken();
    const user = getUser();
    if (token && canAccessCommunityDashboard(user)) {
      router.push(planCheckoutPath(slug, interval));
      return;
    }
    router.push(planLoginPath(slug, interval));
  };

  return (
    <section id="pricing" className="lp-section lp-pricing scroll-mt-28">
      <Container size="xl">
        <div className={hideIntro ? "lp-pricing__head lp-pricing__head--compact" : "lp-pricing__head"}>
          {hideIntro ? null : (
            <>
              <p className="lp-label">Subscriptions</p>
              <h2 className="lp-title">One plan for the whole community</h2>
              <p className="lp-body lp-pricing__lede">
                Community admins pay for seats. Residents never pay Havena — you invite them into your
                seat pool.
              </p>
            </>
          )}

          <div className="lp-pricing__toggle" role="group" aria-label="Billing interval">
            <button
              type="button"
              className={interval === "month" ? "is-active" : undefined}
              onClick={() => setInterval("month")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={interval === "year" ? "is-active" : undefined}
              onClick={() => setInterval("year")}
            >
              Yearly
            </button>
          </div>
        </div>

        <ol className="lp-pricing__flow" aria-label="What happens when you choose a plan">
          <li>
            <span>1</span>
            {signedInAdmin ? "Open Billing with your plan" : "Create account or sign in (email OTP)"}
          </li>
          <li>
            <span>2</span>
            {signedInAdmin ? "Stripe checkout" : "Name your community → Stripe checkout"}
          </li>
          <li>
            <span>3</span>
            Seats unlock — invite residents
          </li>
        </ol>

        {plansError ? (
          <p className="lp-body">{plansError}</p>
        ) : (
          <div className="lp-pricing__grid">
            {plans.map((plan) => {
              const price = interval === "year" ? plan.yearlyCents : plan.monthlyCents;
              const href = signedInAdmin
                ? planCheckoutPath(plan.slug, interval)
                : planLoginPath(plan.slug, interval);
              const cta =
                signedInAdmin === null
                  ? `Get ${plan.name}`
                  : signedInAdmin
                    ? `Checkout ${plan.name}`
                    : `Sign in for ${plan.name}`;

              return (
                <article
                  key={plan.slug}
                  className={["lp-pricing__card", plan.recommended ? "is-recommended" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {plan.recommended ? (
                    <span className="lp-pricing__badge">Most popular</span>
                  ) : null}
                  <h3 className="lp-pricing__name">{plan.name}</h3>
                  <p className="lp-pricing__desc">{plan.description}</p>
                  <p className="lp-pricing__price">
                    {formatPlanPrice(price)}
                    <span>/{interval === "year" ? "year" : "month"}</span>
                  </p>
                  {plan.trialDays > 0 ? (
                    <p className="lp-pricing__trial">First {plan.trialDays} days on us — billed after</p>
                  ) : (
                    <p className="lp-pricing__trial">Billed from day one after approval</p>
                  )}
                  <p className="lp-pricing__seats">{plan.seatLimit} resident seats</p>
                  <ul className="lp-pricing__features">
                    <li>Admin dashboard & member invites</li>
                    <li>Notices, events, and alerts</li>
                    <li>Amenities, feed, and wellness</li>
                    <li>Residents join free via invite</li>
                  </ul>
                  <Button
                    href={href}
                    link={false}
                    onClick={(e) => {
                      e.preventDefault();
                      goToPlan(plan.slug);
                    }}
                    variant={plan.recommended ? "primary" : "secondary"}
                    size="lg"
                    fullWidth
                    iconTrailing="arrow-right"
                  >
                    {cta}
                  </Button>
                </article>
              );
            })}
          </div>
        )}

        <p className="lp-pricing__footnote">
          {signedInAdmin
            ? "You’re signed in as a community admin — choosing a plan opens Billing and starts checkout."
            : "You’re not signed in. Choosing a plan opens admin login; after OTP you go straight to Billing checkout for that plan."}
        </p>
      </Container>
    </section>
  );
}

export default Pricing;
