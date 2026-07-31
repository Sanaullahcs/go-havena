const MOBILE_SRC = "/landing/mobile-app-mockup.png";

export function MobileAppMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`product-mockup-phone-wrap relative w-[220px] sm:w-[240px] ${className}`}>
      <div className="product-mockup-phone rounded-[40px] border-[7px] border-[#0f172a] bg-[#0f172a] p-[6px] shadow-[0_20px_50px_-12px_rgba(0,82,223,0.35)]">
        <div className="overflow-hidden rounded-[32px] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MOBILE_SRC}
            alt="NeighborLink mobile app showing a community post and comments"
            width={750}
            height={1624}
            className="product-mockup-img block h-auto w-full"
            loading="eager"
            decoding="sync"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default MobileAppMockup;
