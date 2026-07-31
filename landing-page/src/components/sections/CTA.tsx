import * as React from "react";
import { Container } from "../ui/Container";

/**
 * "Ready to build a stronger, more connected community?" CTA.
 *
 * Rendered full-bleed (no inner Container gutters). The panel's
 * bottom corners are unrounded so it sits flush against the footer
 * with no visible gap, exactly like the reference design.
 */
export function CTA() {
    return (
        <section
            id="contact"
            className="scroll-mt-24 relative w-full overflow-hidden"
        >
            {/* Full-bleed dark gradient panel. No rounded corners on the
          bottom so the section flows seamlessly into the footer. */}
            <div
                className="relative w-full overflow-hidden px-6 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-20"
                style={{
                    background:
                        "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
                }}
            >
                {/* Decorative grid */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 grid-mask opacity-30"
                />

                {/* Aurora glows */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-32 top-0 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl"
                    style={{
                        background:
                            "radial-gradient(circle, #6366f1 0%, transparent 70%)",
                    }}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-32 bottom-0 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl"
                    style={{
                        background:
                            "radial-gradient(circle, #ec4899 0%, transparent 70%)",
                    }}
                />

                {/* Stars */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    {Array.from({ length: 18 }).map((_, i) => {
                        const size = i % 3 === 0 ? 2 : 1.5;
                        return (
                            <span
                                key={i}
                                className="absolute rounded-full bg-white animate-twinkle"
                                style={{
                                    width: size,
                                    height: size,
                                    top: `${(i * 47) % 100}%`,
                                    left: `${(i * 73) % 100}%`,
                                    opacity: 0.4,
                                    animationDelay: `${(i % 4) * 0.5}s`,
                                }}
                            />
                        );
                    })}
                </div>

                {/* Inner max-width wrapper for the content, but the section
            itself is full-bleed. */}
                <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-12">
                    {/* Left: house illustration */}
                    <div className="relative lg:col-span-5">
                        <div className="relative mx-auto w-full max-w-md">
                            <svg
                                viewBox="0 0 400 320"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-auto w-full"
                                aria-hidden="true"
                            >
                                <defs>
                                    <linearGradient id="cta-sky" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#312e81" />
                                        <stop offset="100%" stopColor="#1e1b4b" />
                                    </linearGradient>
                                    <linearGradient id="cta-house1" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#6366f1" />
                                        <stop offset="100%" stopColor="#4338ca" />
                                    </linearGradient>
                                    <linearGradient id="cta-house2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#7c3aed" />
                                        <stop offset="100%" stopColor="#5b21b6" />
                                    </linearGradient>
                                    <linearGradient id="cta-window" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#fde047" />
                                        <stop offset="100%" stopColor="#f59e0b" />
                                    </linearGradient>
                                    <radialGradient id="cta-moon" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
                                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                                    </radialGradient>
                                </defs>

                                {/* Moon glow */}
                                <circle cx="320" cy="60" r="80" fill="url(#cta-moon)" />
                                <circle cx="320" cy="60" r="30" fill="#fef3c7" opacity="0.7" />

                                {/* Stars */}
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const x = (i * 37 + 20) % 400;
                                    const y = (i * 23 + 10) % 180;
                                    return (
                                        <circle
                                            key={i}
                                            cx={x}
                                            cy={y}
                                            r={i % 3 === 0 ? 1.5 : 1}
                                            fill="#fff"
                                            opacity={0.6}
                                        />
                                    );
                                })}

                                {/* Distant hills */}
                                <path
                                    d="M0 200 Q 100 170 200 200 T 400 200 L 400 320 L 0 320 Z"
                                    fill="#1e1b4b"
                                />

                                {/* House left */}
                                <g transform="translate(40 130)">
                                    <path d="M0 50 L50 0 L100 50 Z" fill="#4338ca" />
                                    <rect x="10" y="50" width="80" height="100" fill="url(#cta-house1)" />
                                    <rect x="25" y="70" width="18" height="22" fill="url(#cta-window)" opacity="0.9" />
                                    <rect x="57" y="70" width="18" height="22" fill="url(#cta-window)" opacity="0.7" />
                                    <rect x="42" y="100" width="20" height="50" fill="#0f172a" />
                                </g>

                                {/* House center (bigger) */}
                                <g transform="translate(160 100)">
                                    <path d="M0 60 L70 0 L140 60 Z" fill="#5b21b6" />
                                    <rect x="15" y="60" width="110" height="130" fill="url(#cta-house2)" />
                                    <rect x="35" y="85" width="22" height="30" fill="url(#cta-window)" opacity="0.95" />
                                    <rect x="83" y="85" width="22" height="30" fill="url(#cta-window)" opacity="0.85" />
                                    <rect x="58" y="130" width="26" height="60" fill="#0f172a" />
                                    <rect x="105" y="22" width="16" height="40" fill="#312e81" />
                                </g>

                                {/* Tree */}
                                <g transform="translate(320 200)">
                                    <rect x="0" y="20" width="6" height="50" fill="#5b21b6" />
                                    <circle cx="3" cy="15" r="22" fill="#4c1d95" />
                                    <circle cx="20" cy="10" r="18" fill="#5b21b6" />
                                </g>

                                {/* Ground */}
                                <rect x="0" y="290" width="400" height="30" fill="#0f172a" opacity="0.6" />
                            </svg>
                        </div>
                    </div>

                    {/* Right: copy + buttons */}
                    <div className="lg:col-span-7">
                        <h2 className="display-title text-[32px] leading-[1.1] text-white sm:text-4xl lg:text-[44px]">
                            Ready to build a stronger,
                            <br />
                            <span className="bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                                more connected community?
                            </span>
                        </h2>
                        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80 sm:text-[16px]">
                            Join thousands of neighborhoods already using NeighborLink.
                        </p>

                        {/* App store buttons */}
                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <a
                                href="#"
                                className="group inline-flex items-center gap-3 rounded-xl border border-white/15 bg-black px-5 py-3 transition-transform hover:-translate-y-0.5"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-7 w-7 fill-white"
                                    aria-hidden="true"
                                >
                                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                </svg>
                                <span className="text-left">
                                    <span className="block text-[10px] font-medium text-white/80">
                                        Download on the
                                    </span>
                                    <span className="block text-[16px] font-bold leading-tight text-white">
                                        App Store
                                    </span>
                                </span>
                            </a>

                            <a
                                href="#"
                                className="group inline-flex items-center gap-3 rounded-xl border border-white/15 bg-black px-5 py-3 transition-transform hover:-translate-y-0.5"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-7 w-7"
                                    aria-hidden="true"
                                >
                                    <path
                                        d="M3 3.5v17l16-8.5L3 3.5z"
                                        fill="#fbbc04"
                                    />
                                    <path
                                        d="M3 3.5l16 8.5-5 2.5L3 3.5z"
                                        fill="#34a853"
                                    />
                                    <path
                                        d="M3 20.5l11-6 5 2.5L3 20.5z"
                                        fill="#ea4335"
                                    />
                                    <path
                                        d="M14 14.5l5-2.5L3 20.5l11-6z"
                                        fill="#4285f4"
                                    />
                                </svg>
                                <span className="text-left">
                                    <span className="block text-[10px] font-medium text-white/80">
                                        GET IT ON
                                    </span>
                                    <span className="block text-[16px] font-bold leading-tight text-white">
                                        Google Play
                                    </span>
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CTA;
