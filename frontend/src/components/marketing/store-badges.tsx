import Image from "next/image";
import { storeLinks } from "@/lib/marketing/content";

function AppleMark() {
  return (
    <span className="lp-store-badge__icon lp-store-badge__icon--apple" aria-hidden>
      <Image
        src="/marketing/store-apple.png"
        alt=""
        width={22}
        height={22}
        className="lp-store-badge__icon-img"
      />
    </span>
  );
}

function PlayMark() {
  return (
    <span className="lp-store-badge__icon lp-store-badge__icon--play" aria-hidden>
      <Image
        src="/marketing/store-google-play.png"
        alt=""
        width={20}
        height={22}
        className="lp-store-badge__icon-img"
      />
    </span>
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
