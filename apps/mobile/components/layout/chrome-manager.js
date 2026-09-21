import {
  applyMainAppChrome,
  applyOpaqueMainChrome,
  applyOverlayChrome,
  applySplashChrome,
  SPLASH_CHROME_COLOR,
  SYSTEM_CHROME_COLOR,
} from "./system-chrome";

/** @typedef {{ color: string, barStyle: 'light-content' | 'dark-content', expoStyle: 'light' | 'dark' | 'auto', edgeToEdge: boolean, variant?: 'splash' | 'main' }} ScreenChromeConfig */

/** @type {ScreenChromeConfig} */
let activeScreenChrome = {
  color: SYSTEM_CHROME_COLOR,
  barStyle: "dark-content",
  expoStyle: "dark",
  edgeToEdge: true,
  variant: "main",
};

let overlayDepth = 0;

function applyConfig(config) {
  if (config.variant === "splash") {
    applySplashChrome();
    return;
  }

  if (config.edgeToEdge) {
    applyMainAppChrome(config.color);
    return;
  }

  applyOpaqueMainChrome(config.color);
}

/** Call before navigating to an auth screen so chrome updates before the transition. */
export function prepareAuthScreenChrome(color = SYSTEM_CHROME_COLOR) {
  registerScreenChrome({
    color,
    barStyle: "dark-content",
    expoStyle: "dark",
    edgeToEdge: false,
    variant: "main",
  });
}

/** Called by ScreenStatusBar when a screen mounts or changes chrome. */
export function registerScreenChrome(config) {
  activeScreenChrome = { ...activeScreenChrome, ...config };
  if (overlayDepth === 0) {
    applyConfig(activeScreenChrome);
  }
}

export function pushOverlayChrome() {
  overlayDepth += 1;
  if (overlayDepth === 1) {
    applyOverlayChrome();
  }
}

export function popOverlayChrome() {
  overlayDepth = Math.max(0, overlayDepth - 1);
  if (overlayDepth === 0) {
    applyConfig(activeScreenChrome);
  }
}

export function isOverlayChromeActive() {
  return overlayDepth > 0;
}

export function getActiveScreenChrome() {
  return activeScreenChrome;
}

export { SPLASH_CHROME_COLOR, SYSTEM_CHROME_COLOR };
