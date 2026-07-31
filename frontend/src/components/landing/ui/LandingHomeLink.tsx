"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { scrollToLandingTop } from "@/lib/landing/scroll";

type LandingHomeLinkProps = {
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  onNavigate?: () => void;
};

export function LandingHomeLink({
  className,
  children,
  ariaLabel = "NeighborLink home",
  onNavigate,
}: LandingHomeLinkProps) {
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onNavigate?.();

    if (pathname === "/") {
      e.preventDefault();
      scrollToLandingTop();
    }
  };

  return (
    <Link href="/" aria-label={ariaLabel} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

export default LandingHomeLink;
