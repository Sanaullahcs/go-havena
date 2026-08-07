import { StyleSheet } from "react-native";
import { HomeTheme as T } from "./home-theme";
import { Layout } from "./tokens";
import { Fonts } from "./font";
import { sf, sw } from "../utils/responsive";

/** Community / marketplace hub — Ocean Breeze aligned. */
export const MarketplaceTheme = {
  screenBg: T.canvas,
  surface: T.white,
  navy: T.navy,
  teal: T.teal,
  deepTeal: T.deepTeal,
  mint: T.mint,
  border: T.border,
  accent: T.teal,
  accentSoft: T.mint,
  accentBorder: "rgba(20, 184, 166, 0.28)",
  text: T.navy,
  textMuted: T.gray,
  caption: "#94A3B8",
  gradient: T.navy,
  wash: T.mint,
  dealMint: { bg: T.white, border: T.border, accent: T.teal, tagBg: T.mint, tagColor: T.deepTeal },
  dealAmber: { bg: T.white, border: T.border, accent: T.teal, tagBg: T.mint, tagColor: T.navy },
  bizBlue: { bg: T.white, border: T.border, accent: T.navy },
  couponViolet: { bg: T.white, border: T.border, accent: T.navy },
};

export const exploreCategoryTheme = {
  "Deals & Offers": { soft: T.mint, border: T.border, icon: T.navy, feather: "tag", labelKey: "marketplace.dealsOffers" },
  "Local Businesses": { soft: T.mint, border: T.border, icon: T.navy, feather: "map-pin", labelKey: "marketplace.localBusinesses" },
  "My Coupons": { soft: T.mint, border: T.border, icon: T.navy, feather: "bookmark", labelKey: "marketplace.myCoupons" },
  Recommendation: { soft: T.mint, border: T.border, icon: T.navy, feather: "star", labelKey: "marketplace.recommendation" },
};

/** Item vs service — shared mint wells. */
export const listingTypeTheme = {
  item: {
    id: "item",
    label: "Item for Sale",
    shortLabel: "For Sale",
    shortLabelKey: "marketplace.forSale",
    subtitle: "Furniture, electronics & more",
    subtitleKey: "marketplace.itemSubtitle",
    soft: T.mint,
    border: T.border,
    accent: T.navy,
    accentDeep: T.navy,
    feather: "shopping-bag",
    placeholderIcon: "bag-handle-outline",
  },
  service: {
    id: "service",
    label: "Offer Service",
    shortLabel: "Service",
    shortLabelKey: "marketplace.service",
    subtitle: "Tutoring, repairs, cleaning & more",
    subtitleKey: "marketplace.serviceSubtitle",
    soft: T.mint,
    border: T.border,
    accent: T.navy,
    accentDeep: T.navy,
    feather: "tool",
    placeholderIcon: "construct-outline",
  },
};

export function getListingTypeTheme(type) {
  if (type === "service") return listingTypeTheme.service;
  return listingTypeTheme.item;
}

export const marketplaceSharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: MarketplaceTheme.screenBg,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: sw(12),
    paddingBottom: sw(28),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: sw(10),
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: MarketplaceTheme.text,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sectionLink: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: MarketplaceTheme.teal,
    fontWeight: "500",
  },
  chip: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: Layout.pillRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MarketplaceTheme.border,
    backgroundColor: MarketplaceTheme.surface,
  },
  chipActive: {
    borderColor: MarketplaceTheme.teal,
    backgroundColor: MarketplaceTheme.mint,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: MarketplaceTheme.textMuted,
    fontWeight: "500",
  },
  chipTextActive: {
    fontFamily: Fonts.semiBold,
    color: MarketplaceTheme.teal,
    fontWeight: "600",
  },
  emptyHint: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    color: MarketplaceTheme.caption,
    textAlign: "center",
    paddingVertical: sw(24),
  },
});
