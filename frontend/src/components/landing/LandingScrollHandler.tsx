"use client";

import { useEffect } from "react";
import { consumePendingLandingScroll, handleLegacyHashScroll } from "@/lib/landing/scroll";

export function LandingScrollHandler() {
  useEffect(() => {
    handleLegacyHashScroll();
    consumePendingLandingScroll();
  }, []);

  return null;
}

export default LandingScrollHandler;
