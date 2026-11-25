import { StyleSheet } from "react-native";
import { Fonts } from "./font";
import { sw, sf } from "../utils/responsive";

export const internalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  headerWrap: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: sw(18),
    paddingVertical: sw(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  scroll: {
    paddingHorizontal: sw(18),
    paddingTop: sw(14),
    paddingBottom: sw(32),
  },
  section: {
    marginBottom: sw(18),
  },
  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(14),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#6A7282",
    fontWeight: "700",
    marginBottom: sw(8),
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    color: "#101828",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: sw(14),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  cardPad: {
    padding: sw(12),
  },
});

export const internalType = {
  rowTitle: sf(14),
  rowSub: sf(12),
  statValue: sf(22),
  heroValue: sf(32),
};
