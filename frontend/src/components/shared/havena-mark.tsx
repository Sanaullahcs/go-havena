"use client";

import { useState } from "react";
import havenaMark from "@/assets/havena-mark.png";

const BUNDLED_SRC = havenaMark.src;
const FALLBACKS = [BUNDLED_SRC, "/havena-logo.png"];

function BrandImage({
  size,
  className,
}: {
  size: number;
  className: string;
}) {
  const [index, setIndex] = useState(0);
  const src = FALLBACKS[Math.min(index, FALLBACKS.length - 1)];

  return (
    <img
      src={src}
      alt="Havena"
      width={size}
      height={size}
      className={`object-contain ${className}`.trim()}
      onError={() => {
        setIndex((current) => (current < FALLBACKS.length - 1 ? current + 1 : current));
      }}
    />
  );
}

/**
 * Havena brand mark — original two-tone infinity PNG.
 */
export function HavenaMark({
  size = 36,
  className = "",
  tone: _tone = "brand",
}: {
  size?: number;
  className?: string;
  tone?: "brand" | "light";
}) {
  return <BrandImage size={size} className={className} />;
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
