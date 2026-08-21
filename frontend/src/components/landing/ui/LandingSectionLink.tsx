"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigateToLandingSection, scrollToLandingSection } from "@/lib/landing/scroll";

type LandingSectionLinkProps = {
  sectionId: string;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
};

export function LandingSectionLink({
  sectionId,
  className,
  children,
  onNavigate,
}: LandingSectionLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate?.();

    if (pathname === "/" || (pathname === "/plans" && sectionId === "pricing")) {
      scrollToLandingSection(sectionId);
    } else {
      navigateToLandingSection(sectionId, router);
    }
  };

  return (
    <Link href="/" className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

export default LandingSectionLink;
