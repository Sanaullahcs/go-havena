import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Highlight = {
  title: string;
  body: string;
  tag: string;
  icon: IconName;
  accentBar: string;
  iconBg: string;
  iconColor: string;
  glow: string;
  ring: string;
};

const HIGHLIGHTS: Highlight[] = [
  {
    tag: "Trust & safety",
    title: "Verified residents only",
    body: "Address-verified profiles, admin approval, and role-based access keep every community private and secure.",
    icon: "shield-check",
    accentBar: "from-emerald-500 via-teal-400 to-cyan-400",
    iconBg: "bg-gradient-to-br from-emerald-50 to-teal-50",
    iconColor: "text-emerald-600",
    glow: "from-emerald-500/15 via-teal-400/10 to-transparent",
    ring: "ring-emerald-500/10",
  },
  {
    tag: "Community ops",
    title: "Notices, events & updates",
    body: "Publish notices, schedule events, and reach the right residents from your community dashboard.",
    icon: "megaphone",
    accentBar: "from-[#0052df] via-[#0179ff] to-sky-400",
    iconBg: "bg-gradient-to-br from-blue-50 to-sky-50",
    iconColor: "text-brand-deep",
    glow: "from-[#0052df]/15 via-[#0179ff]/10 to-transparent",
    ring: "ring-[#0052df]/10",
  },
  {
    tag: "Resident wellbeing",
    title: "Wellness programs built in",
    body: "Searchable courses, video lessons, and streak rewards help neighbors stay active and engaged every week.",
    icon: "book-open",
    accentBar: "from-violet-500 via-indigo-500 to-blue-400",
    iconBg: "bg-gradient-to-br from-violet-50 to-indigo-50",
    iconColor: "text-violet-600",
    glow: "from-violet-500/15 via-indigo-400/10 to-transparent",
    ring: "ring-violet-500/10",
  },
  {
    tag: "Local economy",
    title: "Marketplace & local deals",
    body: "Businesses post deals, residents discover offers nearby, and admins curate what appears in the feed.",
    icon: "store",
    accentBar: "from-amber-500 via-orange-400 to-rose-400",
    iconBg: "bg-gradient-to-br from-amber-50 to-orange-50",
    iconColor: "text-amber-600",
    glow: "from-amber-500/15 via-orange-400/10 to-transparent",
    ring: "ring-amber-500/10",
  },
];

export function BenefitsRow() {
  return (
    <section className="relative pb-16 pt-12 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-deep/15 to-transparent"
      />

      <Container size="xl">
        <div className="mx-auto mb-10 max-w-4xl text-center sm:mb-12">
          <p className="section-label justify-center">Why NeighborLink</p>
          <h2 className="section-title mt-3 lg:whitespace-nowrap">
            Built for real communities, not generic social feeds
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-body sm:text-[16px]">
            From verified onboarding to wellness courses and local deals, everything your HOA, property manager, or
            neighborhood admin needs in one platform.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-5">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title}>
              <div
                className={`group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border-card bg-white shadow-card ring-1 ${h.ring} transition-all duration-300 hover:-translate-y-1.5 hover:shadow-elevated`}
              >
                <div
                  aria-hidden="true"
                  className={`h-1 bg-gradient-to-r ${h.accentBar}`}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${h.glow} opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100`}
                />

                <div className="relative flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${h.iconBg} ${h.iconColor} shadow-sm ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-105`}
                    >
                      <Icon name={h.icon} className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                      {h.tag}
                    </span>
                  </div>

                  <div className="mt-5 flex-1">
                    <h3 className="text-[16px] font-bold tracking-tight text-ink-primary sm:text-[17px]">
                      {h.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-body sm:text-[14px]">
                      {h.body}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default BenefitsRow;
