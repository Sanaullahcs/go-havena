"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms */
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "blockquote";
};

/**
 * Lightweight scroll reveal — toggles `.is-inview` when visible.
 * Honors prefers-reduced-motion via CSS. Uses lighter thresholds on small screens.
 */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.classList.add("is-inview");
      return;
    }

    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        node.classList.add("is-inview");
        observer.unobserve(node);
      },
      {
        threshold: mobile ? 0.06 : 0.14,
        rootMargin: mobile ? "0px 0px -2% 0px" : "0px 0px -6% 0px",
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style = delay
    ? ({ "--lp-reveal-delay": `${delay}ms` } as CSSProperties)
    : undefined;

  return (
    <Tag ref={ref as never} className={`lp-reveal ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}
