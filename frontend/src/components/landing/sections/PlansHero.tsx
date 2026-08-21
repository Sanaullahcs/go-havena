import { Container } from "../ui/Container";

const POINTS = [
  { title: "Full plan price first", body: "See exactly what the seat pack costs — no $0 hiding the number." },
  { title: "Trial included", body: "First 30 days on us after approval. The first charge is only after that trial." },
  { title: "Residents never pay", body: "You buy seats. Neighbors join by invite and use the app free." },
];

export function PlansHero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-[#1B4F8A] pt-24 pb-14 text-white sm:pt-28 sm:pb-16">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-teal-300/15 blur-3xl"
        aria-hidden
      />
      <Container size="xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-100/90">Subscriptions</p>
        <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-brand)] text-[2.15rem] font-bold leading-[1.08] tracking-tight sm:text-[2.75rem]">
          One plan for the whole community.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/75 sm:text-[17px]">
          Pick a seat pack that fits your neighborhood. You see the real price first. The trial is extra —
          not a substitute for the plan.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {POINTS.map((item) => (
            <li key={item.title} className="rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/15">
              <p className="text-[14px] font-semibold">{item.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/70">{item.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
