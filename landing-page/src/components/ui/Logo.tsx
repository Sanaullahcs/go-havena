import * as React from "react";
import havenaMark from "@/assets/havena-mark.png";

const MARK_SRC = typeof havenaMark === "string" ? havenaMark : havenaMark.src;

/**
 * The brand mark used in the header — two-tone infinity on a transparent PNG.
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
        <img
            src={MARK_SRC}
            alt="Havena"
            width={size}
            height={size}
            className="object-contain"
        />
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
                className={`inline-block ${className}`}
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
                <span className="inline-block">
                    <BrandMark size={28} />
                </span>
                <span className="text-base font-bold tracking-tight">Havena</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <span className="inline-block">
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
