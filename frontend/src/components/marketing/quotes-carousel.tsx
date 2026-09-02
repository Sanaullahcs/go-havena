"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { testimonials } from "@/lib/marketing/content";

const AUTO_MS = 6500;

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

  return (
    <div
      className="lp-quotes-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div
        className="lp-quotes-carousel__card"
        aria-roledescription="carousel"
        aria-label="Community leader quotes"
      >
        <blockquote key={current.name} className="lp-quotes-carousel__quote">
          <p>&ldquo;{current.quote}&rdquo;</p>
          <footer>
            <strong>{current.name}</strong>
            <span>{current.role}</span>
          </footer>
        </blockquote>
      </div>

      <div className="lp-quotes-carousel__controls">
        <button
          type="button"
          className="lp-quotes-carousel__nav"
          aria-label="Previous quote"
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="lp-quotes-carousel__dots" role="tablist" aria-label="Choose a quote">
          {testimonials.map((item, slideIndex) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={`Show quote from ${item.name}`}
              className={`lp-quotes-carousel__dot${slideIndex === index ? " is-active" : ""}`}
              onClick={() => go(slideIndex)}
            />
          ))}
        </div>

        <button
          type="button"
          className="lp-quotes-carousel__nav"
          aria-label="Next quote"
          onClick={() => go(index + 1)}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
