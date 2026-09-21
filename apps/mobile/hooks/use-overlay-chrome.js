import { useEffect } from "react";
import { pushOverlayChrome, popOverlayChrome } from "../components/layout/chrome-manager";

/** Keeps status bar icons visible over dimmed modal/drawer overlays. */
export default function useOverlayChrome(visible) {
  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    pushOverlayChrome();
    return () => {
      popOverlayChrome();
    };
  }, [visible]);
}
