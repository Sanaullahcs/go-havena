"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function parseHref(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return { kind: "external" as const, href };
  }

  const hashIndex = href.indexOf("#");
  if (hashIndex >= 0) {
    const hash = href.slice(hashIndex + 1).replace(/^#+/, "");
    return { kind: "section" as const, hash };
  }

  return { kind: "internal" as const, href };
}

type MarketingNavLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  externalBlank?: boolean;
  onNavigate?: () => void;
};

/**
 * Clean marketing navigation — section URLs stay `/#section` (never `/#a#a`).
 */
export function MarketingNavLink({
  href,
  className,
  children,
  externalBlank = false,
  onNavigate,
}: MarketingNavLinkProps) {
  const pathname = usePathname();
  const parsed = parseHref(href);

  if (parsed.kind === "external") {
    return (
      <a
        href={parsed.href}
        className={className}
        target={externalBlank ? "_blank" : undefined}
        rel={externalBlank ? "noopener noreferrer" : undefined}
        onClick={onNavigate}
      >
        {children}
      </a>
    );
  }

  if (parsed.kind === "section") {
    const cleanHref = `/#${parsed.hash}`;

    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      // From other pages, let the browser open `/#section` normally.
      if (pathname !== "/") {
        onNavigate?.();
        return;
      }

      // On the homepage, avoid hash duplication and smooth-scroll instead.
      event.preventDefault();
      const target = document.getElementById(parsed.hash);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      window.history.replaceState(null, "", cleanHref);
      onNavigate?.();
    };

    return (
      <a href={cleanHref} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={parsed.href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}
