import { MobileAppMockup } from "./MobileAppMockup";
import type { AppScreenVariant } from "./HavenaAppScreenPreview";

type PhoneMockupFanProps = {
  className?: string;
  centerVariant?: AppScreenVariant;
  leftVariant?: AppScreenVariant;
  rightVariant?: AppScreenVariant;
};

/** Three-phone fan layout — center hero phone with tilted side screens. */
export function PhoneMockupFan({
  className = "",
  centerVariant = "home",
  leftVariant = "marketplace",
  rightVariant = "wellness",
}: PhoneMockupFanProps) {
  return (
    <div className={["lp-mockup-fan", className].filter(Boolean).join(" ")}>
      <div className="lp-mockup-fan__glow" aria-hidden="true" />
      <MobileAppMockup
        variant={leftVariant}
        size="sm"
        tilt="left"
        className="lp-mockup-fan__phone lp-mockup-fan__phone--left"
      />
      <MobileAppMockup
        variant={centerVariant}
        size="hero"
        glow
        className="lp-mockup-fan__phone lp-mockup-fan__phone--center"
      />
      <MobileAppMockup
        variant={rightVariant}
        size="sm"
        tilt="right"
        className="lp-mockup-fan__phone lp-mockup-fan__phone--right"
      />
      <div className="lp-mockup-fan__chip lp-mockup-fan__chip--feed" aria-hidden="true">
        Live feed
      </div>
      <div className="lp-mockup-fan__chip lp-mockup-fan__chip--sync" aria-hidden="true">
        Synced
      </div>
    </div>
  );
}

export default PhoneMockupFan;
