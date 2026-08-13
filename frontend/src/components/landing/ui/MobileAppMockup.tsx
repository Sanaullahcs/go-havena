import { HavenaAppScreenPreview, type AppScreenVariant } from "./HavenaAppScreenPreview";

type MobileAppMockupProps = {
  className?: string;
  alt?: string;
  size?: "default" | "hero" | "sm";
  variant?: AppScreenVariant;
  tilt?: "none" | "left" | "right";
  glow?: boolean;
};

const ALT_BY_VARIANT: Record<AppScreenVariant, string> = {
  home: "Havena mobile home screen with notices and deals",
  feed: "Havena community feed with neighbor posts",
  marketplace: "Havena local deals and marketplace screen",
  wellness: "Havena wellness courses and streak tracking",
};

export function MobileAppMockup({
  className = "",
  alt,
  size = "default",
  variant = "home",
  tilt = "none",
  glow = false,
}: MobileAppMockupProps) {
  return (
    <div
      className={[
        "lp-phone-mockup",
        size === "hero" ? "lp-phone-mockup--hero" : "",
        size === "sm" ? "lp-phone-mockup--sm" : "",
        size === "default" ? "lp-phone-mockup--default" : "",
        tilt === "left" ? "lp-phone-mockup--tilt-left" : "",
        tilt === "right" ? "lp-phone-mockup--tilt-right" : "",
        glow ? "lp-phone-mockup--glow" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={alt ?? ALT_BY_VARIANT[variant]}
    >
      <div className="lp-phone-mockup__frame">
        <div className="lp-phone-mockup__screen">
          <HavenaAppScreenPreview variant={variant} />
        </div>
      </div>
    </div>
  );
}

export default MobileAppMockup;
