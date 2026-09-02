import { storeLinks } from "@/lib/marketing/content";

function AppleMark() {
  return (
    <svg viewBox="0 0 16 20" width="16" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M13.2 10.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.8-.8-3-.7C4.1 5.6 2.6 6.6 1.7 8.3c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.3 2.5 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.2 3.2-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.8ZM11.2 3.5c.7-.9 1.2-2.1 1.1-3.3-1 .1-2.3.7-3 .1C8.6 1.2 8 2.4 8.1 3.6c1.1.1 2.3-.5 3.1-1.1Z"
      />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 18 20" width="16" height="18" aria-hidden>
      <path fill="#34A853" d="M1 18.4 10.3 10 1 1.6v16.8Z" />
      <path fill="#FBBC04" d="M13.2 12.8 10.3 10 1 18.4c.3.5.8.8 1.4.9L13.2 12.8Z" />
      <path fill="#4285F4" d="M16.5 8.3 13.2 7.2 10.3 10l2.9 2.8 3.3-1.1c.7-.4 1.1-1.1 1.1-1.7 0-.6-.4-1.3-1.1-1.7Z" />
      <path fill="#EA4335" d="M1 1.6 10.3 10l2.9-2.8L2.4.7C1.8.8 1.3 1.1 1 1.6Z" />
    </svg>
  );
}

type StoreBadgesProps = {
  tone?: "light" | "dark";
};

export function StoreBadges({ tone = "light" }: StoreBadgesProps) {
  return (
    <div className={`lp-store-badges lp-store-badges--${tone}`}>
      <a
        href={storeLinks.apple}
        className="lp-store-badge"
        target="_blank"
        rel="noopener noreferrer"
      >
        <AppleMark />
        <span>
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
        <PlayMark />
        <span>
          <small>Get it on</small>
          Google Play
        </span>
      </a>
    </div>
  );
}
