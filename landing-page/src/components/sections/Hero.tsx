import * as React from "react";
import { Icon } from "../icons/Icon";
import { Button } from "../ui/Button";
import { actionLinks } from "@/lib/site";

/**
 * Hero — matches the reference design:
 *  - Deep indigo/purple gradient background with house/people illustration
 *  - Eyebrow pill "Your Neighborhood. Connected."
 *  - Two-line headline (last line is gradient)
 *  - Body copy + two CTAs
 *  - Avatar cluster + 5-star rating
 *  - Floating right-side card with event list
 */
export function Hero() {
    return (
        <section
            id="top"
            className="relative isolate overflow-hidden pb-16 pt-24 sm:pb-20 sm:pt-28 lg:pb-24 lg:pt-32"
        >
            {/* Background gradient — deep navy → purple */}
            <div
                aria-hidden="true"
                className="absolute inset-0 -z-20"
                style={{
                    background:
                        "linear-gradient(180deg, #1e1b4b 0%, #0052df 35%, #1e1b4b 75%, #0f172a 100%)",
                }}
            />

            {/* Decorative aurora blobs */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-32 left-1/3 -z-10 h-[500px] w-[500px] rounded-full opacity-50 blur-3xl animate-aurora"
                style={{
                    background:
                        "radial-gradient(circle, #6366f1 0%, transparent 70%)",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-1/2 -z-10 h-[420px] w-[420px] -translate-y-1/2 rounded-full opacity-40 blur-3xl"
                style={{
                    background:
                        "radial-gradient(circle, #ec4899 0%, transparent 70%)",
                }}
            />

            {/* Twinkling stars */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                {Array.from({ length: 28 }).map((_, i) => {
                    const sizes = [1, 1.5, 2];
                    const size = sizes[i % sizes.length];
                    const top = (i * 37) % 100;
                    const left = (i * 53) % 100;
                    const delay = (i % 6) * 0.4;
                    return (
                        <span
                            key={i}
                            className="absolute rounded-full bg-white animate-twinkle"
                            style={{
                                width: size,
                                height: size,
                                top: `${top}%`,
                                left: `${left}%`,
                                opacity: 0.5,
                                animationDelay: `${delay}s`,
                            }}
                        />
                    );
                })}
            </div>

            {/* Subtle house / neighborhood illustration in the background */}
            <HouseBackdrop />

            <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
                <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-10">
                    {/* Left: Copy */}
                    <div className="lg:col-span-7 xl:col-span-7">
                        {/* Eyebrow pill */}
                        <div className="animate-fade-up">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[13px] font-medium text-white/90 backdrop-blur-md">
                                <span className="grid h-4 w-4 place-items-center rounded-full bg-pink-500">
                                    <Icon name="heart" className="h-2.5 w-2.5 text-white" />
                                </span>
                                {`Your Neighborhood. Connected.`}
                                <span className="ml-1 text-white/60">♥</span>
                            </span>
                        </div>

                        {/* Headline — locked to exactly 2 lines (one <span> per line).
                            Font sizes are tuned per breakpoint so that the longest
                            line ("Better Communities.") always fits on a single
                            visual line inside the 7/12 left column. */}
                        <h1 className="display-title animate-fade-up delay-100 mt-6 w-full max-w-[640px] text-white">
                            <span className="block whitespace-nowrap text-[40px] leading-[1.05] sm:text-[44px] lg:text-[52px] xl:text-[60px]">
                                Stronger Neighbors,
                            </span>
                            <span className="block whitespace-nowrap text-[40px] leading-[1.05] sm:text-[44px] lg:text-[52px] xl:text-[60px]">
                                <span className="gradient-text">Better Communities.</span>
                            </span>
                        </h1>

                        {/* Body */}
                        <p className="animate-fade-up delay-200 mt-6 max-w-xl text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
                            Havena brings everything your community needs into one
                            smart platform—events, updates, resources, marketplace, and more.
                        </p>

                        {/* CTAs */}
                        <div className="animate-fade-up delay-300 mt-8 flex flex-wrap items-center gap-3">
                            <Button
                                href={actionLinks.signUp}
                                variant="white"
                                size="lg"
                                className="!bg-indigo-500 !text-white hover:!bg-indigo-600"
                                iconTrailing="arrow-right"
                            >
                                Get Started for Free
                            </Button>
                            <Button
                                href="#features"
                                variant="outline"
                                size="lg"
                                className="!border-white/30 !bg-white/5 !text-white hover:!bg-white/10"
                                icon="play-circle"
                            >
                                Explore Features
                            </Button>
                        </div>

                        {/* Social proof row */}
                        <div className="animate-fade-up delay-400 mt-7 flex flex-wrap items-center gap-4">
                            <div className="flex items-center -space-x-2">
                                {[
                                    "linear-gradient(135deg,#f43f5e,#fb923c)",
                                    "linear-gradient(135deg,#0ea5e9,#6366f1)",
                                    "linear-gradient(135deg,#10b981,#0ea5e9)",
                                    "linear-gradient(135deg,#a855f7,#ec4899)",
                                ].map((g, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-indigo-950"
                                        style={{ background: g }}
                                    >
                                        {["S", "M", "A", "J"][i]}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-[13px] text-white/85">
                                <div className="flex items-center gap-0.5 text-amber-400">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Icon
                                            key={i}
                                            name="star"
                                            className="h-3.5 w-3.5 fill-current"
                                        />
                                    ))}
                                </div>
                                <span>
                                    Trusted by thousands
                                    <br className="sm:hidden" />
                                    <span className="hidden sm:inline"> </span>
                                    of neighborhoods
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Floating event card */}
                    <div className="relative lg:col-span-5 xl:col-span-5">
                        <div className="relative mx-auto w-full max-w-[420px]">
                            {/* Aurora glow behind card */}
                            <div
                                aria-hidden="true"
                                className="absolute -inset-6 -z-10 rounded-[36px] opacity-70 blur-2xl"
                                style={{
                                    background:
                                        "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(236,72,153,0.25), rgba(14,165,233,0.30))",
                                }}
                            />

                            <div className="relative animate-float-card overflow-hidden rounded-[28px] border border-white/30 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                                            <Icon name="calendar-days" className="h-4 w-4" />
                                        </span>
                                        <h2 className="text-[15px] font-bold text-ink-primary">
                                            This week
                                        </h2>
                                    </div>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                                        18 local events happening now
                                    </span>
                                </div>

                                {/* Upcoming Events label */}
                                <div className="mt-5 flex items-center justify-between">
                                    <span className="text-[13px] font-bold text-ink-primary">
                                        Upcoming Events
                                    </span>
                                    <a
                                        href="#"
                                        className="text-[12px] font-semibold text-indigo-500"
                                    >
                                        View all
                                    </a>
                                </div>

                                {/* Event 1 */}
                                <article className="mt-3 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
                                    <div
                                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-cover bg-center"
                                        style={{
                                            backgroundImage:
                                                "url(https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=200&h=200&fit=crop)",
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                                            Sat, May 24 · 9:00 AM
                                        </p>
                                        <p className="truncate text-[13px] font-bold text-ink-primary">
                                            Farmers Market
                                        </p>
                                        <p className="truncate text-[11px] text-ink-body">
                                            Greenwood Park
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                        Free
                                    </span>
                                </article>

                                {/* Event 2 */}
                                <article className="mt-2 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
                                    <div
                                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-cover bg-center"
                                        style={{
                                            backgroundImage:
                                                "url(https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop)",
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                                            Sat, May 24 · 7:00 PM
                                        </p>
                                        <p className="truncate text-[13px] font-bold text-ink-primary">
                                            Live Music Night
                                        </p>
                                        <p className="truncate text-[11px] text-ink-body">
                                            Community Center
                                        </p>
                                    </div>
                                    <button
                                        aria-label="Save event"
                                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-500"
                                    >
                                        <Icon name="heart" className="h-4 w-4" />
                                    </button>
                                </article>

                                {/* Event 3 */}
                                <article className="mt-2 flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
                                    <div
                                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-cover bg-center"
                                        style={{
                                            backgroundImage:
                                                "url(https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=200&h=200&fit=crop)",
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                                            Sun, May 25 · 8:00 AM
                                        </p>
                                        <p className="truncate text-[13px] font-bold text-ink-primary">
                                            Community Clean-up
                                        </p>
                                        <p className="truncate text-[11px] text-ink-body">
                                            Riverside Area
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                        Free
                                    </span>
                                </article>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

/* House + neighborhood SVG illustration (decorative) */
function HouseBackdrop() {
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[420px] overflow-hidden">
            <svg
                viewBox="0 0 1440 420"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMax slice"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0052df" stopOpacity="0" />
                        <stop offset="100%" stopColor="#1e1b4b" />
                    </linearGradient>
                    <linearGradient id="house1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#0052df" />
                    </linearGradient>
                    <linearGradient id="house2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                    <linearGradient id="house3" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#007bff" />
                    </linearGradient>
                    <linearGradient id="windowGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fde047" />
                        <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                    <linearGradient id="treeTrunk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#4c1d95" />
                    </linearGradient>
                    <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#fff" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Ground gradient */}
                <rect x="0" y="0" width="1440" height="420" fill="url(#ground)" />

                {/* Moon glow */}
                <circle cx="1180" cy="120" r="180" fill="url(#moonGlow)" />
                <circle cx="1180" cy="120" r="60" fill="#fef3c7" opacity="0.6" />

                {/* Distant hills */}
                <path
                    d="M0 280 Q 200 240 400 280 T 800 280 T 1200 280 T 1440 280 L 1440 420 L 0 420 Z"
                    fill="#1e1b4b"
                    opacity="0.5"
                />
                <path
                    d="M0 320 Q 200 290 400 320 T 800 320 T 1200 320 T 1440 320 L 1440 420 L 0 420 Z"
                    fill="#0f172a"
                    opacity="0.6"
                />

                {/* House left */}
                <g transform="translate(60 200)" opacity="0.75">
                    {/* Roof */}
                    <path d="M0 60 L60 0 L120 60 Z" fill="#007bff" />
                    {/* Body */}
                    <rect x="10" y="60" width="100" height="120" fill="url(#house1)" />
                    {/* Windows */}
                    <rect x="28" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.9" />
                    <rect x="70" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.7" />
                    {/* Door */}
                    <rect x="48" y="125" width="24" height="55" fill="#1e1b4b" />
                    <circle cx="65" cy="155" r="1.5" fill="#fde047" />
                </g>

                {/* House center */}
                <g transform="translate(220 170)" opacity="0.85">
                    {/* Roof */}
                    <path d="M0 70 L80 0 L160 70 Z" fill="#5b21b6" />
                    {/* Body */}
                    <rect x="15" y="70" width="130" height="150" fill="url(#house2)" />
                    {/* Windows */}
                    <rect x="35" y="100" width="26" height="34" fill="url(#windowGlow)" opacity="0.95" />
                    <rect x="99" y="100" width="26" height="34" fill="url(#windowGlow)" opacity="0.85" />
                    {/* Door */}
                    <rect x="65" y="150" width="30" height="70" fill="#0f172a" />
                    <circle cx="86" cy="190" r="2" fill="#fde047" />
                    {/* Chimney */}
                    <rect x="115" y="20" width="18" height="40" fill="#0052df" />
                </g>

                {/* House right */}
                <g transform="translate(440 200)" opacity="0.7">
                    <path d="M0 60 L60 0 L120 60 Z" fill="#007bff" />
                    <rect x="10" y="60" width="100" height="120" fill="url(#house3)" />
                    <rect x="28" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.8" />
                    <rect x="70" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.6" />
                    <rect x="48" y="125" width="24" height="55" fill="#1e1b4b" />
                </g>

                {/* Tree left */}
                <g transform="translate(0 240)" opacity="0.7">
                    <rect x="10" y="50" width="8" height="50" fill="url(#treeTrunk)" />
                    <circle cx="14" cy="40" r="30" fill="#4c1d95" />
                    <circle cx="32" cy="35" r="22" fill="#5b21b6" />
                </g>

                {/* Tree right */}
                <g transform="translate(560 250)" opacity="0.6">
                    <rect x="10" y="50" width="8" height="50" fill="url(#treeTrunk)" />
                    <circle cx="14" cy="40" r="28" fill="#4c1d95" />
                    <circle cx="-4" cy="35" r="20" fill="#5b21b6" />
                </g>

                {/* People silhouettes walking */}
                <g transform="translate(680 280)" opacity="0.65">
                    <g>
                        <circle cx="0" cy="0" r="6" fill="#1e1b4b" />
                        <path d="M-6 8 L-8 35 L-2 35 L0 18 L2 35 L8 35 L6 8 Z" fill="#0052df" />
                    </g>
                </g>
                <g transform="translate(710 285)" opacity="0.6">
                    <g>
                        <circle cx="0" cy="0" r="5" fill="#0052df" />
                        <path d="M-5 7 L-7 30 L-2 30 L0 15 L2 30 L7 30 L5 7 Z" fill="#007bff" />
                    </g>
                </g>
                <g transform="translate(740 282)" opacity="0.55">
                    <g>
                        <circle cx="0" cy="0" r="5" fill="#1e1b4b" />
                        <path d="M-5 7 L-7 30 L-2 30 L0 15 L2 30 L7 30 L5 7 Z" fill="#0052df" />
                    </g>
                </g>

                {/* Lamp posts */}
                <g transform="translate(800 250)" opacity="0.7">
                    <rect x="0" y="0" width="2" height="100" fill="#1e1b4b" />
                    <circle cx="1" cy="0" r="5" fill="#fde047" opacity="0.8" />
                    <circle cx="1" cy="0" r="14" fill="#fde047" opacity="0.15" />
                </g>

                {/* House on right side */}
                <g transform="translate(900 180)" opacity="0.8">
                    <path d="M0 80 L100 0 L200 80 Z" fill="#5b21b6" />
                    <rect x="20" y="80" width="160" height="160" fill="url(#house1)" />
                    <rect x="45" y="115" width="32" height="42" fill="url(#windowGlow)" opacity="0.95" />
                    <rect x="123" y="115" width="32" height="42" fill="url(#windowGlow)" opacity="0.85" />
                    <rect x="80" y="175" width="40" height="65" fill="#0f172a" />
                    <circle cx="110" cy="210" r="2" fill="#fde047" />
                    <rect x="160" y="35" width="20" height="50" fill="#0052df" />
                </g>

                {/* House far right */}
                <g transform="translate(1180 220)" opacity="0.7">
                    <path d="M0 60 L70 0 L140 60 Z" fill="#007bff" />
                    <rect x="15" y="60" width="110" height="120" fill="url(#house3)" />
                    <rect x="35" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.7" />
                    <rect x="83" y="85" width="22" height="28" fill="url(#windowGlow)" opacity="0.6" />
                    <rect x="58" y="125" width="24" height="55" fill="#1e1b4b" />
                </g>

                {/* Foreground sidewalk */}
                <rect x="0" y="380" width="1440" height="40" fill="#0f172a" opacity="0.4" />
                <line x1="0" y1="400" x2="1440" y2="400" stroke="#0052df" strokeWidth="1" opacity="0.3" />
            </svg>
        </div>
    );
}

export default Hero;
