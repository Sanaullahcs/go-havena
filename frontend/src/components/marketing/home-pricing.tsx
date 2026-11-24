"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building, Building2, Calendar, Check, Home, Landmark, Sparkles, Users, X, Zap } from "lucide-react";
import api from "@/lib/api/client";

type Tier = { min: number; max: number | null; unit_cents: number | null; fixed_cents: number | null };
type RateBook = {
  minimum_monthly_cents: number;
  annual_discount_bps: number;
  currency: string;
  tiers: Tier[];
};
type RateCard = Record<string, Record<string, RateBook>>;
type Quote = {
  quote_required: boolean;
  monthly_cents: number | null;
  annual_cents: number | null;
  annual_before_discount_cents: number | null;
  discount_cents: number;
  currency: string;
};

const RATE_PLAN_SLUG = "professional";

const PACKAGES = [
  {
    id: "p50",
    residents: 50,
    title: "Starter",
    capacity: "Up to 100 residents",
    note: "Pilot programs and boutique HOAs getting their first digital home.",
  },
  {
    id: "p500",
    residents: 500,
    title: "Growth",
    capacity: "101–500 residents",
    note: "Flat fee for this size band — grows with you into Standard, not step-by-step.",
  },
  {
    id: "p1000",
    residents: 1000,
    title: "Standard",
    capacity: "501–2,500 residents",
    note: "One flat monthly fee for the whole band — not priced per extra household.",
    featured: true,
  },
  {
    id: "p5000",
    residents: 5000,
    title: "Scale",
    capacity: "2,501–10,000 residents",
    note: "Large populations with a single community invoice at volume.",
  },
  {
    id: "custom",
    residents: null,
    title: "Custom",
    capacity: "5,000+ residents or multi-site",
    note: "Volume, sites, and rollout — scoped in a written quote before you go live.",
  },
] as const;

const TIER_PACKAGES = PACKAGES.filter((pack) => pack.residents !== null);
const CUSTOM_PACKAGE = PACKAGES[4];

const PACKAGE_ICONS = {
  p50: Home,
  p500: Building2,
  p1000: Landmark,
  p5000: Building,
  custom: Sparkles,
} as const;

type PackageId = (typeof PACKAGES)[number]["id"];
type TierPackage = (typeof TIER_PACKAGES)[number];

const FULL_FEATURES = [
  "Notices, alerts, and events",
  "Private community feed",
  "Direct messages",
  "Resident mobile app",
  "Directory and profiles",
  "Documents and house rules",
  "Complaints and requests",
  "Amenity reservations",
  "Billing and marketplace",
  "Multi-community portfolio",
] as const;

/** Shown on each tier card so value is visible before scrolling. */
const CARD_FEATURE_PICKS = [
  "Resident mobile app",
  "Notices, alerts, and events",
  "Amenity reservations",
  "Billing and marketplace",
] as const;

function residentSizeLabel(residents: number) {
  if (residents >= 1000) {
    return residents % 1000 === 0 ? `${residents / 1000}K` : residents.toLocaleString();
  }
  return String(residents);
}

