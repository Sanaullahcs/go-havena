import * as React from "react";
import { Icon } from "../icons/Icon";
import { Container } from "../ui/Container";

type Testimonial = {
    quote: string;
    name: string;
    role: string;
    initials: string;
    color: string;
};

const TESTIMONIALS: Testimonial[] = [
    {
        quote:
            "“The notice board and events keep me so informed. I feel more connected than ever!”",
        name: "Jessica M.",
        role: "Community Member",
        initials: "JM",
        color: "linear-gradient(135deg,#f97316,#ec4899)",
    },
    {
        quote:
            "“Managing our community is so easy now. The admin dashboard is a game-changer.”",
        name: "David R.",
        role: "Community Admin",
        initials: "DR",
        color: "linear-gradient(135deg,#06b6d4,#6366f1)",
    },
    {
        quote:
            "“I found great local deals and am learning so much from the wellness courses.”",
        name: "Sarah L.",
        role: "Community Member",
        initials: "SL",
        color: "linear-gradient(135deg,#10b981,#0ea5e9)",
    },
];

export function Testimonials() {
    return (
        <section
            id="about"
            className="scroll-mt-24 relative py-20 sm:py-24 lg:py-32"
        >
            <Container size="xl">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
                    {/* Left: Header */}
                    <div className="lg:col-span-5">
                        <span className="section-label text-violet-500">
                            Loved by Communities
                        </span>
                        <h2 className="display-title mt-4 text-[36px] sm:text-4xl lg:text-[44px]">
                            Neighbors Love
                            <br />
                            <span className="gradient-text">NeighborLink</span>
                        </h2>
                        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-body">
                            NeighborLink has transformed the way our community connects.
                            Everything we need is in one place!
                        </p>

                        <div className="mt-6 flex items-center gap-2 text-amber-400">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Icon
                                    key={i}
                                    name="star"
                                    className="h-4 w-4 fill-current"
                                />
                            ))}
                            <span className="ml-2 text-[13px] font-semibold text-ink-primary">
                                5.0 from 1,200+ reviews
                            </span>
                        </div>
                    </div>

                    {/* Right: 3 cards stacked horizontally on lg, vertically on sm */}
                    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-7">
                        {TESTIMONIALS.map((t) => (
                            <li
                                key={t.name}
                                className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-border-card bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:p-7"
                            >
                                {/* Decorative quote icon top right */}
                                <div className="absolute right-5 top-5 text-fuchsia-200">
                                    <svg
                                        viewBox="0 0 24 24"
                                        className="h-7 w-7 fill-current"
                                        aria-hidden="true"
                                    >
                                        <path d="M7 7h3v3H7v3H4V7h3zm10 0h3v3h-3v3h-3V7h3z" />
                                    </svg>
                                </div>

                                {/* Quote */}
                                <p className="text-[14.5px] leading-relaxed text-ink-body">
                                    {t.quote}
                                </p>

                                {/* Author */}
                                <div className="mt-auto flex items-center gap-3 border-t border-border-subtle pt-4">
                                    <span
                                        className="grid h-11 w-11 place-items-center rounded-full text-[13px] font-bold text-white shadow-lg ring-2 ring-white"
                                        style={{ background: t.color }}
                                    >
                                        {t.initials}
                                    </span>
                                    <div>
                                        <div className="text-[14px] font-bold text-ink-primary">
                                            {t.name}
                                        </div>
                                        <div className="text-[12px] text-ink-muted">
                                            {t.role}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </Container>
        </section>
    );
}

export default Testimonials;
