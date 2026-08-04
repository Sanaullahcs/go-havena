import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Step = {
  num: string;
  icon: IconName;
  kicker: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    num: "01",
    icon: "phone",
    kicker: "Sign up",
    title: "Choose your role & community",
    body: "Log in with OTP, select resident or community admin, then pick your region and community in the app.",
  },
  {
    num: "02",
    icon: "user-check",
    kicker: "Verify",
    title: "Complete profile & get approved",
    body: "Add your details, upload a utility bill, and wait for your community admin to approve access.",
  },
  {
    num: "03",
    icon: "bell-ring",
    kicker: "Discover",
    title: "See your community feed",
    body: "Notices, events, wellness courses, and marketplace deals, scoped to your neighborhood.",
  },
  {
    num: "04",
    icon: "trophy",
    kicker: "Participate",
    title: "Engage, save & earn streaks",
    body: "RSVP to events, take wellness lessons, redeem local deals, and build streak rewards over time.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-24 lg:py-28">
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[#f8fafc]" />
      <div
        aria-hidden="true"
        className="grid-mask-light pointer-events-none absolute inset-0 -z-10 opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[#14B8A6]/6 blur-3xl"
      />

      <Container size="xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="section-label justify-center">How it works</span>
          <h2 className="section-title mt-4">
            From first login to{" "}
            <span className="gradient-text">everyday community life</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-body sm:text-[16px]">
            A clear path for residents, with community admins approving members and running operations from mobile
            and the dashboard along the way.
          </p>
        </div>

        <div className="relative mt-14 sm:mt-16">
          <div
            aria-hidden="true"
            className="how-step-line pointer-events-none absolute left-[12.5%] right-[12.5%] top-[42px] hidden lg:block"
          />

          <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {STEPS.map((step) => (
            <li key={step.num} className="group relative flex">
              <article className="how-step-card flex h-full w-full flex-col rounded-[24px] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-deep text-white shadow-fab transition-transform duration-300 group-hover:scale-105">
                      <Icon name={step.icon} className="h-6 w-6" />
                    </div>
                    <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-1.5 text-[11px] font-bold text-brand-deep shadow-md ring-1 ring-brand-deep/10">
                      {step.num}
                    </span>
                  </div>
                  <span className="rounded-full bg-brand-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-deep">
                    {step.kicker}
                  </span>
                </div>

                <h3 className="mt-6 text-[17px] font-bold tracking-tight text-ink-primary sm:text-[18px]">
                  {step.title}
                </h3>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-body sm:text-[14px]">
                  {step.body}
                </p>
              </article>
            </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <p className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.14em] text-brand-deep">
            Who runs what
          </p>
          <article className="group relative overflow-hidden rounded-[24px] border border-[#14B8A6]/15 bg-gradient-to-br from-white to-blue-50/80 p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#14B8A6]/10 blur-2xl"
            />
            <div className="relative flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-deep text-white shadow-fab">
                <Icon name="users" className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-bold text-ink-primary">Community admins</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="features-role-chip-mobile inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                    <Icon name="phone" className="h-3 w-3" />
                    Mobile
                  </span>
                  <span className="features-role-chip-community inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                    <Icon name="globe" className="h-3 w-3" />
                    Dashboard
                  </span>
                </div>
              </div>
            </div>
            <ul className="relative mt-5 space-y-2.5 text-[13px] leading-relaxed text-ink-body sm:text-[14px]">
              <li className="flex items-start gap-2">
                <Icon name="check-circle-2" className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
                Approve residents & manage members
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle-2" className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
                Publish notices, events & marketplace deals
              </li>
              <li className="flex items-start gap-2">
                <Icon name="check-circle-2" className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
                Run daily ops on phone or community portal
              </li>
            </ul>
          </article>
        </div>
      </Container>
    </section>
  );
}

export default HowItWorks;
