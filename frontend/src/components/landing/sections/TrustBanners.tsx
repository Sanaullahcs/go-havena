"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Pillar = {
  id: string;
  icon: IconName;
  label: string;
  tagline: string;
  headline: string;
  body: string;
  bullets: string[];
  stat: { value: string; label: string };
  iconBg: string;
  iconColor: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentGlow: string;
};

const PILLARS: Pillar[] = [
  {
    id: "access",
    icon: "shield-check",
    label: "Verified access",
    tagline: "Communities stay private",
    headline: "Only approved neighbors get in",
    body: "Every member is tied to a real community. Admins review profiles before anyone can post, RSVP, or browse deals.",
    bullets: [
      "OTP-based login with no passwords to forget",
      "Utility bill verification for residents",
      "Admin approval queue on web dashboard",
    ],
    stat: { value: "100%", label: "gated communities" },
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
    accent: "from-cyan-500 to-teal-400",
    accentSoft: "bg-cyan-50/80",
    accentBorder: "border-cyan-200/60",
    accentGlow: "rgba(6, 182, 212, 0.18)",
  },
  {
    id: "platform",
    icon: "phone",
    label: "Mobile + web",
    tagline: "One platform, two views",
    headline: "Daily life on mobile. Deep ops on web.",
    body: "Residents and community admins share the same mobile app. When you need charts, bulk actions, or network oversight, the dashboard is ready.",
    bullets: [
      "Social feed, events & deals on mobile",
      "Activity charts & member health on web",
      "Real-time sync across both surfaces",
    ],
    stat: { value: "2", label: "surfaces, one account" },
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    accent: "from-indigo-500 to-violet-400",
    accentSoft: "bg-indigo-50/80",
    accentBorder: "border-indigo-200/60",
    accentGlow: "rgba(99, 102, 241, 0.18)",
  },
  {
    id: "privacy",
    icon: "lock",
    label: "Your data",
    tagline: "Scoped & role-based",
    headline: "Not a public social network",
    body: "Content, members, and analytics stay scoped to your region and community — private chats stay private.",
    bullets: [
      "Region → community hierarchy",
      "Role-based permissions at every layer",
      "No open sign-ups or public profiles",
    ],
    stat: { value: "3", label: "permission tiers" },
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    accent: "from-emerald-500 to-teal-400",
    accentSoft: "bg-emerald-50/80",
    accentBorder: "border-emerald-200/60",
    accentGlow: "rgba(16, 185, 129, 0.18)",
  },
  {
    id: "speed",
    icon: "zap",
    label: "Live in minutes",
    tagline: "Zero heavy setup",
    headline: "From OTP to community feed, fast",
    body: "Pick your role, complete your profile, and get approved. No lengthy forms, no IT tickets, no weeks of onboarding.",
    bullets: [
      "OTP login in under 30 seconds",
      "Guided profile setup in the app",
      "Admin tools ready on day one",
    ],
    stat: { value: "<5", label: "min to first login" },
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    accent: "from-amber-400 to-orange-400",
    accentSoft: "bg-amber-50/80",
    accentBorder: "border-amber-200/60",
    accentGlow: "rgba(245, 158, 11, 0.2)",
  },
];

