/**
 * Havena brand mark — H monogram with a roof peak.
 * Reads as “home + community” without a generic house icon.
 */
export function HavenaMark({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="48" height="48" rx="13" fill="#1B4F8A" />
      {/* Roof peak */}
      <path
        d="M14 20 L24 12 L34 20"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* H stems + crossbar */}
      <path
        d="M17 36 V22.5 M31 36 V22.5 M17 28.5 H31"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact glyph for tinted tiles (no filled background). */
export function HavenaHouseIcon({
  size = 20,
  color = "#0B1C2E",
  className = "",
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 10 L12 4 L19 10"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 20 V11.5 M17 20 V11.5 M7 15.5 H17"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
