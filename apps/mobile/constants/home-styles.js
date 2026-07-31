import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { Colors } from "./tokens";
import { sw, sf, hp } from "../utils/responsive";

/** Modest scroll bottom pad — breathing room above floating nav, not a large void. */
export const HOME_SCROLL_BOTTOM_PAD = sw(32);

export const Home = {
  gutter: sw(18),
  sectionGap: hp(0.45),
  sectionCardBottom: hp(0.25),
  heroHeight: hp(11.5),
  heroTitle: sf(14),
  heroLine: sf(18),
  sectionLabel: sf(12),
  cardTitle: sf(14),
  cardBody: sf(12),
  dealImageH: hp(10),
  /** Fixed home feed carousel card: header + body row + like/comment footer. */
  feedCardHeight: sw(148),
  feedCardMinHeight: sw(148),
};

export const homeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  /** Modest bottom pad on tab home feed scroll content. */
  scrollContent: { paddingBottom: HOME_SCROLL_BOTTOM_PAD },
  section: {
    marginHorizontal: Home.gutter,
    paddingTop: Home.sectionGap,
    paddingBottom: Home.sectionCardBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
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
    color: Colors.brandPrimary,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: hp(0.25),
  },
  sectionArrow: {
    width: sw(28),
    height: sw(28),
    borderRadius: sw(14),
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
});
