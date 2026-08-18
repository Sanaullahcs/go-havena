import { HavenaAppScreenPreview } from "./HavenaAppScreenPreview";

type MobileAppMockupProps = {
  className?: string;
  alt?: string;
  size?: "default" | "hero";
};

export function MobileAppMockup({
  className = "",
  alt = "Havena mobile app home screen with notices, deals, and community widgets",
  size = "default",
}: MobileAppMockupProps) {
  const isHero = size === "hero";

  return (
    <div
      className={[
        "lp-phone-mockup",
        isHero ? "lp-phone-mockup--hero" : "lp-phone-mockup--default",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={alt}
    >
      <div className="lp-phone-mockup__frame">
        <div className="lp-phone-mockup__screen">
          <HavenaAppScreenPreview />
        </div>
      </div>
    </div>
  );
}

export default MobileAppMockup;
