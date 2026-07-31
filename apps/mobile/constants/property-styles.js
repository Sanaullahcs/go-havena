import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { Layout } from "./tokens";
import { PageType, SCROLL_BOTTOM_PAD } from "./page-styles";
import { sw, sf } from "../utils/responsive";

export const Property = {
  gutter: Layout.screenPadding,
  gridGap: sw(10),
  cardRadius: sw(12),
  sectionPad: sw(16),
};

export function twoColumnWidth(screenWidth, gutter = Property.gutter, gap = Property.gridGap) {
  const content = screenWidth - gutter * 2;
  return Math.floor((content - gap) / 2);
}

export const propertyStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  screenMuted: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: {
    paddingHorizontal: Property.gutter,
    paddingTop: Property.sectionPad,
    paddingBottom: SCROLL_BOTTOM_PAD,
  },
  section: { marginBottom: sw(20) },
  sectionBlock: {
    paddingVertical: Property.sectionPad,
    paddingHorizontal: Property.gutter,
    borderBottomWidth: sw(8),
    borderBottomColor: "#F9FAFB",
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(24),
    color: "#101828",
    fontWeight: "700",
  },
  sectionTitleSm: {
    fontFamily: Fonts.bold,
    fontSize: PageType.cardTitle,
    lineHeight: PageType.cardTitleLine,
    color: "#101828",
    fontWeight: "700",
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: PageType.body,
    lineHeight: PageType.bodyLine,
    color: "#364153",
  },
  caption: {
    fontFamily: Fonts.regular,
    fontSize: PageType.caption,
    lineHeight: PageType.captionLine,
    color: "#6A7282",
  },
  headerBar: {
    paddingVertical: sw(10),
    paddingHorizontal: Property.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Property.gridGap },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: Property.cardRadius,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  cardPad: { padding: sw(14) },
  primaryBtn: {
    paddingVertical: sw(14),
    borderRadius: sw(12),
    backgroundColor: "#0052DF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  secondaryBtn: {
    paddingVertical: sw(14),
    borderRadius: sw(12),
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  secondaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#101828",
    fontWeight: "700",
  },
});
