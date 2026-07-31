import * as React from "react";
import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

type Highlight = {
    title: string;
    body: string;
    icon: IconName;
    /** Soft accent ring + glow */
    ring: string;
    glow: string;
    iconWrap: string;
    iconColor: string;
};

const HIGHLIGHTS: Highlight[] = [
    {
        title: "Quiet by design",
        body: "Only the updates that matter to your block.",
        icon: "sparkles",
        ring: "ring-indigo-500/15",
        glow: "from-indigo-500/20 via-sky-400/15 to-transparent",
        iconWrap: "bg-white/70 backdrop-blur-xl",
        iconColor: "text-indigo-600",
    },
    {
        title: "Built on trust",
        body: "Verified residents and address-level privacy.",
        icon: "shield-check",
        ring: "ring-cyan-500/15",
        glow: "from-cyan-500/20 via-indigo-400/15 to-transparent",
        iconWrap: "bg-white/70 backdrop-blur-xl",
        iconColor: "text-cyan-600",
    },
    {
        title: "Made for moments",
        body: "Block parties, helpers, and everyday wins.",
        icon: "heart",
        ring: "ring-fuchsia-500/15",
        glow: "from-fuchsia-500/20 via-pink-400/15 to-transparent",
        iconWrap: "bg-white/70 backdrop-blur-xl",
        iconColor: "text-fuchsia-600",
    },
    {
        title: "Effortless to use",
        body: "Calm interface. Zero learning curve.",
        icon: "zap",
        ring: "ring-sky-500/15",
        glow: "from-sky-500/20 via-indigo-400/15 to-transparent",
        iconWrap: "bg-white/70 backdrop-blur-xl",
        iconColor: "text-sky-600",
    },
];

export function BenefitsRow() {
    return (
        <section className="relative -mt-16 pb-16 sm:-mt-20 sm:pb-20 lg:-mt-24 lg:pb-24">
            <Container size="xl">
                <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                    {HIGHLIGHTS.map((h) => (
                        <li
                            key={h.title}
                            className="group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-500 hover:-translate-y-1"
                        >
                            {/* Gradient ring border */}
                            <div
                                aria-hidden="true"
                                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/60 via-white/30 to-white/10 opacity-90"
                            />
                            <div
                                aria-hidden="true"
                                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${h.glow} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                            />

                            {/* Card body */}
                            <div
                                className={`relative flex h-full flex-col gap-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-[0_8px_30px_rgba(0,82,223,0.08)] backdrop-blur-2xl ring-1 ${h.ring} transition-all duration-500 group-hover:shadow-[0_18px_50px_rgba(0,82,223,0.18)] sm:gap-4 sm:p-5`}
                            >
                                {/* Decorative corner glow */}
                                <div
                                    aria-hidden="true"
                                    className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${h.glow} opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
                                />

                                {/* Icon */}
                                <div className="relative">
                                    <div
                                        className={`grid h-11 w-11 place-items-center rounded-xl ${h.iconWrap} ${h.iconColor} ring-1 ring-white/60 shadow-sm transition-transform duration-500 group-hover:scale-110`}
                                    >
                                        <Icon name={h.icon} className="h-4.5 w-4.5" />
                                    </div>
                                    {/* Tiny pulse ring on hover */}
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute -inset-1 rounded-2xl border border-indigo-400/0 transition-all duration-500 group-hover:scale-110 group-hover:border-indigo-400/30"
                                    />
                                </div>

                                {/* Text */}
                                <div className="relative mt-1">
                                    <h3 className="text-[14px] font-bold tracking-tight text-ink-primary sm:text-[15px]">
                                        {h.title}
                                    </h3>
                                    <p className="mt-1.5 text-[12.5px] leading-snug text-ink-body">
                                        {h.body}
                                    </p>
                                </div>

                                {/* Hairline + arrow */}
                                <div className="relative mt-1 flex items-center justify-between border-t border-white/0 pt-2 transition-colors duration-500 group-hover:border-indigo-100">
                                    <span className="text-[11px] font-semibold text-transparent transition-colors duration-500 group-hover:text-indigo-500">
                                        Discover
                                    </span>
                                    <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-50 text-indigo-500 transition-all duration-500 group-hover:bg-[#0052DF] group-hover:text-white">
                                        <Icon name="arrow-up-right" className="h-3 w-3" />
                                    </span>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </Container>
        </section>
    );
}

export default BenefitsRow;
