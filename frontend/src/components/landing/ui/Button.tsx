import * as React from "react";
import NextLink from "next/link";
import { Icon, type IconName } from "../icons/Icon";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "white";
type Size = "sm" | "md" | "lg";

export type ButtonProps = {
    variant?: Variant;
    size?: Size;
    icon?: IconName;
    iconTrailing?: IconName;
    fullWidth?: boolean;
    /**
     * Render as a Next.js client-side `Link` (recommended for any
     * in-project route). Defaults to `true` so internal navigation
     * gets the SPA-style transition automatically. Set to `false`
     * when you need a hard `<a>` (e.g. external URL, mailto, hash
     * anchor, or an onClick handler that should not navigate).
     */
    link?: boolean;
    children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
        href?: string;
    };

/**
 * Reusable Button — used for the Sign Up, Login and Profile CTAs.
 *
 * Renders a Next.js `<Link>` by default so internal routes are
 * client-side navigations. Pass `link={false}` to force a plain `<a>`.
 */
export function Button({
    variant = "primary",
    size = "md",
    icon,
    iconTrailing,
    fullWidth = false,
    link = true,
    className = "",
    children,
    href,
    onClick,
    ...rest
}: ButtonProps) {
    const base =
        "group/btn relative inline-flex items-center justify-center gap-2 font-semibold tracking-tight " +
        "transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-deep " +
        "rounded-button select-none whitespace-nowrap active:scale-[0.98]";

    const sizes: Record<Size, string> = {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-[14.5px]",
        lg: "h-12 px-6 text-[15px]",
    };

    const variants: Record<Variant, string> = {
        primary: "landing-btn-primary",
        secondary: "landing-btn-secondary",
        outline:
            "bg-transparent text-ink-primary border border-ink-primary/15 hover:border-brand/40 hover:text-brand-deep",
        ghost: "landing-btn-ghost",
        white:
            "bg-white text-brand-deep shadow-fab hover:bg-white hover:shadow-elevated hover:-translate-y-0.5",
    };

    const width = fullWidth ? "w-full" : "";

    const classes = [base, sizes[size], variants[variant], width, className]
        .filter(Boolean)
        .join(" ");

    const inner = (
        <>
            {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
            <span>{children}</span>
            {iconTrailing ? (
                <Icon
                    name={iconTrailing}
                    className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5"
                />
            ) : null}
        </>
    );

    // Use Next.js client-side Link for any non-anchor href.
    // - `#hash`, `mailto:`, `tel:`, fully-qualified external URLs and
    //   cases where the caller wants to handle navigation themselves
    //   (e.g. onClick) all fall back to a plain `<a>`.
    const isAnchor =
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        /^[a-z][a-z0-9+.-]*:/i.test(href); // any scheme like https://

    if (link && href && !isAnchor) {
        return (
            <NextLink
                href={href}
                className={classes}
                onClick={onClick}
                {...rest}
            >
                {inner}
            </NextLink>
        );
    }

    return (
        <a
            href={href}
            className={classes}
            onClick={onClick}
            {...rest}
        >
            {inner}
        </a>
    );
}

export default Button;
