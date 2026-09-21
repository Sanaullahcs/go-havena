"use client";

import * as React from "react";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

function isInViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

/** Fade-up on scroll into view. Content stays readable if IO is delayed (mobile Safari). */
export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setVisible(true);
      return undefined;
    }

    setVisible(isInViewport(el));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px 8% 0px" },
    );

    observer.observe(el);

    const fallback = window.setTimeout(() => setVisible(true), 1200);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={[
        "opacity-100 transition-transform duration-700 ease-out",
        visible ? "translate-y-0" : "translate-y-6",
        className,
      ].join(" ")}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

export default Reveal;