function PricingFeatureSheet({ id, split, className }: { id?: string; split?: boolean; className?: string }) {
  return (
    <div
      className={`lp-pricing__feature-sheet${split ? " lp-pricing__feature-sheet--split" : ""}${className ? ` ${className}` : ""}`}
      id={id}
    >
      <div className="lp-pricing__feature-sheet-head">
        <p className="lp-pricing__feature-sheet-eyebrow">One complete product</p>
        <h3 className="lp-pricing__feature-sheet-title">The full Havena platform on every plan</h3>
        <p className="lp-pricing__feature-sheet-lead">
          Operations stay calm for your board. Residents get a polished app. No tiers, no locked modules.
        </p>
      </div>
      <ul className="lp-pricing__feature-sheet-grid">
        {FULL_FEATURES.map((item) => (
          <li key={item}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const RESIDENT_PRESETS = [50, 500, 1000, 5000] as const;
const MIN_RESIDENTS = 50;
const RESIDENT_STEP = 50;
const RESIDENT_SLIDER_MAX = 5000;

function billingModelLabel(model: "per_community" | "per_resident") {
  return model === "per_community" ? "Per Community" : "Per Resident";
}

function graduated(residents: number, tiers: Tier[]): number | null {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  let remaining = residents;
  let cursor = 1;
  let total = 0;
  for (const tier of sorted) {
    if (remaining <= 0) break;
    const min = Math.max(1, tier.min);
    const max = tier.max;
    if (max != null && max < min) return null;
    if (min > cursor) return null;
    const bandEnd = max ?? cursor + remaining - 1;
    const take = Math.min(remaining, bandEnd - cursor + 1);
    if (take > 0) {
      total += take * Math.max(0, tier.unit_cents ?? 0);
      remaining -= take;
      cursor += take;
    }
  }
  return remaining > 0 ? null : total;
}

function communityBand(residents: number, tiers: Tier[]): number | null {
  for (const tier of tiers) {
    const min = Math.max(1, tier.min);
    if (residents < min) continue;
    if (tier.max != null && residents > tier.max) continue;
    return tier.fixed_cents == null ? null : Math.max(0, tier.fixed_cents);
  }
  return null;
}

function quotePlan(book: RateBook | undefined, model: "per_community" | "per_resident", residents: number): Quote {
  const empty: Quote = {
    quote_required: true,
    monthly_cents: null,
    annual_cents: null,
    annual_before_discount_cents: null,
    discount_cents: 0,
    currency: book?.currency || "USD",
  };
  if (!book || residents < 1) return empty;
  let monthly = model === "per_resident" ? graduated(residents, book.tiers) : communityBand(residents, book.tiers);
  if (monthly == null) return empty;
  if (model === "per_resident" && book.minimum_monthly_cents > monthly) monthly = book.minimum_monthly_cents;
  const annualFull = monthly * 12;
  const discount = Math.floor((annualFull * book.annual_discount_bps) / 10000);
  return {
    quote_required: false,
    monthly_cents: monthly,
    annual_cents: annualFull - discount,
    annual_before_discount_cents: annualFull,
    discount_cents: discount,
    currency: book.currency || "USD",
  };
}

function money(cents: number | null | undefined, currency = "USD", digits = 0) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}

type PackagePrice = {
  quote: boolean;
  monthlyLabel: string | null;
  annualLabel: string | null;
  perResidentLabel: string | null;
};

export function MarketingPricing() {
  const [model, setModel] = useState<"per_community" | "per_resident">("per_community");
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [residents, setResidents] = useState(500);
  const [draft, setDraft] = useState("500");
  const [discountBps, setDiscountBps] = useState(0);
  const [rateCard, setRateCard] = useState<RateCard>({});
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quotePackage, setQuotePackage] = useState<(typeof PACKAGES)[number]>(PACKAGES[4]);
  const [quoteForm, setQuoteForm] = useState({ organization_name: "", contact_name: "", email: "", notes: "" });
  const [quoteError, setQuoteError] = useState("");
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    if (!quoteOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuoteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [quoteOpen]);

  const openQuote = (pack: (typeof PACKAGES)[number]) => {
    setQuotePackage(pack);
    setQuoteError("");
    setQuoteSent(false);
    setQuoteOpen(true);
  };

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
        residents: quotePackage.residents ?? 10000,
        communities: 1,
        billing_model: model,
        interval,
        notes: [`Package: ${quotePackage.title}`, quoteForm.notes.trim()].filter(Boolean).join("\n"),
      });
      setQuoteSent(true);
    } catch {
      setQuoteError("We could not send that just now. Please try again.");
    } finally {
      setQuoteSending(false);
    }
  };

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(false);
    try {
      const res = await api.get("/v1/billing/saas/catalog", { params: { currency: "USD" } });
      setDiscountBps(res.data.annual_discount_bps ?? 0);
      setRateCard(res.data.rate_card ?? {});
    } catch {
      setRateCard({});
      setCatalogError(true);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const communityBook = rateCard.per_community?.[RATE_PLAN_SLUG];
  const residentBook = rateCard.per_resident?.[RATE_PLAN_SLUG];
  const communityReady = Boolean(communityBook);
  const residentReady = Boolean(residentBook);
  const pricingReady = model === "per_community" ? communityReady : residentReady;

  const setCount = (value: number) => {
    const rounded = Math.round(value / RESIDENT_STEP) * RESIDENT_STEP;
    const next = Math.min(10_000_000, Math.max(MIN_RESIDENTS, rounded));
    setResidents(next);
    setDraft(String(next));
  };

  const communityPackagePrices = useMemo(() => {
    const out = {} as Record<PackageId, PackagePrice>;
    if (!communityBook) {
      for (const pack of PACKAGES) {
        out[pack.id] = {
          quote: pack.residents === null,
          monthlyLabel: null,
          annualLabel: null,
          perResidentLabel: null,
        };
      }
      return out;
    }
    for (const pack of PACKAGES) {
      if (pack.residents === null) {
        out[pack.id] = { quote: true, monthlyLabel: null, annualLabel: null, perResidentLabel: null };
        continue;
      }
      const q = quotePlan(communityBook, "per_community", pack.residents);
      const currency = q.currency || "USD";
      const shownCents =
        interval === "year" && q.annual_cents != null ? Math.round(q.annual_cents / 12) : q.monthly_cents;
      out[pack.id] = {
        quote: q.quote_required,
        monthlyLabel: shownCents != null ? money(shownCents, currency) : null,
        annualLabel: interval === "year" && q.annual_cents != null ? money(q.annual_cents, currency) : null,
        perResidentLabel:
          shownCents != null && pack.residents > 0
            ? money(Math.round(shownCents / pack.residents), currency, 2)
            : null,
      };
    }
    return out;
  }, [communityBook, interval]);

  const residentPrice = useMemo(() => {
    if (!residentBook) {
      return { quote: false, monthlyLabel: null, annualLabel: null, eachLabel: null, totalLabel: null };
    }
    const q = quotePlan(residentBook, "per_resident", residents);
    const currency = q.currency || "USD";
    const shownCents =
      interval === "year" && q.annual_cents != null ? Math.round(q.annual_cents / 12) : q.monthly_cents;
    return {
      quote: q.quote_required,
      monthlyLabel: shownCents != null ? money(shownCents, currency) : null,
      annualLabel: interval === "year" && q.annual_cents != null ? money(q.annual_cents, currency) : null,
      eachLabel:
        shownCents != null && residents > 0 ? money(Math.round(shownCents / residents), currency, 2) : null,
      totalLabel: shownCents != null ? money(shownCents, currency) : null,
    };
  }, [residentBook, residents, interval]);

  const residentSliderPct = useMemo(() => {
    const clamped = Math.min(Math.max(residents, MIN_RESIDENTS), RESIDENT_SLIDER_MAX);
    const span = RESIDENT_SLIDER_MAX - MIN_RESIDENTS;
    return span > 0 ? ((clamped - MIN_RESIDENTS) / span) * 100 : 0;
  }, [residents]);

  const residentRangeStyle = useMemo(
    () => ({ "--slider-pct": `${residentSliderPct}%` }) as CSSProperties,
    [residentSliderPct],
  );

  const renderTierCard = (pack: TierPackage) => {
    const price = communityPackagePrices[pack.id];
    const featured = "featured" in pack && pack.featured;
    const Icon = PACKAGE_ICONS[pack.id];
    const needsQuote = communityReady && Boolean(price?.quote);
    const waiting = catalogLoading && !communityReady;
    return (
      <article
        key={pack.id}
        className={`lp-pricing__card lp-pricing__card--tier${featured ? " is-recommended" : ""}${needsQuote ? " is-quoting" : ""}`}
        aria-busy={waiting}
      >
        {featured ? <p className="lp-pricing__badge">Most popular</p> : null}
        <div className="lp-pricing__card-head">
          <div className="lp-pricing__card-top">
            <span className="lp-pricing__glyph" aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h3>{pack.title}</h3>
              <p>{pack.capacity}</p>
            </div>
          </div>
          <span className="lp-pricing__size" aria-hidden>
            {residentSizeLabel(pack.residents)}
          </span>
        </div>
        <p className="lp-pricing__bill-note">{pack.note}</p>
        <div className="lp-pricing__card-includes">
          <p className="lp-pricing__includes-label">Included in Havena</p>
          <ul className="lp-pricing__card-features">
            {CARD_FEATURE_PICKS.map((item) => (
              <li key={item}>
                <Check className="h-3 w-3" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <a className="lp-pricing__includes-jump" href="#pricing-platform-features">
            View all {FULL_FEATURES.length} capabilities
          </a>
        </div>
        <div className="lp-pricing__bill">
          {needsQuote ? (
            <>
              <p className="lp-pricing__custom-title">Let’s scope it</p>
              <p className="lp-pricing__bill-note">Tell us your headcount — we’ll recommend the right package.</p>
            </>
          ) : (
            <>
              <p className="lp-pricing__price">
                {communityReady ? price?.monthlyLabel ?? "—" : "···"}
                <span>/mo</span>
              </p>
              <p
                className={`lp-pricing__annual${
                  interval === "year" && communityReady && price?.annualLabel ? "" : " lp-pricing__annual--empty"
                }`}
              >
                {interval === "year" && communityReady && price?.annualLabel ? (
                  <>Paid annually at {price.annualLabel}</>
                ) : null}
              </p>
              <p className="lp-pricing__each">
                {communityReady && price?.perResidentLabel ? (
                  <>About {price.perResidentLabel} per resident at this example size</>
                ) : (
                  <span aria-hidden>&nbsp;</span>
                )}
              </p>
              {!needsQuote && communityReady ? (
                <p className="lp-pricing__band-hint">Flat fee for the resident band shown in the title.</p>
              ) : null}
            </>
          )}
        </div>
        {needsQuote ? (
          <button type="button" className="lp-pricing__cta" onClick={() => openQuote(pack)}>
            Request a quote
          </button>
        ) : (
          <Link href="/register" className="lp-pricing__cta">
            Get started
          </Link>
        )}
      </article>
    );
  };

  return (
    <section id="pricing" className={`lp-pricing${model === "per_resident" ? " is-resident" : " is-community"}`}>
      <div className="lp-pricing__wash" aria-hidden />
      <div className="lp-container lp-pricing__inner">
        <div className="lp-pricing__hero">
          <p className="lp-eyebrow">Pricing</p>
          <div className="lp-pricing__headline">
            <h2 className="lp-pricing__title">
              <span className="lp-pricing__title-plain">One platform.</span>
              <span className="lp-pricing__title-accent">Every community.</span>
            </h2>
            <p className="lp-pricing__lead">
              <span>
                {model === "per_community"
                  ? "Pick a package that matches your headcount — every capability included from day one."
                  : "Model pricing from resident count — one total invoice to the association."}
              </span>
              <span>Havena is billed to the community. Residents are never charged.</span>
            </p>
          </div>
        </div>

        <div className="lp-pricing__controls">
          <div className="lp-pricing__controls-top">
            <div className="lp-pricing__modes" role="radiogroup" aria-label="How you pay">
              <button
                type="button"
                role="radio"
                aria-checked={model === "per_community"}
                className={model === "per_community" ? "is-on" : ""}
                onClick={() => setModel("per_community")}
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                Per Community
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={model === "per_resident"}
                className={model === "per_resident" ? "is-on" : ""}
                onClick={() => setModel("per_resident")}
              >
                <Users className="h-3.5 w-3.5" aria-hidden />
                Per Resident
              </button>
            </div>
            <span className="lp-pricing__divider" aria-hidden />
            <div className="lp-pricing__cycle">
              <span className="lp-pricing__cycle-label">
                <Calendar className="h-4 w-4" aria-hidden />
                Billing
              </span>
              <div className="lp-pricing__toggle" role="group" aria-label="Billing cycle">
                <button type="button" aria-pressed={interval === "month"} className={interval === "month" ? "is-on" : ""} onClick={() => setInterval("month")}>
                  Monthly
                </button>
                <button type="button" aria-pressed={interval === "year"} className={interval === "year" ? "is-on" : ""} onClick={() => setInterval("year")}>
                  Yearly
                  {discountBps > 0 ? <span className="lp-pricing__save">−{discountBps / 100}%</span> : null}
                </button>
              </div>
            </div>
          </div>
        </div>

        {catalogError && !pricingReady ? (
          <div className="lp-pricing__catalog-status lp-pricing__catalog-status--error" role="alert">
            <p>We couldn’t load live rates. Start the Havena API locally, or retry in a moment.</p>
            <button type="button" className="lp-pricing__cta" onClick={() => void loadCatalog()}>
              Retry
            </button>
          </div>
        ) : null}

        {model === "per_community" ? (
          <div className="lp-pricing__deck">
            <div className="lp-pricing__platform">
              <div className="lp-pricing__grid">{TIER_PACKAGES.map((pack) => renderTierCard(pack))}</div>
              <div className="lp-pricing__platform-row">
                <PricingFeatureSheet id="pricing-platform-features" split />
                <article className="lp-pricing__card is-custom lp-pricing__custom-panel">
                  <div className="lp-pricing__card-top">
                    <span className="lp-pricing__glyph" aria-hidden>
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h3>{CUSTOM_PACKAGE.title}</h3>
                      <p>{CUSTOM_PACKAGE.capacity}</p>
                    </div>
                  </div>
                  <div className="lp-pricing__custom-panel-body">
                    <p className="lp-pricing__custom-title">Pricing built with you</p>
                    <p className="lp-pricing__bill-note">{CUSTOM_PACKAGE.note}</p>
                    <p className="lp-pricing__custom-footnote">Same full platform — no reduced feature set.</p>
                  </div>
                  <button type="button" className="lp-pricing__cta" onClick={() => openQuote(CUSTOM_PACKAGE)}>
                    Request a quote
                  </button>
                </article>
              </div>
            </div>
          </div>
        ) : (
          <div className="lp-pricing__deck">
            <div className="lp-pricing__platform lp-pricing__platform--resident">
              <div className="lp-pricing__resident-studio">
                <div className="lp-pricing__resident-row-one">
                  <section className="lp-pricing__resident-plan" aria-label="Community size">
                    <p className="lp-pricing__resident-kicker">Plan your community</p>
                    <h3 className="lp-pricing__resident-plan-title">Community size</h3>
                    <p className="lp-pricing__basis">
                      One invoice to the association for {Number(draft || residents).toLocaleString()} residents — full
                      platform, no add-ons.
                    </p>
                    <div className="lp-pricing__resident-count-chip">
                      <span className="lp-pricing__resident-count-icon" aria-hidden>
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="lp-pricing__resident-count-value">{Number(draft || residents).toLocaleString()}</span>
                      <span className="lp-pricing__resident-count-label">residents</span>
                    </div>
                    <div className="lp-pricing__resident-range-wrap" style={residentRangeStyle}>
                      <input
                        type="range"
                        className="lp-pricing__resident-range"
                        min={MIN_RESIDENTS}
                        max={RESIDENT_SLIDER_MAX}
                        step={RESIDENT_STEP}
                        value={Math.min(residents, RESIDENT_SLIDER_MAX)}
                        aria-label="Residents slider"
                        onChange={(event) => setCount(Number(event.target.value))}
                      />
                      <div className="lp-pricing__resident-range-ticks">
                        {RESIDENT_PRESETS.map((size) => (
                          <button
                            key={size}
                            type="button"
                            className={residents === size ? "is-on" : ""}
                            onClick={() => setCount(size)}
                          >
                            {size.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="lp-pricing__resident-pickrow">
                      <button
                        type="button"
                        className="lp-pricing__resident-round"
                        aria-label="Fewer residents"
                        onClick={() => setCount(residents - RESIDENT_STEP)}
                      >
                        −
                      </button>
                      <div className="lp-pricing__sizes lp-pricing__sizes--resident" role="group" aria-label="Resident presets">
                        {RESIDENT_PRESETS.map((size) => (
                          <button
                            key={size}
                            type="button"
                            aria-pressed={residents === size}
                            className={residents === size ? "is-on" : ""}
                            onClick={() => setCount(size)}
                          >
                            {residents === size ? <Check className="h-3 w-3" aria-hidden /> : null}
                            {size.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="lp-pricing__resident-round"
                        aria-label="More residents"
                        onClick={() => setCount(residents + RESIDENT_STEP)}
                      >
                        +
                      </button>
                    </div>
                  </section>

                  <div className="lp-pricing__resident-showcase" aria-hidden>
                    <div className="lp-pricing__resident-showcase-glow" />
                    <Image
                      src="/marketing/app-phones-hero.png"
                      alt=""
                      width={280}
                      height={210}
                      className="lp-pricing__resident-showcase-img"
                      priority={false}
                    />
                  </div>

                  <aside className="lp-pricing__resident-estimate">
                    <span className="lp-pricing__resident-estimate-accent" aria-hidden />
                    <p className="lp-pricing__resident-estimate-kicker">
                      <Zap className="h-3.5 w-3.5" aria-hidden />
                      Your live estimate
                    </p>
                    <p className="lp-pricing__resident-estimate-size">
                      {Number(draft || residents).toLocaleString()} <span>residents</span>
                    </p>
                    {!residentReady ? (
                      <p className="lp-pricing__price lp-pricing__price--wait">···</p>
                    ) : residentPrice.quote ? (
                      <>
                        <p className="lp-pricing__custom-title">Let’s scope it</p>
                        <p className="lp-pricing__bill-note">We’ll send a written price for this headcount.</p>
                      </>
                    ) : (
                      <>
                        <p className="lp-pricing__price">
                          {residentPrice.monthlyLabel ?? "—"}
                          <span>/mo community total</span>
                        </p>
                        {residentPrice.eachLabel ? (
                          <div className="lp-pricing__resident-formula" aria-label="How we calculate this total">
                            <span>{residents.toLocaleString()} residents</span>
                            <span className="lp-pricing__resident-formula-sep">×</span>
                            <span>{residentPrice.eachLabel} each</span>
                            <span className="lp-pricing__resident-formula-sep">≈</span>
                            <span>{residentPrice.monthlyLabel}</span>
                          </div>
                        ) : null}
                        <p
                          className={`lp-pricing__annual lp-pricing__annual--resident${
                            interval === "year" && residentPrice.annualLabel ? "" : " lp-pricing__annual--empty"
                          }`}
                        >
                          {interval === "year" && residentPrice.annualLabel ? (
                            <>
                              <Calendar className="h-3.5 w-3.5" aria-hidden />
                              Paid annually at {residentPrice.annualLabel}
                            </>
                          ) : null}
                        </p>
                      </>
                    )}
                    {residentReady && residentPrice.quote ? (
                      <button type="button" className="lp-pricing__resident-go" onClick={() => openQuote(CUSTOM_PACKAGE)}>
                        Request a quote
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </button>
                    ) : residentReady ? (
                      <Link href="/register" className="lp-pricing__resident-go">
                        Get started
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : (
                      <button type="button" className="lp-pricing__resident-go" disabled>
                        Loading…
                      </button>
                    )}
                  </aside>
                </div>
                <div className="lp-pricing__resident-features-shell">
                  <div className="lp-pricing__resident-features-visual" aria-hidden>
                    <Image
                      src="/marketing/dashboard-features.png"
                      alt=""
                      width={420}
                      height={300}
                      className="lp-pricing__resident-features-visual-img"
                    />
                  </div>
                  <PricingFeatureSheet id="pricing-platform-features" className="lp-pricing__resident-features-row" />
                </div>
              </div>
            </div>
          </div>
        )}

        {quoteOpen ? (
          <div className="lp-quote" role="presentation">
            <button type="button" className="lp-quote__backdrop" aria-label="Close quote request" onClick={() => setQuoteOpen(false)} />
            <div className="lp-quote__card" role="dialog" aria-modal="true" aria-labelledby="lp-quote-title">
              <button type="button" className="lp-quote__close" aria-label="Close" onClick={() => setQuoteOpen(false)}>
                <X className="h-4 w-4" />
              </button>
              <aside className="lp-quote__aside">
                <p className="lp-quote__eyebrow">Custom quote</p>
                <h2 id="lp-quote-title">{quotePackage.title} package</h2>
                <p>We write the price with you. Nothing is switched on until you accept it.</p>
                <ul>
                  <li><span>Package</span><strong>{quotePackage.title}</strong></li>
                  <li><span>Size</span><strong>{quotePackage.capacity}</strong></li>
                  <li><span>How you pay</span><strong>{billingModelLabel(model)}</strong></li>
                  <li><span>Billing</span><strong>{interval === "year" ? "Yearly" : "Monthly"}</strong></li>
                </ul>
              </aside>
              {quoteSent ? (
                <div className="lp-quote__form">
                  <p className="lp-quote__eyebrow">Request received</p>
                  <h3>We’ll reply with a written price.</h3>
                  <p className="lp-quote__hint">A note is on its way to {quoteForm.email.trim()}.</p>
                  <button type="button" className="lp-quote__submit" onClick={() => setQuoteOpen(false)}>Done</button>
                </div>
              ) : (
                <form className="lp-quote__form" onSubmit={submitQuote}>
                  <div className="lp-quote__form-head">
                    <p className="lp-quote__eyebrow">Where should we send it?</p>
                    <h3>A few details, then we write the price.</h3>
                  </div>
                  <div className="lp-quote__fields">
                    <label>
                      Organization
                      <input value={quoteForm.organization_name} autoComplete="organization" onChange={(event) => setQuoteForm({ ...quoteForm, organization_name: event.target.value })} placeholder="Harbour House HOA" />
                    </label>
                    <label>
                      Your name
                      <input value={quoteForm.contact_name} autoComplete="name" onChange={(event) => setQuoteForm({ ...quoteForm, contact_name: event.target.value })} placeholder="Jordan Hale" />
                    </label>
                    <label className="lp-quote__field--wide">
                      Work email
                      <input type="email" value={quoteForm.email} autoComplete="email" onChange={(event) => setQuoteForm({ ...quoteForm, email: event.target.value })} placeholder="jordan@harbourhouse.com" />
                    </label>
                    <label className="lp-quote__field--wide">
                      Anything we should know
                      <textarea value={quoteForm.notes} rows={4} onChange={(event) => setQuoteForm({ ...quoteForm, notes: event.target.value })} placeholder="Communities, integrations, or a date you have in mind." />
                    </label>
                  </div>
                  {quoteError ? <p className="lp-quote__error" role="alert">{quoteError}</p> : null}
                  <button type="submit" className="lp-quote__submit" disabled={quoteSending}>
                    {quoteSending ? "Sending…" : "Send the request"}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}