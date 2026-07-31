"use client";

import { useState } from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type PlatformChip = {
  label: string;
  icon: IconName;
};

type RoleFeature = {
  icon: IconName;
  title: string;
  body: string;
  accent: string;
  iconBg: string;
  iconColor: string;
};

type RoleId = "resident" | "admin";

type RolePillar = {
  id: RoleId;
  title: string;
  subtitle: string;
  icon: IconName;
  badge?: string;
  platforms: PlatformChip[];
  highlight: string;
  theme: {
    card: string;
    tab: string;
    tabActive: string;
    detail: string;
    chip: string;
  };
  items: RoleFeature[];
};

const ROLE_PILLARS: RolePillar[] = [
  {
    id: "resident",
    title: "Residents",
    subtitle: "Everything local in one mobile app.",
    icon: "home",
    platforms: [{ label: "Mobile app", icon: "phone" }],
    highlight: "Daily neighborhood life — not endless scrolling.",
    theme: {
      card: "features-role-card--resident",
      tab: "features-role-tab--resident",
      tabActive: "features-role-tab--resident-active",
      detail: "features-role-detail--resident",
      chip: "features-role-chip--resident",
    },
    items: [
      {
        icon: "bell-ring",
        iconBg: "bg-blue-50",
        iconColor: "text-brand-deep",
        accent: "from-brand-deep to-sky-400",
        title: "Home feed",
        body: "Notices, events, deals, and wellness — prioritized for your community.",
      },
      {
        icon: "user-check",
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-600",
        accent: "from-emerald-500 to-teal-400",
        title: "Secure join",
        body: "OTP sign-in, profile setup, bill upload, and community approval.",
      },
      {
        icon: "calendar-days",
        iconBg: "bg-violet-50",
        iconColor: "text-violet-600",
        accent: "from-violet-500 to-indigo-400",
        title: "Events",
        body: "Block parties, meetings, and activities with dates and locations.",
      },
      {
        icon: "trophy",
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600",
        accent: "from-amber-500 to-orange-400",
        title: "Wellness",
        body: "Courses, lessons, streaks, and rewards as you stay engaged.",
      },
    ],
  },
  {
    id: "admin",
    title: "Community admins",
    subtitle: "Lead from phone or dashboard.",
    icon: "users",
    badge: "Flexible",
    platforms: [
      { label: "Mobile", icon: "phone" },
      { label: "Web", icon: "globe" },
    ],
    highlight: "Quick actions on mobile, deep ops on web.",
    theme: {
      card: "features-role-card--admin",
      tab: "features-role-tab--admin",
      tabActive: "features-role-tab--admin-active",
      detail: "features-role-detail--admin",
      chip: "features-role-chip--admin",
    },
    items: [
      {
        icon: "megaphone",
        iconBg: "bg-blue-50",
        iconColor: "text-brand-deep",
        accent: "from-brand-deep to-indigo-500",
        title: "Notices",
        body: "Publish categorized notices with images and reach residents instantly.",
      },
      {
        icon: "users",
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-600",
        accent: "from-emerald-500 to-cyan-400",
        title: "Members",
        body: "Review pending residents and keep your directory verified.",
      },
      {
        icon: "store",
        iconBg: "bg-orange-50",
        iconColor: "text-orange-600",
        accent: "from-orange-500 to-amber-400",
        title: "Marketplace",
        body: "Create deals and manage business listings in your feed.",
      },
      {
        icon: "bar-chart",
        iconBg: "bg-indigo-50",
        iconColor: "text-indigo-600",
        accent: "from-indigo-500 to-violet-500",
        title: "Dashboard",
        body: "Track stats, pending tasks, and quick actions in one portal.",
      },
    ],
  },
];

function RoleCard({ role, compact }: { role: RolePillar; compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = role.items[activeIndex];

  return (
    <article className={`features-role-card ${role.theme.card} ${compact ? "features-role-card--compact" : ""}`}>
      <div className="features-role-card__head">
        <div className="flex min-w-0 items-center gap-3">
          <div className="features-role-card__icon-wrap">
            <Icon name={role.icon} className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[17px] font-bold tracking-tight text-ink-primary">{role.title}</h3>
              {role.badge ? <span className="features-role-card__badge">{role.badge}</span> : null}
            </div>
            <p className="truncate text-[12px] text-ink-body sm:whitespace-normal">{role.subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {role.platforms.map((platform) => (
            <span key={platform.label} className={`features-role-chip ${role.theme.chip}`}>
              <Icon name={platform.icon} className="h-3 w-3" />
              {platform.label}
            </span>
          ))}
        </div>
      </div>

      <div className="features-role-tabs" role="tablist" aria-label={`${role.title} features`}>
        {role.items.map((item, index) => {
          const selected = activeIndex === index;
          return (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${role.id}-feature-panel`}
              onClick={() => setActiveIndex(index)}
              className={[
                "features-role-tab",
                role.theme.tab,
                selected ? `features-role-tab--active ${role.theme.tabActive}` : "",
              ].join(" ")}
            >
              <span className={`features-role-tab__icon ${item.iconBg} ${item.iconColor}`}>
                <Icon name={item.icon} className="h-3.5 w-3.5" />
              </span>
              <span className="features-role-tab__label">{item.title}</span>
            </button>
          );
        })}
      </div>

      <div
        key={activeIndex}
        id={`${role.id}-feature-panel`}
        role="tabpanel"
        className={`features-role-detail ${role.theme.detail}`}
      >
        <div
          aria-hidden="true"
          className={`features-role-detail__bar bg-gradient-to-r ${active.accent}`}
        />
        <div className="features-role-detail__body">
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active.iconBg} ${active.iconColor}`}>
            <Icon name={active.icon} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-ink-primary">{active.title}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-body">{active.body}</p>
          </div>
        </div>
      </div>

      <p className="features-role-card__quote">{role.highlight}</p>
    </article>
  );
}

export function Features() {
  const [mobileRole, setMobileRole] = useState<RoleId>("resident");
  const activeMobile = ROLE_PILLARS.find((r) => r.id === mobileRole)!;

  return (
    <section id="features" className="relative scroll-mt-24 overflow-hidden py-14 sm:py-16 lg:py-20">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-20" />

      <Container size="xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="section-label justify-center">What you can do</span>
          <h2 className="section-title mt-4">
            Two roles, <span className="gradient-text">one connected</span> community
          </h2>
          <p className="mx-auto mt-3 text-[14px] leading-relaxed text-ink-body sm:text-[15px]">
            Tap a role and explore what each person can do on NeighborLink.
          </p>
        </div>

        <div className="features-showcase mx-auto mt-8 max-w-5xl lg:mt-10">
          <div className="features-role-switch lg:hidden" role="tablist" aria-label="Choose a role">
            {ROLE_PILLARS.map((role) => (
              <button
                key={role.id}
                type="button"
                role="tab"
                aria-selected={mobileRole === role.id}
                onClick={() => setMobileRole(role.id)}
                className={[
                  "features-role-switch__btn",
                  mobileRole === role.id ? "features-role-switch__btn--active" : "",
                ].join(" ")}
              >
                <Icon name={role.icon} className="h-4 w-4" />
                {role.title}
              </button>
            ))}
          </div>

          <div className="mt-4 lg:hidden">
            <RoleCard role={activeMobile} compact />
          </div>

          <div className="hidden gap-5 lg:grid lg:grid-cols-2">
            {ROLE_PILLARS.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default Features;
