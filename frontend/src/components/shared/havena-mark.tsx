"use client";

import { useState } from "react";
import havenaMark from "@/assets/havena-mark.png";

const BUNDLED_SRC = havenaMark.src;
const FALLBACKS = [BUNDLED_SRC, "/havena-logo.png"];

function BrandImage({
  size,
  className,
  tight = false,
}: {
  size: number;
  className: string;
  tight?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const src = FALLBACKS[Math.min(index, FALLBACKS.length - 1)];

  // Soften PNG side padding so mark↔wordmark reads as a balanced lockup.
  const style = tight ? { marginInlineEnd: Math.round(size * -0.08) } : undefined;

  return (
    <img
      src={src}
      alt="Havena"
      width={size}
      height={size}
      className={`object-contain ${className}`.trim()}
      style={style}
      onError={() => {
        setIndex((current) => (current < FALLBACKS.length - 1 ? current + 1 : current));
      }}
    />
  );
}

/**
 * Havena brand mark — original two-tone infinity PNG.
 * @param tight — pull right edge in for horizontal wordmark lockups (skip inside boxed marks).
 */
export function HavenaMark({
  size = 48,
  className = "",
  tone: _tone = "brand",
  tight = false,
}: {
  size?: number;
  className?: string;
  tone?: "brand" | "light";
  tight?: boolean;
}) {
  return <BrandImage size={size} className={className} tight={tight} />;
}

/** Compact glyph for tinted tiles (no filled background). */
export function HavenaHouseIcon({
  size = 20,
  className = "",
}: {
  size?: number;
  color?: string;
  accent?: string;
  className?: string;
}) {
  return <BrandImage size={size} className={className} />;
}
