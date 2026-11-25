import { PixelRatio, StyleSheet } from "react-native";
import { Fonts } from "./font";
import { HomeTheme as T } from "./home-theme";
import { sw, sf, hp } from "../utils/responsive";

const HOME_BASE_WIDTH = 390;
const HOME_MIN_SCALE = 0.9;
const HOME_MAX_SCALE = 1.08;

/** Phone-sized scale. Keeps Home proportions stable on small and large devices. */
export function homeScaleForWidth(screenWidth) {
  const width = Number(screenWidth) > 0 ? Number(screenWidth) : HOME_BASE_WIDTH;
  return Math.min(HOME_MAX_SCALE, Math.max(HOME_MIN_SCALE, width / HOME_BASE_WIDTH));
}

export function homeSize(size, screenWidth) {
  return PixelRatio.roundToNearestPixel(size * homeScaleForWidth(screenWidth));
}

export const HOME_SCROLL_BOTTOM_PAD = sw(12);

export const Home = {
  gutter: sw(16),
  sectionGap: sw(14),
  sectionCardBottom: sw(2),
  radius: sw(16),
  radiusLg: sw(20),
  sectionLabel: sf(12),
  cardTitle: sf(14),
  cardBody: sf(12),
  feedCardHeight: sw(158),
  feedCardMinHeight: sw(158),
};

export function homeContentWidth(screenWidth) {
  return screenWidth - Home.gutter * 2;
}

export function homeThreeColWidth(screenWidth, gap = sw(10)) {
  return Math.floor((homeContentWidth(screenWidth) - gap * 2) / 3);
}

export const homeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scrollContent: { paddingBottom: HOME_SCROLL_BOTTOM_PAD },
  section: {
    marginHorizontal: Home.gutter,
    paddingTop: Home.sectionGap,
    paddingBottom: Home.sectionCardBottom,
  },
  sectionLast: {
    marginHorizontal: Home.gutter,
    paddingTop: Home.sectionGap,
    paddingBottom: Home.sectionCardBottom,
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: Home.sectionLabel,
    lineHeight: sf(16),
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: T.navy,
    fontWeight: "700",
  },
  sectionHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(8),
  },
  viewAll: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: T.gray,
    fontWeight: "500",
  },
  sectionArrow: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
});
