/**
 * Havena brand mark — clean H monogram.
 * Teal crossbar = the “link” between neighbors; no house-icon cliché.
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
      viewBox="0 0 40 40"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="40" height="40" rx="11" fill="#0A2A43" />
      <path
        d="M13 12.5 V27.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M27 12.5 V27.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M13 20 H27"
        fill="none"
        stroke="#14B8A6"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Compact glyph for tinted tiles (no filled background). */
export function HavenaHouseIcon({
  size = 20,
  color = "#0A2A43",
  accent = "#14B8A6",
  className = "",
}: {
  size?: number;
  color?: string;
  accent?: string;
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
        d="M7 5.5 V18.5"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M17 5.5 V18.5"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M7 12 H17"
        stroke={accent}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
