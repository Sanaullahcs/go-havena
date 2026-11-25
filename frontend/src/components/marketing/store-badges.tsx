import { storeLinks } from "@/lib/marketing/content";

function AppleIcon() {
  return (
    <svg className="lp-store-badge__svg lp-store-badge__svg--apple" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="lp-store-badge__svg lp-store-badge__svg--play" viewBox="0 0 512 512" aria-hidden>
      <path
        fill="#00D2FF"
        d="M325.3 234.3 104.5 8.7C96.8 1.5 85.3-.5 74.7.3 64.1 1.1 54.6 7.5 49.7 16.6l-.4.7v478.2l.4.7c4.9 9.1 14.4 15.5 25 16.3 10.6.8 22.1-1.2 29.8-8.5l220.8-225.5z"
      />
      <path
        fill="#FFCE00"
        d="M486.2 259.7l-58.7-34.1-103.2 103.2 102.9 102.9 59.3-34.4c21.4-12.4 21.4-43.1-.3-57.6z"
      />
      <path
        fill="#00F076"
        d="M379.3 351.8 276.1 248.6 48.7 503.5c4.9 9.1 14.4 15.5 25 16.3 10.6.8 22.1-1.2 29.8-8.5l275.8-159.5z"
      />
      <path
        fill="#FF3A44"
        d="M104.5 8.7 376.3 165.6l58.7-34.1c21.4-12.4 21.4-43.1-.3-57.6L178.2.3C167.6-.5 156.1 1.5 148.4 8.7H104.5z"
      />
    </svg>
  );
}

type StoreBadgesProps = {
  tone?: "light" | "dark";
  className?: string;
};

export function StoreBadges({ tone = "light", className = "" }: StoreBadgesProps) {
  return (
    <div className={`lp-store-badges lp-store-badges--${tone}${className ? ` ${className}` : ""}`}>
      <a
        href={storeLinks.apple}
        className="lp-store-badge"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="lp-store-badge__icon" aria-hidden>
          <AppleIcon />
        </span>
        <span className="lp-store-badge__copy">
          <small>Download on the</small>
          App Store
        </span>
      </a>
      <a
        href={storeLinks.play}
        className="lp-store-badge"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="lp-store-badge__icon" aria-hidden>
          <PlayIcon />
        </span>
        <span className="lp-store-badge__copy">
          <small>Get it on</small>
          Google Play
        </span>
      </a>
    </div>
  );
}