type HeroPhoneProps = {
  src: string;
  alt: string;
  label: string;
  position: "left" | "center" | "right";
};

export function HeroPhone({ src, alt, label, position }: HeroPhoneProps) {
  const isCenter = position === "center";

  return (
    <div className={`hero-phone hero-phone--${position}`}>
      <span
        className={`hero-phone-label ${isCenter ? "hero-phone-label-center hero-phone-label-brand" : "hero-phone-label-side"}`}
      >
        {label}
      </span>
      <div className={`hero-phone-frame ${isCenter ? "hero-phone-frame-center" : "hero-phone-frame-side"}`}>
        <div className="hero-phone-screen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={390}
            height={844}
            className="hero-phone-img"
            loading={isCenter ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default HeroPhone;
