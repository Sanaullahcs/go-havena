"use client";

import { useCallback, useEffect, useState } from "react";
import { testimonials } from "@/lib/marketing/content";

const AUTO_MS = 7000;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function QuotesCarousel() {
  const count = testimonials.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => {
      setIndex((next + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const timer = window.setInterval(() => go(index + 1), AUTO_MS);
    return () => window.clearInterval(timer);
  }, [go, index, paused]);

  const current = testimonials[index];
  const others = testimonials
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter((entry) => entry.itemIndex !== index);

  return (
    <div
      className={`lp-quotes-stage${paused ? " is-paused" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <article className="lp-quotes-feature" aria-live="polite">
        <span className="lp-quotes-feature__mark" aria-hidden>&ldquo;</span>
        <blockquote key={current.name} className="lp-quotes-feature__quote">
          <p>{current.quote}</p>
        </blockquote>
        <footer key={`${current.name}-footer`} className="lp-quotes-feature__meta">
          <span className="lp-quotes-feature__avatar" aria-hidden>{initials(current.name)}</span>
          <span>
            <strong>{current.name}</strong>
            <span>{current.role}</span>
          </span>
        </footer>
      </article>

      <div className="lp-quotes-rail" role="tablist" aria-label="More from community leaders">
        {others.map(({ item, itemIndex }) => (
          <button
            key={item.name}
            type="button"
            role="tab"
            aria-selected={false}
            className="lp-quotes-rail__card"
            onClick={() => go(itemIndex)}
          >
            <span className="lp-quotes-rail__avatar" aria-hidden>{initials(item.name)}</span>
            <span>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
              <em>{item.quote}</em>
            </span>
          </button>
        ))}
        <div className="lp-quotes-rail__progress" aria-hidden>
          {testimonials.map((item, slideIndex) => (
            <button
              key={item.name}
              type="button"
              className={slideIndex === index ? "is-active" : ""}
              aria-label={`Show quote from ${item.name}`}
              onClick={() => go(slideIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
