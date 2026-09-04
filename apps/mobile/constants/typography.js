import { Platform, PixelRatio } from "react-native";
import { Colors } from "./tokens";
import { rnShadow } from "../utils/shadow";


/** Figma base frame width */
export const FIGMA_WIDTH = 390;

export const Type = {
  /** Section labels: COMMUNITY FEED, DEAL CORNER */
  section: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  heroBadge: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  captionBold: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  chip: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
};

/** Snap dimensions to physical pixels — reduces blur on Android */
export function px(value) {
  return PixelRatio.roundToNearestPixel(value);
}

/** Scale a Figma value to the current screen width */
export function scale(size, screenWidth) {
  return px(size * (screenWidth / FIGMA_WIDTH));
}

export const NativeShadow = {
  card: {
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: px(4) }, opacity: 0.08, radius: px(12) }),
    elevation: 4,
  },
  soft: {
    ...rnShadow({ color: "#0F172A", offset: { width: 0, height: px(2) }, opacity: 0.06, radius: px(8) }),
    elevation: 2,
  },
  fab: {
    ...rnShadow({ color: Colors.brandPrimaryDeep, offset: { width: 0, height: px(6) }, opacity: 0.28, radius: px(14) }),
    elevation: 8,
  },
  ...(Platform.OS === "android"
    ? {}
    : {}),
};

/** Crisp expo-image defaults — no fade, so cached photos do not flicker on re-render. */
export const imageProps = {
  cachePolicy: "memory-disk",
  transition: 0,
  allowDownscaling: true,
};
