"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/media/resolve-url";

const FALLBACK_COLORS = [
  "#1B4F8A", "#7c3aed", "#059669", "#d97706", "#0891b2",
  "#db2777", "#dc2626", "#65a30d", "#0284c7", "#9333ea",
];

function colorFromName(name: string): string {
  let hash = 0;
  const text = String(name ?? "");
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export function UserAvatar({
  name,
  src,
  size = 32,
  className = "",
  color,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  color?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = useMemo(() => resolveMediaUrl(src), [src]);
  const displayName = String(name ?? "").trim() || "User";
  const bg = color ?? colorFromName(displayName);
  const textSize = size <= 28 ? "text-[10px]" : size <= 36 ? "text-[11px]" : "text-[12px]";

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (resolved && !failed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={resolved}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ring-1 ring-black/5 ${className}`}
        style={{ width: size, height: size, minWidth: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-1 ring-black/5 ${textSize} ${className}`}
      style={{ width: size, height: size, minWidth: size, background: bg }}
    >
      {initialsFromName(displayName)}
    </span>
  );
}
