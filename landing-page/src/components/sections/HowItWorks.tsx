import * as React from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Step = {
    num: string;
    icon: IconName;
    title: string;
    body: string;
    /** Outer halo + inner circle gradient (must be the same so the glow matches the orb). */
    iconBg: string;
    /** Subtle accent ring + hover glow. */
    accent: string;
    /** Keyword used for the small label above the title. */
    kicker: string;
};

const STEPS: Step[] = [
    {
        num: "01",
        icon: "user-plus",
        title: "Join Your Community",
        body: "Sign up and get verified to become a trusted member of your neighborhood.",
        iconBg: "from-indigo-400 to-violet-500",
        accent: "from-indigo-400/30 to-violet-500/0",
        kicker: "Step 01 · Onboard",
    },
    {
        num: "02",
        icon: "bell-ring",
        title: "Stay Informed",
        body: "Get real-time updates on events, announcements, and important community news.",
        iconBg: "from-cyan-400 to-blue-500",
        accent: "from-cyan-400/30 to-blue-500/0",
        kicker: "Step 02 · Discover",
    },
    {
        num: "03",
        icon: "users",
        title: "Connect & Engage",
        body: "Join discussions, attend events, access resources, and connect with your neighbors.",
        iconBg: "from-fuchsia-400 to-pink-500",
        accent: "from-fuchsia-400/30 to-pink-500/0",
        kicker: "Step 03 · Engage",
    },
    {
        num: "04",
        icon: "trophy",
        title: "Earn & Grow",
        body: "Earn points, unlock badges, and help build a stronger community together.",
        iconBg: "from-amber-400 to-orange-500",
        accent: "from-amber-400/30 to-orange-500/0",
        kicker: "Step 04 · Grow",
    },
];

/**
 * Smooth, curved SVG connector that flows through all 4 step circles.
 *
 * Geometry (in a 1000×80 viewBox, positioned so the y=40 row is the
 * centerline of every step circle):
 *  - The line passes through the *center* of each step circle (y=40).
 *  - Between any two steps, it dips down with a smooth cubic Bézier
 *    (peaking around y=80) and then arches back up to the next circle
 *    center — producing the "soft wave" effect shown in the reference.
 *  - It is rendered as a dashed stroke so the connector still feels
 *    light and unobtrusive.
 *
 * Positioning: each step orb is a 120×120 circle, so its center sits
 * 60 px below the top of the <li>. The SVG is placed at `top-[20px]`
 * (so y=40 lines up with the orb center at y=60) and is 80 px tall.
 * It is only visible on lg+ where all 4 steps sit in a single row.
 */
