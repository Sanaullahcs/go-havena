"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { AuthPanel } from "./auth-panel";

const stats = [
  { value: "99.9%", label: "Platform Uptime" },
  { value: "500+", label: "Communities" },
  { value: "50K+", label: "Active Residents" },
  { value: "24/7", label: "Community Support" },
];

const features = [
  {
    title: "Community Notices",
    desc: "Broadcast announcements, events, and urgent updates to every resident instantly.",
    icon: IconNotices,
  },
  {
    title: "Neighborhood Feed",
    desc: "Connect with neighbors through posts, discussions, and local recommendations.",
    icon: IconFeed,
  },
  {
    title: "Wellness Programs",
    desc: "Track wellness goals, earn community points, and join group activities.",
    icon: IconWellness,
  },
  {
    title: "Local Marketplace",
    desc: "Buy, sell, and share services within your verified community.",
    icon: IconMarket,
  },
  {
    title: "Multi-role Access",
    desc: "Separate portals for residents, community admins, and system operators.",
    icon: IconRoles,
  },
  {
    title: "Secure & Verified",
    desc: "Enterprise-grade security with verified memberships and role-based access.",
    icon: IconShield,
  },
];

const portals = [
  {
    href: "/login",
    title: "Admin Portal",
    subtitle: "Community Operations",
    desc: "Manage communities, members, moderation, notices, marketplace, and analytics.",
    badge: "Operators",
    features: ["Manage Members", "Post Notices", "Moderation", "Analytics"],
    accent: "nl-portal-card-admin",
    cta: "Access Portal",
  },
  {
    href: "/home",
    title: "Resident Portal",
    subtitle: "Your Community Portal",
    desc: "Browse notices, community feed, wellness, property tools, and marketplace.",
    badge: "Residents",
    features: ["Community Feed", "Notices", "Wellness", "Marketplace"],
    accent: "nl-portal-card-resident",
    cta: "Access Portal",
  },
];

export function LandingPage() {
  return (
    <div className="nl-landing">
      <nav className="nl-landing-nav">
        <div className="nl-landing-nav-inner">
          <Link href="/" className="nl-landing-brand">
            <span className="nl-landing-brand-mark">
              <NbrLogoMark />
            </span>
            <div>
              <p className="nl-landing-brand-name">{APP_NAME}</p>
              <p className="nl-landing-brand-tag">Community & Wellness Platform</p>
            </div>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="nl-landing-nav-link">Features</a>
            <a href="#portals" className="nl-landing-nav-link">Portals</a>
            <a href="#auth" className="nl-landing-nav-link">Sign In</a>
          </div>
          <a href="#auth" className="nl-landing-nav-cta">
            Get Started
          </a>
        </div>
      </nav>

      <section className="nl-landing-hero">
        <div className="nl-landing-hero-pattern" aria-hidden />
        <div className="nl-landing-hero-glow" aria-hidden />
        <div className="nl-landing-container nl-landing-hero-grid">
          <div className="nl-landing-hero-copy">
            <p className="nl-landing-trust-badge">
              Trusted by communities worldwide
            </p>
            <h1 className="nl-landing-hero-title">
              Smart Community
              <span className="block text-sky-300">Management Platform</span>
            </h1>
            <p className="nl-landing-hero-subtitle">
              Streamline your neighborhood with real-time notices, resident engagement,
              wellness programs, and comprehensive community management for any property.
            </p>
            <div className="nl-landing-hero-actions">
              <a href="#auth" className="nl-landing-btn-primary">
                Get Started Free
              </a>
              <a href="#features" className="nl-landing-btn-secondary">
                Learn More
              </a>
            </div>
            <div className="nl-landing-trust-row">
              {["No credit card required", "Free community setup", "24/7 support"].map((item) => (
                <span key={item} className="nl-landing-trust-item">
                  <CheckIcon />
                  {item}
                </span>
              ))}
            </div>
          </div>
          <AuthPanel />
        </div>
      </section>

      <section className="nl-landing-stats">
        <div className="nl-landing-container">
          <div className="nl-landing-stats-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="nl-landing-stat">
                <p className="nl-landing-stat-value">{stat.value}</p>
                <p className="nl-landing-stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="nl-landing-section">
        <div className="nl-landing-container">
          <div className="nl-landing-section-head">
            <p className="nl-eyebrow">Platform Features</p>
            <h2 className="nl-landing-section-title">
              Everything You Need for Modern Communities
            </h2>
            <p className="nl-landing-section-desc">
              From notice boards to wellness tracking, Havena handles every aspect
              of your neighborhood community experience.
            </p>
          </div>
          <div className="nl-landing-features-grid">
            {features.map((feature) => (
              <div key={feature.title} className="nl-landing-feature-card">
                <span className="nl-landing-feature-icon">
                  <feature.icon />
                </span>
                <h3 className="nl-landing-feature-title">{feature.title}</h3>
                <p className="nl-landing-feature-desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="portals" className="nl-landing-section nl-landing-section-muted">
        <div className="nl-landing-container">
          <div className="nl-landing-section-head">
            <p className="nl-eyebrow">Access Portals</p>
            <h2 className="nl-landing-section-title">Choose Your Access Portal</h2>
            <p className="nl-landing-section-desc">
              Each portal is designed specifically for your role in the community.
            </p>
          </div>
          <div className="nl-landing-portals-grid">
            {portals.map((portal) => (
              <div key={portal.title} className={`nl-portal-card ${portal.accent}`}>
                <span className="nl-portal-badge">{portal.badge}</span>
                <h3 className="nl-portal-title">{portal.title}</h3>
                <p className="nl-portal-subtitle">{portal.subtitle}</p>
                <p className="nl-portal-desc">{portal.desc}</p>
                <ul className="nl-portal-features">
                  {portal.features.map((f) => (
                    <li key={f}>
                      <CheckIcon />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={portal.href} className="nl-portal-cta">
                  {portal.cta}
                  <ArrowIcon />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="nl-landing-cta">
        <div className="nl-landing-container nl-landing-cta-inner">
          <div>
            <h2 className="nl-landing-cta-title">
              Ready to Transform Your Community?
            </h2>
            <p className="nl-landing-cta-desc">
              Join leading communities who trust Havena for engagement and operations.
            </p>
          </div>
          <div className="nl-landing-cta-actions">
            <a href="#auth" className="nl-landing-btn-primary">
              Start Free Today
            </a>
            <a href="/login" className="nl-landing-btn-secondary nl-landing-btn-secondary-dark">
              Admin Sign In
            </a>
          </div>
        </div>
      </section>

      <footer className="nl-landing-footer">
        <div className="nl-landing-container nl-landing-footer-inner">
          <div className="flex items-center gap-2.5">
            <span className="nl-landing-brand-mark nl-landing-brand-mark-sm">
              <NbrLogoMark />
            </span>
            <p className="text-sm font-semibold text-slate-700">{APP_NAME}</p>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} {APP_NAME}. Community & Wellness Platform.
          </p>
        </div>
      </footer>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NbrLogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IconNotices() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFeed() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWellness() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMarket() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRoles() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
