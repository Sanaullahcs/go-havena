import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { HomeTheme } from "./home-theme";
import { sw, sf, hp, SCREEN_WIDTH } from "../utils/responsive";

export const HOME_SCROLL_BOTTOM_PAD = sw(96);

export const HomeBreakpoints = {
  narrow: SCREEN_WIDTH < 360,
  compact: SCREEN_WIDTH < 390,
};

export const Home = {
  gutter: HomeBreakpoints.narrow ? sw(14) : sw(18),
  sectionGap: hp(0.75),
  sectionCardBottom: hp(0.15),
  gap: HomeBreakpoints.narrow ? sw(8) : sw(10),
  radius: sw(16),
  radiusLg: sw(20),
  sectionLabel: sf(12),
  cardTitle: sf(14),
  cardBody: sf(12),
  feedCardHeight: HomeBreakpoints.narrow ? sw(156) : sw(168),
  feedCardMinHeight: HomeBreakpoints.narrow ? sw(156) : sw(168),
};

export function homeContentWidth(screenWidth = SCREEN_WIDTH) {
  return screenWidth - Home.gutter * 2;
}

export function homeTwoColWidth(screenWidth = SCREEN_WIDTH, gap = Home.gap) {
  return Math.floor((homeContentWidth(screenWidth) - gap) / 2);
}

export function homeThreeColWidth(screenWidth = SCREEN_WIDTH, gap = Home.gap) {
  return Math.floor((homeContentWidth(screenWidth) - gap * 2) / 3);
}

export const homeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HomeTheme.pageBg },
  scrollContent: {
    paddingBottom: HOME_SCROLL_BOTTOM_PAD,
    paddingTop: sw(4),
  },
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
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: HomeTheme.deepNavy,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(12),
    gap: sw(8),
  },
  viewAll: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: HomeTheme.mediumGray,
    fontWeight: "500",
  },
  sectionArrow: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#E8F8F6",
    borderWidth: 1,
    borderColor: HomeTheme.lightBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: sw(6),
    marginTop: sw(12),
  },
  dot: {
    width: sw(7),
    height: sw(7),
    borderRadius: sw(4),
    backgroundColor: "rgba(10, 42, 67, 0.18)",
  },
  dotActive: {
    width: sw(18),
    backgroundColor: HomeTheme.primaryTeal,
  },
});
