import * as React from "react";

/**
 * The brand mark used in the header. Rendered as an inline SVG
 * (gradient house) so it matches the reference design exactly.
 */
type Variant = "full" | "mark" | "wordmark";
/**
 * Color tone for the wordmark text.
 *  - `light` → white text (use on dark/purple backgrounds, e.g. transparent header)
 *  - `brand` → brand purple text (use on white/light backgrounds, e.g. scrolled header)
 *  - `dark`  → ink-primary text (default if not provided, kept for backwards compat)
 */
type Tone = "light" | "brand" | "dark";

type Props = {
    variant?: Variant;
    className?: string;
    withWordmarkText?: boolean;
    tone?: Tone;
};

const toneTextClass: Record<Tone, string> = {
    light: "text-white",
    brand: "text-brand-deep",
    dark: "text-ink-primary",
};

function BrandMark({ size = 36 }: { size?: number }) {
    return (
        <svg
            viewBox="0 0 48 48"
            width={size}
            height={size}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="bm-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0D9488" />
                    <stop offset="50%" stopColor="#0A2A43" />
                    <stop offset="100%" stopColor="#0A2A43" />
                </linearGradient>
            </defs>
            <rect width="48" height="48" rx="12" fill="url(#bm-grad)" />
            {/* House body */}
            <path
                d="M14 28 V20 L24 13 L34 20 V28"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* House base */}
            <rect
                x="14"
                y="28"
                width="20"
                height="8"
                rx="1.5"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
            />
            {/* Door / keyhole */}
            <path d="M22 36 V31.5 a2 2 0 0 1 4 0 V36" fill="white" />
        </svg>
    );
}

export function Logo({
    variant = "full",
    className = "",
    withWordmarkText = true,
    tone = "dark",
}: Props) {
    if (variant === "mark") {
        return (
            <span
                className={`inline-block shadow-fab rounded-xl overflow-hidden ${className}`}
                aria-label="Havena"
            >
                <BrandMark size={36} />
            </span>
        );
    }

    if (variant === "wordmark") {
        return (
            <span
                className={`inline-flex items-center gap-2 ${toneTextClass[tone]} ${className}`}
            >
                <span className="inline-block overflow-hidden rounded-lg shadow-sm">
                    <BrandMark size={28} />
                </span>
                <span className="text-base font-bold tracking-tight">Havena</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <span className="inline-block overflow-hidden rounded-xl shadow-fab">
                <BrandMark size={36} />
            </span>
            {withWordmarkText && (
                <span className="flex flex-col leading-none">
                    <span
                        className={`text-[16px] font-bold tracking-tight transition-colors duration-300 ease-out ${toneTextClass[tone]}`}
                    >
                        Havena
                    </span>
                </span>
            )}
        </span>
    );
}

export default Logo;
