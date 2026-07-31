import { Platform, PixelRatio } from "react-native";
import { Colors } from "./tokens";

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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: px(4) },
    shadowOpacity: 0.08,
    shadowRadius: px(12),
    elevation: 4,
  },
  soft: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: px(2) },
    shadowOpacity: 0.06,
    shadowRadius: px(8),
    elevation: 2,
  },
  fab: {
    shadowColor: Colors.brandPrimaryDeep,
    shadowOffset: { width: 0, height: px(6) },
    shadowOpacity: 0.28,
    shadowRadius: px(14),
    elevation: 8,
  },
  ...(Platform.OS === "android"
    ? {}
    : {}),
};

/** Crisp expo-image defaults */
export const imageProps = {
  cachePolicy: "memory-disk",
  transition: 150,
  allowDownscaling: false,
};
