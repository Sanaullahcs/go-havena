"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
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
  const [hash, setHash] = useState("");
  const parsed = parseHref(href);

  useEffect(() => {
    const sync = () => setHash(window.location.hash.replace(/^#/, ""));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("havena-nav", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("havena-nav", sync);
    };
  }, [pathname]);

  const active =
    parsed.kind === "section"
      ? pathname === "/" && hash === parsed.hash
      : parsed.kind === "internal" && parsed.href === "/"
        ? pathname === "/" && hash === ""
        : parsed.kind === "internal" &&
          (pathname === parsed.href || pathname.startsWith(`${parsed.href}/`));

  const itemClass = [className, active ? "is-active" : ""].filter(Boolean).join(" ");

  if (parsed.kind === "external") {
    return (
      <a
        href={parsed.href}
        className={itemClass}
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
      window.dispatchEvent(new Event("havena-nav"));
      onNavigate?.();
    };

    return (
      <a href={cleanHref} className={itemClass} aria-current={active ? "page" : undefined} onClick={onClick}>
        {children}
      </a>
    );
  }

  const onHomeClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (parsed.kind === "internal" && parsed.href === "/" && pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new Event("havena-nav"));
    }
    onNavigate?.();
  };

  return (
    <Link href={parsed.href} className={itemClass} aria-current={active ? "page" : undefined} onClick={onHomeClick}>
      {children}
    </Link>
  );
}
