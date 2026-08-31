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
 * Honors prefers-reduced-motion via CSS.
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        node.classList.add("is-inview");
        observer.unobserve(node);
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
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