export function TrustBanners() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);
  const active = PILLARS[activeIndex];
  const prev = PILLARS[(activeIndex - 1 + PILLARS.length) % PILLARS.length];
  const next = PILLARS[(activeIndex + 1) % PILLARS.length];

  const goTo = useCallback((index: number) => {
    setActiveIndex((index + PILLARS.length) % PILLARS.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % PILLARS.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goTo(index);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  return (
    <section
      id="about"
      className="relative scroll-mt-24 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsPaused(false);
      }}
    >
      <div className="relative py-16 sm:py-20 lg:py-24">
        <div aria-hidden="true" className="soft-section absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="grid-mask-light pointer-events-none absolute inset-0 -z-10 opacity-30"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[#0052df]/5 blur-3xl"
        />

        <Container size="xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="section-label justify-center">
              Platform at a glance
              {!isPaused && (
                <span
                  className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                  title="Auto-advancing"
                />
              )}
            </span>
            <h2 className="section-title mt-4">
              Explore what makes Havena{" "}
              <span className="gradient-text">different</span>
            </h2>
            <p className="mt-3 text-[15px] text-ink-body sm:text-[16px]">
              Tap a pillar below, or let it cycle, to see how the platform works.
            </p>
          </div>

          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Platform pillars"
            className="mx-auto mt-10 flex max-w-5xl gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-12 sm:justify-center sm:gap-3 [&::-webkit-scrollbar]:hidden"
          >
            {PILLARS.map((pillar, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={pillar.id}
                  type="button"
                  role="tab"
                  id={`trust-tab-${pillar.id}`}
                  aria-selected={isActive}
                  aria-controls={`trust-panel-${pillar.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => goTo(index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className={[
                    "group flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-300 sm:px-5 sm:py-3.5",
                    isActive
                      ? "border-brand-deep/25 bg-white shadow-elevated scale-[1.02]"
                      : "border-border-card bg-white/80 hover:border-brand-deep/15 hover:bg-white hover:shadow-card",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-300",
                      isActive ? pillar.iconBg : "bg-surface-muted",
                      isActive ? pillar.iconColor : "text-ink-muted group-hover:text-brand-deep",
                    ].join(" ")}
                  >
                    <Icon name={pillar.icon} className="h-[17px] w-[17px]" />
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-[13px] font-bold text-ink-primary">{pillar.label}</span>
                    <span className="block text-[11px] text-ink-muted">{pillar.tagline}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mx-auto mt-4 flex max-w-5xl justify-center gap-1.5">
            {PILLARS.map((pillar, index) => (
              <button
                key={pillar.id}
                type="button"
                aria-label={`Go to ${pillar.label}`}
                onClick={() => goTo(index)}
                className="group relative h-1.5 overflow-hidden rounded-full bg-brand-deep/10 transition-all duration-300 hover:bg-brand-deep/20"
                style={{ width: index === activeIndex ? "2.5rem" : "1.5rem" }}
              >
                {index === activeIndex && !isPaused && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-brand-deep"
                    style={{ animation: "trust-progress 6s linear forwards" }}
                  />
                )}
                {index === activeIndex && isPaused && (
                  <span className="absolute inset-0 rounded-full bg-brand-deep/60" />
                )}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`trust-panel-${active.id}`}
            aria-labelledby={`trust-tab-${active.id}`}
            className="mx-auto mt-8 w-full max-w-5xl sm:mt-10"
          >
            <div
              className="trust-panel-shell card-elevated relative overflow-hidden rounded-[28px] bg-white"
              style={{ "--trust-glow": active.accentGlow } as React.CSSProperties}
            >
              <div
                aria-hidden="true"
                className={`trust-panel-accent h-1 bg-gradient-to-r ${active.accent}`}
              />
              <div aria-hidden="true" className="trust-panel-glow" />
              <div
                aria-hidden="true"
                className={`trust-panel-watermark ${active.iconColor}`}
              >
                <Icon name={active.icon} className="h-full w-full" />
              </div>

              <div className="relative p-6 sm:p-8 lg:p-10">
                <div key={active.id} className="trust-panel-content animate-[trust-fade-in_0.45s_ease-out_forwards]">
                  <div className="grid gap-8 lg:grid-cols-[1fr_minmax(220px,280px)] lg:items-start lg:gap-10">
                    <div>
                      <div className="flex items-start gap-4">
                        <span
                          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-4 ring-white ${active.iconBg} ${active.iconColor} shadow-sm`}
                        >
                          <Icon name={active.icon} className="h-6 w-6" />
                        </span>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep">
                            {active.tagline}
                          </p>
                          <h3 className="mt-1 text-[18px] font-bold leading-snug text-ink-primary sm:text-[20px]">
                            {active.headline}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-5 text-[14px] leading-relaxed text-ink-body sm:text-[15px]">
                        {active.body}
                      </p>

                      <ul className="mt-6 space-y-2.5">
                        {active.bullets.map((bullet, i) => (
                          <li
                            key={bullet}
                            className={`trust-bullet-card flex items-start gap-3 rounded-2xl border px-3.5 py-3 ${active.accentSoft} ${active.accentBorder}`}
                            style={{ animationDelay: `${i * 60}ms` }}
                          >
                            <span
                              className={`trust-bullet-num grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white ${active.accent}`}
                            >
                              {i + 1}
                            </span>
                            <span className="pt-0.5 text-[13px] leading-snug text-ink-body sm:text-[14px]">
                              {bullet}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <aside className="trust-stat-aside flex flex-col items-center justify-center lg:pt-2">
                      <div className="trust-stat-orbit relative flex items-center justify-center">
                        <span aria-hidden="true" className="trust-stat-ring trust-stat-ring-outer" />
                        <span aria-hidden="true" className="trust-stat-ring trust-stat-ring-inner" />
                        <div
                          className={`trust-stat-core relative z-10 flex flex-col items-center justify-center rounded-[24px] border bg-white/90 px-6 py-7 text-center shadow-elevated backdrop-blur-sm ${active.accentBorder}`}
                        >
                          <span
                            className={`bg-gradient-to-br bg-clip-text text-[42px] font-bold leading-none tracking-tight text-transparent sm:text-[48px] ${active.accent}`}
                          >
                            {active.stat.value}
                          </span>
                          <span className="mt-2 max-w-[140px] text-[12px] font-semibold leading-snug text-ink-muted">
                            {active.stat.label}
                          </span>
                        </div>
                      </div>
                      <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                        {active.label}
                      </p>
                    </aside>
                  </div>
                </div>

                <div className="trust-pillar-nav mt-8 border-t border-border-subtle pt-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => goTo(activeIndex - 1)}
                      aria-label={`Previous: ${prev.label}`}
                      className="trust-nav-btn trust-nav-btn-prev group"
                    >
                      <span className="trust-nav-btn-icon">
                        <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          Previous
                        </span>
                        <span className="block truncate text-[13px] font-semibold text-ink-primary group-hover:text-brand-deep">
                          {prev.label}
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-1 flex-col items-center gap-3 px-2 sm:max-w-md">
                      <div className="trust-step-rail relative flex w-full items-center justify-between px-1">
                        <div
                          aria-hidden="true"
                          className="trust-step-track absolute left-4 right-4 top-[18px] hidden h-0.5 rounded-full bg-brand-deep/8 sm:block"
                        />
                        <div
                          aria-hidden="true"
                          className="trust-step-fill absolute left-4 top-[18px] hidden h-0.5 rounded-full bg-gradient-to-r from-brand-deep to-[#0179ff] sm:block"
                          style={{
                            width: `calc(${(activeIndex / (PILLARS.length - 1)) * 100}% - 2rem)`,
                            maxWidth: "calc(100% - 2rem)",
                          }}
                        />
                        {PILLARS.map((pillar, index) => (
                          <button
                            key={pillar.id}
                            type="button"
                            aria-label={`Go to ${pillar.label}`}
                            aria-current={index === activeIndex ? "step" : undefined}
                            onClick={() => goTo(index)}
                            className={[
                              "trust-step-dot group/step relative z-10 flex flex-col items-center gap-1.5",
                              index === activeIndex ? "trust-step-dot-active" : "",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300",
                                index === activeIndex
                                  ? `${pillar.iconBg} ${pillar.iconColor} border-transparent shadow-md scale-110 ring-2 ring-white`
                                  : index < activeIndex
                                    ? "border-brand-deep/15 bg-brand-soft text-brand-deep"
                                    : "border-border-subtle bg-white text-ink-muted hover:border-brand-deep/20 hover:text-brand-deep",
                              ].join(" ")}
                            >
                              <Icon name={pillar.icon} className="h-4 w-4" />
                            </span>
                            <span
                              className={[
                                "hidden max-w-[4.5rem] truncate text-[10px] font-semibold sm:block",
                                index === activeIndex ? "text-brand-deep" : "text-ink-muted",
                              ].join(" ")}
                            >
                              {pillar.label.split(" ")[0]}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] font-medium text-ink-muted">
                        <span className="font-bold text-brand-deep">
                          {String(activeIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="mx-1.5 text-ink-muted/50">/</span>
                        <span>{String(PILLARS.length).padStart(2, "0")}</span>
                        <span className="mx-2 hidden text-ink-muted/40 sm:inline">·</span>
                        <span className="hidden font-semibold text-ink-body sm:inline">{active.label}</span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => goTo(activeIndex + 1)}
                      aria-label={`Next: ${next.label}`}
                      className="trust-nav-btn trust-nav-btn-next group"
                    >
                      <span className="min-w-0 text-right">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          Next
                        </span>
                        <span className="block truncate text-[13px] font-semibold text-ink-primary group-hover:text-brand-deep">
                          {next.label}
                        </span>
                      </span>
                      <span className="trust-nav-btn-icon">
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}

export default TrustBanners;