function StepsConnector() {
    return (
        <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[20px] hidden h-[80px] w-full lg:block"
            viewBox="0 0 1000 80"
            preserveAspectRatio="none"
            fill="none"
        >
            <defs>
                <linearGradient id="step-line-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
                    <stop offset="25%" stopColor="rgba(255,255,255,0.55)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.55)" />
                    <stop offset="75%" stopColor="rgba(255,255,255,0.55)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.20)" />
                </linearGradient>
                <filter
                    id="step-line-glow"
                    x="-2%"
                    y="-50%"
                    width="104%"
                    height="200%"
                >
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Curved connector: every step's x-position is anchored at y=40
          (the centerline of every step circle). Between two adjacent
          steps the line dips down to ~y=80 and back up using a smooth
          cubic Bézier. Because every step anchor sits at y=40, the
          line enters and leaves each circle *exactly* through its
          center. */}
            <path
                d="M 60 40
           C 150 80, 220 80, 313 40
           C 406 80, 476 80, 563 40
           C 650 80, 720 80, 813 40
           C 850 80, 900 80, 940 40"
                stroke="url(#step-line-grad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="1 8"
                filter="url(#step-line-glow)"
            />
            <path
                d="M 60 40
           C 150 80, 220 80, 313 40
           C 406 80, 476 80, 563 40
           C 650 80, 720 80, 813 40
           C 850 80, 900 80, 940 40"
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="6"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * Single step "card". Every step renders the same markup so the row
 * stays visually balanced — equal heights, equal paddings, and equal
 * type sizes — with the only differing bits being the gradient hues
 * and the copy.
 */
function StepCard({ step }: { step: Step }) {
    return (
        <li className="group relative flex h-full flex-col items-center text-center">
            {/* Step orb (icon + number badge) */}
            <div className="relative">
                {/* Outer halo */}
                <div
                    aria-hidden="true"
                    className={`absolute inset-0 -m-3 rounded-full bg-gradient-to-br ${step.accent} opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                />
                {/* Inner ring (sits behind the gradient orb) */}
                <div
                    aria-hidden="true"
                    className="absolute -inset-2 rounded-full border border-white/10"
                />
                {/* Gradient orb */}
                <div
                    className={`relative grid h-[120px] w-[120px] place-items-center rounded-full bg-gradient-to-br ${step.iconBg} shadow-[0_20px_60px_-15px_rgba(99,102,241,0.55)] ring-4 ring-white/10 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03]`}
                >
                    <Icon name={step.icon} className="h-10 w-10 text-white" />
                    <span className="absolute -right-1 -top-1 grid h-9 w-9 place-items-center rounded-full bg-white text-[12px] font-bold tracking-wide text-indigo-700 shadow-lg ring-2 ring-indigo-500/20">
                        {step.num}
                    </span>
                </div>
            </div>

            {/* Kicker */}
            <span className="mt-7 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/55 transition-colors duration-300 group-hover:text-white/80">
                <span
                    aria-hidden="true"
                    className="h-1 w-1 rounded-full bg-white/50 transition-colors duration-300 group-hover:bg-amber-300"
                />
                {step.kicker}
            </span>

            {/* Title */}
            <h3 className="mt-3 text-[18px] font-bold tracking-tight text-white sm:text-[19px]">
                {step.title}
            </h3>

            {/* Divider hairline */}
            <span
                aria-hidden="true"
                className="mt-3 h-px w-10 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />

            {/* Body */}
            <p className="mt-3 max-w-[230px] text-[13.5px] leading-relaxed text-white/70">
                {step.body}
            </p>
        </li>
    );
}

export function HowItWorks() {
    return (
        <section
            id="how-it-works"
            className="scroll-mt-24 relative overflow-hidden py-20 sm:py-24 lg:py-32"
        >
            {/* Dark gradient background */}
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-10"
                style={{
                    background:
                        "linear-gradient(135deg, #1e1b4b 0%, #0052df 50%, #4c1d95 100%)",
                }}
            />

            {/* Decorative grid */}
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 grid-mask opacity-30"
            />

            {/* Aurora glows */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-32 top-0 -z-10 h-[400px] w-[400px] rounded-full opacity-40 blur-3xl"
                style={{
                    background:
                        "radial-gradient(circle, #6366f1 0%, transparent 70%)",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 bottom-0 -z-10 h-[400px] w-[400px] rounded-full opacity-40 blur-3xl"
                style={{
                    background:
                        "radial-gradient(circle, #ec4899 0%, transparent 70%)",
                }}
            />

            {/* Stars */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                {Array.from({ length: 24 }).map((_, i) => {
                    const size = i % 3 === 0 ? 2 : i % 2 === 0 ? 1.5 : 1;
                    return (
                        <span
                            key={i}
                            className="absolute rounded-full bg-white animate-twinkle"
                            style={{
                                width: size,
                                height: size,
                                top: `${(i * 41) % 100}%`,
                                left: `${(i * 67) % 100}%`,
                                opacity: 0.4,
                                animationDelay: `${(i % 5) * 0.5}s`,
                            }}
                        />
                    );
                })}
            </div>

            <Container size="xl">
                {/* Header */}
                <div className="text-center">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/85">
                        <span>Simple. Smart. Connected.</span>
                        <span className="text-amber-300">✦</span>
                    </span>
                    <h2 className="display-title mx-auto mt-4 max-w-2xl text-[36px] text-white sm:text-4xl lg:text-[48px]">
                        How Havena Works
                    </h2>
                </div>

                {/* Steps — items-stretch so every <li> is the same height */}
                <ol
                    className="relative mt-20 grid grid-cols-1 items-stretch gap-y-14 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-14 lg:mt-24 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-0"
                >
                    {/* Curved connector — desktop only */}
                    <StepsConnector />

                    {STEPS.map((step) => (
                        <StepCard key={step.num} step={step} />
                    ))}
                </ol>
            </Container>
        </section>
    );
}

export default HowItWorks;
