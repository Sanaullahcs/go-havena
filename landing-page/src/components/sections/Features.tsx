"use client";

import * as React from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Feature = {
    icon: IconName;
    iconBg: string;
    iconColor: string;
    title: string;
    body: string;
    link: string;
    /** A faint gradient shown behind the card to differentiate it. */
    accent: string;
};

const FEATURES: Feature[] = [
    {
        icon: "shield",
        iconBg: "bg-blue-50",
        iconColor: "text-blue-600",
        title: "Secure & Verified",
        body: "Only real neighbors. Secure verification keeps your community safe and trusted.",
        link: "#",
        accent: "from-blue-500/15 via-blue-400/5 to-transparent",
    },
    {
        icon: "megaphone",
        iconBg: "bg-violet-50",
        iconColor: "text-violet-600",
        title: "Digital Notice Board",
        body: "Stay updated with announcements, events, alerts, and important community updates.",
        link: "#",
        accent: "from-violet-500/15 via-fuchsia-400/5 to-transparent",
    },
    {
        icon: "book-open",
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-600",
        title: "Wellness Resources",
        body: "Wellness courses & resources organized by W-E-L-L-S. HSA reimbursable content.",
        link: "#",
        accent: "from-emerald-500/15 via-teal-400/5 to-transparent",
    },
    {
        icon: "home",
        iconBg: "bg-orange-50",
        iconColor: "text-orange-600",
        title: "Property Management",
        body: "Rules, documents, reservations, and payments—everything in one convenient place.",
        link: "#",
        accent: "from-orange-500/15 via-amber-400/5 to-transparent",
    },
    {
        icon: "message-circle",
        iconBg: "bg-rose-50",
        iconColor: "text-rose-600",
        title: "Community Feed",
        body: "Share, discuss, and connect in a positive and moderated neighborhood feed.",
        link: "#",
        accent: "from-rose-500/15 via-pink-400/5 to-transparent",
    },
    {
        icon: "lock",
        iconBg: "bg-cyan-50",
        iconColor: "text-cyan-600",
        title: "Neighborhood Marketplace",
        body: "Exclusive deals, local businesses, coupons, and trusted service providers.",
        link: "#",
        accent: "from-cyan-500/15 via-sky-400/5 to-transparent",
    },
    {
        icon: "trophy",
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600",
        title: "Gamification",
        body: "Earn points, unlock badges, climb the leaderboard, and be an active community member!",
        link: "#",
        accent: "from-amber-500/15 via-yellow-400/5 to-transparent",
    },
    {
        icon: "bar-chart",
        iconBg: "bg-indigo-50",
        iconColor: "text-indigo-600",
        title: "Admin Dashboard",
        body: "Powerful tools for admins to manage, moderate, and grow a thriving community.",
        link: "#",
        accent: "from-indigo-500/15 via-violet-400/5 to-transparent",
    },
];

/**
 * Auto-scrolling horizontal carousel of feature cards.
 *
 * - Infinite / seamless loop: the track is rendered twice and animated
 *   by -50%, so the second copy lines up exactly where the first began.
 * - Pauses on hover.
 * - Drag / swipe to nudge the position; auto-scroll resumes shortly after
 *   the user lets go.
 * - Fully responsive (different card width per breakpoint).
 */
export function Features() {
    const trackRef = React.useRef<HTMLDivElement | null>(null);
    const [paused, setPaused] = React.useState(false);
    const [dragX, setDragX] = React.useState(0);
    const dragState = React.useRef<{
        active: boolean;
        startX: number;
        pointerId: number;
    } | null>(null);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!trackRef.current) return;
        trackRef.current.setPointerCapture(e.pointerId);
        dragState.current = {
            active: true,
            startX: e.clientX,
            pointerId: e.pointerId,
        };
        setPaused(true);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragState.current;
        if (!d || !d.active) return;
        const dx = e.clientX - d.startX;
        setDragX(dx);
    };

    const endDrag = (e?: React.PointerEvent<HTMLDivElement>) => {
        const d = dragState.current;
        if (!d) return;
        d.active = false;
        if (e && trackRef.current?.hasPointerCapture(d.pointerId)) {
            trackRef.current.releasePointerCapture(d.pointerId);
        }
        setDragX(0);
        // Resume auto-scroll after a brief pause
        window.setTimeout(() => setPaused(false), 1200);
    };

    return (
        <section
            id="features"
            className="relative scroll-mt-24 overflow-hidden py-20 sm:py-24 lg:py-32"
        >
            {/* Soft brand wash */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] opacity-50"
                style={{
                    background:
                        "radial-gradient(60% 60% at 50% 0%, rgba(244, 114, 182, 0.10), transparent 70%)",
                }}
            />

            <Container size="xl">
                {/* Header */}
                <div className="text-center">
                    <span className="section-label">
                        <span className="font-semibold tracking-normal text-fuchsia-500">
                            Everything You Need
                        </span>
                        <span className="text-pink-400">✦</span>
                    </span>
                    <h2 className="display-title mx-auto mt-5 max-w-4xl text-[28px] sm:whitespace-nowrap sm:text-3xl lg:text-[44px]">
                        One Platform.{" "}
                        <span className="gradient-text">Seven Powerful Features.</span>
                    </h2>
                </div>

                {/* Carousel viewport (overflow hidden, no native scroll). */}
                <div
                    className="relative mt-12"
                    onMouseEnter={() => setPaused(true)}
                    onMouseLeave={() => setPaused(false)}
                >
                    {/* Edge fades */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent sm:w-20"
                    />
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent sm:w-20"
                    />

                    {/* Track: width: max-content so all duplicated items fit on one row.
              The animation translates the whole track by -50% for a seamless
              loop. Drag adds an extra translateX on top of the animation. */}
                    <div
                        ref={trackRef}
                        className="features-track flex w-max touch-none select-none gap-5 pb-2 sm:gap-6"
                        style={{
                            animation: paused
                                ? "none"
                                : "features-scroll 38s linear infinite",
                            transform: dragX ? `translateX(${dragX}px)` : undefined,
                        }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                    >
                        {/* Render twice for seamless loop */}
                        {[...FEATURES, ...FEATURES].map((f, i) => (
                            <article
                                key={`${f.title}-${i}`}
                                className="group relative w-[78vw] max-w-[320px] shrink-0 overflow-hidden rounded-3xl border border-border-card bg-white p-6 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:shadow-elevated sm:w-[300px] sm:p-7"
                            >
                                {/* Decorative accent wash */}
                                <div
                                    aria-hidden="true"
                                    className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${f.accent} blur-2xl`}
                                />

                                <div className="relative flex items-start justify-between">
                                    <span
                                        className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${f.iconBg} ${f.iconColor} transition-transform duration-300 group-hover:scale-110`}
                                    >
                                        <Icon name={f.icon} className="h-5 w-5" />
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                                        {String((i % FEATURES.length) + 1).padStart(2, "0")} /{" "}
                                        {String(FEATURES.length).padStart(2, "0")}
                                    </span>
                                </div>

                                <h3 className="mt-6 text-[18px] font-bold tracking-tight text-ink-primary">
                                    {f.title}
                                </h3>
                                <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-body">
                                    {f.body}
                                </p>

                                <div className="mt-5 flex items-center justify-between">
                                    <a
                                        href={f.link}
                                        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-indigo-500 transition-colors hover:text-indigo-700"
                                    >
                                        Learn more
                                        <Icon
                                            name="arrow-right"
                                            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                                        />
                                    </a>
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand-deep transition-all group-hover:bg-brand group-hover:text-white">
                                        <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </Container>
        </section>
    );
}

export default Features;
