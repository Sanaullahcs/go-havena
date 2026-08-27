import { StatusBar } from "expo-status-bar";
import { useCallback, useLayoutEffect } from "react";
import { useFocusEffect } from "expo-router";
import { registerScreenChrome, isOverlayChromeActive } from "./chrome-manager";
import {
  applySplashChrome,
  SPLASH_CHROME_COLOR,
  SYSTEM_CHROME_COLOR,
} from "./system-chrome";

function ChromeOnFocus({ applyChrome }) {
  useFocusEffect(
    useCallback(() => {
      applyChrome();
    }, [applyChrome]),
  );
  return null;
}

/**
 * Per-screen status bar. Registers chrome so modals can restore it on close.
 * variant="splash" for welcome/splash routes only.
 * opaque={true} for auth screens — solid white status bar, no splash bleed.
 */
export default function ScreenStatusBar({
  style = "dark",
  variant = "main",
  opaque = false,
  reapplyOnFocus = true,
  androidBackgroundColor = SYSTEM_CHROME_COLOR,
}) {
  const applyChrome = useCallback(() => {
    if (variant === "splash") {
      applySplashChrome();
      registerScreenChrome({
        color: SPLASH_CHROME_COLOR,
        barStyle: "dark-content",
        expoStyle: "dark",
        edgeToEdge: false,
        variant: "splash",
      });
      return;
    }

    registerScreenChrome({
      color: androidBackgroundColor,
      barStyle: style === "light" ? "light-content" : "dark-content",
      expoStyle: style,
      edgeToEdge: !opaque,
      variant: "main",
    });
  }, [style, androidBackgroundColor, variant, opaque]);

  useLayoutEffect(() => {
    applyChrome();
  }, [applyChrome]);

  const shouldReapplyOnFocus = reapplyOnFocus && variant !== "splash";

  if (isOverlayChromeActive()) {
    return shouldReapplyOnFocus ? <ChromeOnFocus applyChrome={applyChrome} /> : null;
  }

  return (
    <>
      {shouldReapplyOnFocus ? <ChromeOnFocus applyChrome={applyChrome} /> : null}
      <StatusBar style={variant === "splash" ? "dark" : style} />
    </>
  );
}

export { SPLASH_CHROME_COLOR, SYSTEM_CHROME_COLOR };
