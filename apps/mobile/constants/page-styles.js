import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { Layout } from "./tokens";
import { sw, sf, hp } from "../utils/responsive";

export const PageType = {
  screenTitle: sf(17),
  screenTitleLine: sf(22),
  sectionLabel: sf(12),
  sectionLabelLine: sf(16),
  cardTitle: sf(14),
  cardTitleLine: sf(20),
  body: sf(12),
  bodyLine: sf(17),
  bodyMd: sf(13),
  bodyMdLine: sf(18),
  caption: sf(11),
  captionLine: sf(15),
  stat: sf(18),
  statLine: sf(22),
};

export const TAB_SCROLL_BOTTOM_PAD = sw(60);
export const SCROLL_BOTTOM_PAD = sw(24);

export const pageStyles = StyleSheet.create({
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: PageType.screenTitle,
    lineHeight: PageType.screenTitleLine,
    fontWeight: "700",
    color: "#000000",
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#6A7282",
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: PageType.sectionLabel,
    lineHeight: PageType.sectionLabelLine,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#007BFF",
    fontWeight: "700",
  },
  cardTitle: {
    fontFamily: Fonts.bold,
    fontSize: PageType.cardTitle,
    lineHeight: PageType.cardTitleLine,
    fontWeight: "700",
    color: "#000000",
  },
  body: {
    fontFamily: Fonts.regular,
    fontSize: PageType.body,
    lineHeight: PageType.bodyLine,
    color: "#4A5565",
  },
  caption: {
    fontFamily: Fonts.regular,
    fontSize: PageType.caption,
    lineHeight: PageType.captionLine,
    color: "#6A7282",
  },
  pageGutter: {
    paddingHorizontal: Layout.screenPadding,
  },
  scrollBottom: {
    paddingBottom: SCROLL_BOTTOM_PAD,
  },
  formLabel: {
    fontFamily: Fonts.medium,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#000000",
    fontWeight: "500",
  },
  input: {
    marginTop: sw(8),
    height: sw(46),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    fontFamily: Fonts.regular,
    fontSize: PageType.bodyMd,
    color: "#101828",
    backgroundColor: "#F9FAFB",
  },
  textArea: {
    marginTop: sw(8),
    minHeight: sw(96),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: sw(12),
    paddingHorizontal: sw(14),
    paddingTop: sw(12),
    fontFamily: Fonts.regular,
    fontSize: PageType.bodyMd,
    color: "#101828",
    backgroundColor: "#F9FAFB",
  },
  primaryButton: {
    height: sw(46),
    borderRadius: sw(12),
    backgroundColor: "#0052DF",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: PageType.bodyMd,
    lineHeight: PageType.bodyMdLine,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
