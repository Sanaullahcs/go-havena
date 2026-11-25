"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/api/client";

type Feature = { key: string; label: string; included: boolean; group: string };
type Plan = {
  slug: string;
  name: string;
  description: string | null;
  recommended: boolean;
  custom: boolean;
  features: Feature[];
};
type Quote = {
  available?: boolean;
  quote_required?: boolean;
  amount_due_cents?: number | null;
  monthly_cents?: number | null;
  discount_cents?: number | null;
  currency?: string;
  reason?: string;
  minimum_applied?: boolean;
};

const PRESETS = [500, 2500, 10000, 25000];

function money(cents: number | null | undefined, currency: string) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function PricingExplorer() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [model, setModel] = useState<"per_community" | "per_resident">("per_community");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [residents, setResidents] = useState(2500);
  const [discountBps, setDiscountBps] = useState(0);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [inquiry, setInquiry] = useState({ organization_name: "", contact_name: "", email: "", residents: "2500" });
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/v1/billing/saas/catalog", { params: { currency: "USD" } }).then((res) => {
      setPlans(res.data.plans ?? []);
      setDiscountBps(res.data.annual_discount_bps ?? 0);
    }).catch(() => setError("Pricing is unavailable right now."));
  }, []);

  useEffect(() => {
    if (!plans.length) return;
    let cancel = false;
    Promise.all(plans.map(async (plan) => {
      const res = await api.post("/v1/billing/saas/preview", {
        plan: plan.slug,
        billing_model: model,
        interval,
        residents,
        currency: "USD",
      });
      return [plan.slug, res.data as Quote] as const;
    })).then((rows) => {
      if (!cancel) setQuotes(Object.fromEntries(rows));
    }).catch(() => {
      if (!cancel) setError("Enter a resident count of at least 1.");
    });
    return () => { cancel = true; };
  }, [plans, model, interval, residents]);

  const comparison = useMemo(() => {
    const labels = new Map<string, string>();
    plans.forEach((plan) => plan.features.forEach((feature) => labels.set(feature.key, feature.label)));
    return [...labels.entries()];
  }, [plans]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSent("");
    const res = await api.post("/v1/billing/saas/inquiries", {
      organization_name: inquiry.organization_name,
      contact_name: inquiry.contact_name,
      email: inquiry.email,
      residents: Number(inquiry.residents) || residents,
      communities: 1,
      billing_model: model,
      interval,
    });
    setSent(res.data.message);
  };

  return (
    <div className="space-y-16">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-[#15283F] md:text-5xl">One platform. Every community.</h1>
        <p className="mt-4 text-lg text-[#64748B]">Flexible subscription plans designed for communities of every size. Choose the features you need and the way you want to pay.</p>
      </section>

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["per_community", "per_resident"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setModel(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${model === value ? "bg-[#15283F] text-white" : "bg-[#F7F9FC] text-[#15283F]"}`}>
                {value === "per_community" ? "Per community" : "Per resident"}
              </button>
            ))}
            {(["month", "year"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setInterval(value)} className={`rounded-full px-4 py-2 text-sm font-semibold ${interval === value ? "bg-[#4084DC] text-white" : "bg-[#F7F9FC] text-[#15283F]"}`}>
                {value === "month" ? "Monthly" : `Annually${discountBps ? ` · save ${discountBps / 100}%` : ""}`}
              </button>
            ))}
          </div>
          <label className="text-sm font-semibold text-[#15283F]">
            Residents
            <input type="number" min={1} value={residents} onChange={(event) => setResidents(Number(event.target.value))} className="mt-1 block w-40 rounded-xl border border-[#E2E8F0] px-3 py-2" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setResidents(preset)} className="rounded-full border border-[#E2E8F0] px-3 py-1 text-xs font-semibold text-[#64748B]">{preset.toLocaleString()}</button>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-[#64748B]">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const quote = quotes[plan.slug];
          const price = money(quote?.amount_due_cents, quote?.currency || "USD");
          return (
            <article key={plan.slug} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${plan.recommended ? "border-[#4084DC]" : "border-[#E2E8F0]"}`}>
              <h2 className="text-lg font-semibold text-[#15283F]">{plan.name}</h2>
              {plan.recommended ? <p className="text-xs font-semibold text-[#4084DC]">Recommended</p> : null}
              <p className="mt-2 min-h-16 text-sm text-[#64748B]">{plan.description}</p>
              <p className="mt-4 text-3xl font-semibold text-[#15283F]">{plan.custom || !price ? "Custom pricing" : price}</p>
              <p className="text-xs text-[#64748B]">{interval === "year" ? "billed annually" : "billed monthly"}{quote?.minimum_applied ? " · monthly minimum applied" : ""}</p>
              <Link href={plan.custom ? "#custom-quote" : "/request-demo"} className="mt-4 inline-flex justify-center rounded-xl bg-[#15283F] px-4 py-2 text-sm font-semibold text-white">
                {plan.custom || quote?.quote_required ? "Request a quote" : "Talk to Havena"}
              </Link>
              <ul className="mt-4 space-y-1 text-sm text-[#15283F]">
                {plan.features.filter((feature) => feature.included).slice(0, 6).map((feature) => <li key={feature.key}>{feature.label}</li>)}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0]">
              <th className="p-3 font-semibold text-[#15283F]">Feature</th>
              {plans.map((plan) => <th key={plan.slug} className="p-3 font-semibold text-[#15283F]">{plan.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {comparison.map(([key, label]) => (
              <tr key={key} className="border-b border-[#E2E8F0]">
                <th className="p-3 font-medium text-[#64748B]">{label}</th>
                {plans.map((plan) => {
                  const included = plan.features.find((feature) => feature.key === key)?.included;
                  return <td key={plan.slug} className="p-3">{plan.custom ? "Chosen in the quote" : included ? "Included" : "Not included"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl bg-[#15283F] p-8 text-white">
        <h2 className="text-2xl font-semibold">Managing 10,000+ residents? We&apos;ve got you covered.</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/80">Havena supports large communities with scalable administration and flexible pricing. A larger population does not force you onto Premium or Custom.</p>
        <Link href="/request-demo" className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#15283F]">Request a demo</Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          ["Who pays Havena?", "The community administrator or management organization pays. Residents are not charged a Havena subscription."],
          ["What is the difference between the two billing models?", "Per resident uses graduated rates on approved resident memberships. Per community is a fixed amount agreed for a population range."],
          ["What happens when the resident count grows?", "A per-resident bill follows the published brackets. A per-community contract keeps its agreed price until renewal, and we flag a review if the community grows past that range."],
          ["Can we choose a custom plan?", "Yes. Custom can include fewer modules than Premium, more, or a different mix. It starts as a written quote."],
        ].map(([q, a]) => (
          <article key={q} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
            <h3 className="font-semibold text-[#15283F]">{q}</h3>
            <p className="mt-2 text-sm text-[#64748B]">{a}</p>
          </article>
        ))}
      </section>

      <form id="custom-quote" onSubmit={submit} className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
        <h2 className="text-2xl font-semibold text-[#15283F]">Request a custom quote</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input required placeholder="Organization" value={inquiry.organization_name} onChange={(event) => setInquiry({ ...inquiry, organization_name: event.target.value })} className="rounded-xl border border-[#E2E8F0] px-3 py-2" />
          <input required placeholder="Contact name" value={inquiry.contact_name} onChange={(event) => setInquiry({ ...inquiry, contact_name: event.target.value })} className="rounded-xl border border-[#E2E8F0] px-3 py-2" />
          <input required type="email" placeholder="Work email" value={inquiry.email} onChange={(event) => setInquiry({ ...inquiry, email: event.target.value })} className="rounded-xl border border-[#E2E8F0] px-3 py-2" />
          <input placeholder="Estimated residents" value={inquiry.residents} onChange={(event) => setInquiry({ ...inquiry, residents: event.target.value })} className="rounded-xl border border-[#E2E8F0] px-3 py-2" />
        </div>
        <button type="submit" className="mt-4 rounded-xl bg-[#4084DC] px-4 py-2 text-sm font-semibold text-white">Submit request</button>
        {sent ? <p className="mt-3 text-sm text-[#15283F]">{sent}</p> : null}
      </form>
    </div>
  );
}
