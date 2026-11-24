"use client";

import { useEffect } from "react";

/** Drift on product shots and decorative layers only — keeps type and UI sharp. */
export function MarketingParallax() {
  useEffect(() => {
    const root = document.querySelector(".marketing-landing");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nodes = () =>
      [
        ...root.querySelectorAll<HTMLElement>("img[data-depth]"),
        ...root.querySelectorAll<HTMLElement>(".lp-parallax-decor[data-depth]"),
      ];

    const current = new WeakMap<HTMLElement, number>();
    let frame = 0;

    const tick = () => {
      const vh = window.innerHeight || 1;
      const ease = window.matchMedia("(max-width: 767px)").matches ? 0.45 : 1;
      let moving = false;

      for (const el of nodes()) {
        const depth = (Number(el.dataset.depth) || 0) * ease;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -240 || rect.top > vh + 240) continue;
        const delta = (rect.top + rect.height / 2 - vh / 2) / vh;
        const target = Math.max(-1.15, Math.min(1.15, delta)) * depth;
        const prev = current.get(el) ?? target;
        const next = prev + (target - prev) * 0.18;
        current.set(el, next);
        const y = Math.round(-next);
        el.style.transform = y === 0 ? "" : `translate3d(0, ${y}px, 0)`;
        if (Math.abs(target - next) > 0.15) moving = true;
      }

      frame = moving ? requestAnimationFrame(tick) : 0;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      for (const el of nodes()) {
        el.style.transform = "";
      }
    };
  }, []);

  return null;
}