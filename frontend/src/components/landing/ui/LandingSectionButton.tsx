"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, type ButtonProps } from "./Button";
import { navigateToLandingSection, scrollToLandingSection } from "@/lib/landing/scroll";

type LandingSectionButtonProps = Omit<ButtonProps, "href" | "onClick" | "link"> & {
  sectionId: string;
};

export function LandingSectionButton({ sectionId, ...props }: LandingSectionButtonProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (pathname === "/") {
      scrollToLandingSection(sectionId);
    } else {
      navigateToLandingSection(sectionId, router);
    }
  };

  return <Button href="/" link={false} onClick={handleClick} {...props} />;
}

export default LandingSectionButton;
