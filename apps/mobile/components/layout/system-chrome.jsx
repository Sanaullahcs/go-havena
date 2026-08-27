import { Platform, StatusBar } from "react-native";
import * as SystemUI from "expo-system-ui";
import { Colors } from "../../constants/tokens";

/** Most screens — white headers and light surfaces. */
export const SYSTEM_CHROME_COLOR = "#FFFFFF";

/** Soft page background used on many stack screens. */
export const PAGE_CHROME_COLOR = "#F8FAFC";

/** Splash / welcome — matches expo-splash-screen backgroundColor. */
export const SPLASH_CHROME_COLOR = "#FFFFFF";

/** Single source of truth for status bar + window background on Android. */
export function setAppChrome({ color, barStyle, edgeToEdge = false }) {
  SystemUI.setBackgroundColorAsync(color).catch(() => {});

  if (Platform.OS !== "android") {
    return;
  }

  if (edgeToEdge) {
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor("transparent");
  } else {
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor(color);
  }

  StatusBar.setBarStyle(barStyle);
}

/** Opaque white bar — native splash, font load, and welcome screen. */
export function applySplashChrome() {
  setAppChrome({
    color: SPLASH_CHROME_COLOR,
    barStyle: "dark-content",
    edgeToEdge: false,
  });
}

/** Edge-to-edge for main app — screen background fills the status bar area. */
export function applyMainAppChrome(color = SYSTEM_CHROME_COLOR) {
  setAppChrome({
    color,
    barStyle: "dark-content",
    edgeToEdge: true,
  });
}

/** Opaque white bar — auth screens; avoids splash blue bleeding into the status area. */
export function applyOpaqueMainChrome(color = SYSTEM_CHROME_COLOR) {
  setAppChrome({
    color,
    barStyle: "dark-content",
    edgeToEdge: false,
  });
}

/** Dim overlay modals/drawers — light icons on darkened background. */
export function applyOverlayChrome() {
  setAppChrome({
    color: "#000000",
    barStyle: "light-content",
    edgeToEdge: true,
  });
}

/** Reliable top inset under edge-to-edge (Android often reports 0 briefly). */
export function getTopInset(insets) {
  const top = insets?.top ?? 0;
  if (Platform.OS === "android") {
    return Math.max(top, StatusBar.currentHeight ?? 0);
  }
  return top;
}

/** @deprecated Use getTopInset */
export function getAndroidTopInset(insets) {
  return getTopInset(insets);
}

export function getAndroidBottomInset(insets) {
  return insets?.bottom ?? 0;
}
