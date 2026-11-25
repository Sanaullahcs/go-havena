import { Dimensions, Platform, StatusBar } from "react-native";
import * as SystemUI from "expo-system-ui";

/** Most screens — white headers and light surfaces. */
export const SYSTEM_CHROME_COLOR = "#FFFFFF";

/** Soft page background used on many stack screens. */
export const PAGE_CHROME_COLOR = "#F8FAFC";

/** Splash / welcome — matches expo-splash-screen backgroundColor. */
export const SPLASH_CHROME_COLOR = "#FFFFFF";

let statusBarTranslucent = true;

/** Single source of truth for status bar + window background on Android. */
export function setAppChrome({ color, barStyle, edgeToEdge = false }) {
  SystemUI.setBackgroundColorAsync(color).catch(() => {});

  if (Platform.OS !== "android") {
    return;
  }

  // React Native 0.88 removed StatusBar.setTranslucent and setBackgroundColor.
  // Android stays edge-to-edge, so the inset fallback must stay on. The window
  // background set above still fills the status-bar area.
  const canControlAndroidBar =
    typeof StatusBar.setTranslucent === "function" &&
    typeof StatusBar.setBackgroundColor === "function";
  if (canControlAndroidBar) {
    statusBarTranslucent = edgeToEdge;
    if (edgeToEdge) {
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor("transparent");
    } else {
      StatusBar.setTranslucent(false);
      StatusBar.setBackgroundColor(color);
    }
  } else {
    statusBarTranslucent = true;
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

/**
 * Reliable top inset under edge-to-edge (Android often reports 0 briefly).
 * When the window already starts below the status bar (opaque bar, or edge-to-edge
 * not in effect), no fallback is added — otherwise headers get a double gap.
 */
export function getTopInset(insets) {
  const top = insets?.top ?? 0;
  if (Platform.OS !== "android" || top > 0 || !statusBarTranslucent) {
    return top;
  }

  const statusBarHeight = StatusBar.currentHeight ?? 0;
  const window = Dimensions.get("window");
  const screen = Dimensions.get("screen");
  const windowBelowStatusBar = screen.height - window.height >= statusBarHeight - 1;

  return windowBelowStatusBar ? 0 : statusBarHeight;
}

/** @deprecated Use getTopInset */
export function getAndroidTopInset(insets) {
  return getTopInset(insets);
}

export function getAndroidBottomInset(insets) {
  return insets?.bottom ?? 0;
}
