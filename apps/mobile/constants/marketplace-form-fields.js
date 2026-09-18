import { Platform } from "react-native";
import { Fonts } from "./font";
import { MarketplaceType } from "./marketplace-type";

/** Shared Create Deal / Add Menu input chrome. Height stays 40. */
export const MARKETPLACE_FIELD_HEIGHT = 40;

/**
 * Single-line marketplace inputs.
 * Avoid lineHeight on iOS TextInput — it shifts the caret/placeholder off-center.
 */
export const marketplaceFieldInput = {
  height: MARKETPLACE_FIELD_HEIGHT,
  borderRadius: 10,
  backgroundColor: "rgba(249, 250, 251, 1)",
  borderWidth: 1,
  borderColor: "#EEF2F6",
  paddingHorizontal: 16,
  paddingTop: 0,
  paddingBottom: 0,
  fontFamily: Fonts.regular,
  fontSize: MarketplaceType.body,
  color: "#111827",
  ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
};

const TEXTAREA_MIN_HEIGHT = 100;

/** Multiline description: top-left placeholder and text, first line unclipped. */
export const marketplaceTextArea = {
  minHeight: TEXTAREA_MIN_HEIGHT,
  maxHeight: 160,
  borderRadius: 10,
  backgroundColor: "rgba(249, 250, 251, 1)",
  borderWidth: 1,
  borderColor: "#EEF2F6",
  paddingHorizontal: 16,
  paddingTop: 12,
  paddingBottom: 12,
  fontFamily: Fonts.regular,
  fontSize: MarketplaceType.body,
  color: "#111827",
  ...(Platform.OS === "android"
    ? { includeFontPadding: false, textAlignVertical: "top", lineHeight: MarketplaceType.bodyLine }
    : null),
};
