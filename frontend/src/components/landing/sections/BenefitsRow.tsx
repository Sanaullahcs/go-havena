import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Highlight = {
  title: string;
  body: string;
  tag: string;
  icon: IconName;
};

const HIGHLIGHTS: Highlight[] = [
  {
    tag: "Trust & safety",
    title: "Verified residents only",
    body: "Address-verified profiles, admin approval, and role-based access keep every community private and secure.",
    icon: "shield-check",
  },
  {
    tag: "Community ops",
    title: "Notices, events & updates",
    body: "Publish notices, schedule events, and reach the right residents from your community dashboard.",
    icon: "megaphone",
  },
  {
    tag: "Resident wellbeing",
    title: "Wellness programs built in",
    body: "Searchable courses, video lessons, and streak rewards help neighbors stay active and engaged every week.",
    icon: "book-open",
  },
  {
    tag: "Local economy",
    title: "Marketplace & local deals",
    body: "Businesses post deals, residents discover offers nearby, and admins curate what appears in the feed.",
    icon: "store",
  },
];

export function BenefitsRow() {
  return (
    <section className="section-surface relative py-16 sm:py-20 lg:py-24">
      <Container size="xl">
        <div className="mx-auto mb-12 max-w-3xl text-center lg:mb-14">
          <p className="section-label justify-center">Why Havena</p>
          <h2 className="section-title mt-3">
            Built for real communities, not generic social feeds
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-body sm:text-[16px]">
            From verified onboarding to wellness courses and local deals, everything your HOA, property manager, or
            neighborhood admin needs in one platform.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title}>
              <article className="benefit-card benefit-card--default group flex h-full flex-col rounded-[20px] border p-6 transition-all duration-300 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="benefit-card-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105">
                    <Icon name={h.icon} className="h-5 w-5" />
                  </div>
                  <span className="benefit-card-tag rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]">
                    {h.tag}
                  </span>
                </div>

                <div className="mt-5 flex-1">
                  <h3 className="text-[16px] font-bold tracking-tight text-ink-primary sm:text-[17px]">{h.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-body sm:text-[14px]">{h.body}</p>
                </div>

                <div
                  aria-hidden="true"
                  className="benefit-card-accent mt-5 h-0.5 w-10 rounded-full transition-all duration-300 group-hover:w-16"
                />
              </article>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default BenefitsRow;
