import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { Layout } from "./tokens";
import { rnShadow } from "../utils/shadow";


export const ProfileLayout = {
  gutter: Layout.screenPadding,
  sectionGap: 18,
  cardRadius: 16,
};

/** Soft premium card elevation (iOS shadow + Android elevation). */
export const cardShadow = {
  ...rnShadow({ color: "#0F172A", offset: { width: 0, height: 6 }, opacity: 0.08, radius: 16 }),
  elevation: 4,
};

export const profileStyles = StyleSheet.create({
  section: {
    marginBottom: ProfileLayout.sectionGap,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: "#0F172A",
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionAction: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: "#1B4F8A",
    fontWeight: "700",
    flexShrink: 0,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: ProfileLayout.cardRadius,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    overflow: "hidden",
  },
});
