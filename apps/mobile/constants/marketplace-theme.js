import { StyleSheet } from "react-native";
import { Colors, Layout } from "./tokens";
import { Fonts } from "./font";
import { sf, sw } from "../utils/responsive";

export const MarketplaceTheme = {
  screenBg: "#F4F8FD",
  surface: Colors.surface,
  accent: Colors.brandPrimaryDeep,
  accentSoft: "#D1FAF5",
  accentBorder: "rgba(20, 184, 166, 0.28)",
  text: Colors.textPrimary,
  textMuted: Colors.textSecondary,
  caption: Colors.textMuted,
  gradient: Colors.brandPrimary,
  wash: "#D1FAF5",
  dealMint: { bg: "#F0FDF9", border: "#CCFBEF", accent: "#059669" },
  dealAmber: { bg: "#FFFBEB", border: "#FEF3C7", accent: "#D97706" },
  bizBlue: { bg: "#D1FAF5", border: "rgba(20, 184, 166, 0.28)", accent: Colors.brandPrimaryDeep },
  couponViolet: { bg: "#F5F3FF", border: "#EDE9FE", accent: "#7C3AED" },
};

export const exploreCategoryTheme = {
  "Deals & Offers": { soft: "#ECFDF5", border: "#A7F3D0", icon: "#059669", feather: "tag" },
  "Local Businesses": { soft: "#D1FAF5", border: "rgba(20, 184, 166, 0.28)", icon: "#0A2A43", feather: "map-pin" },
  "My Coupons": { soft: "#FFFBEB", border: "#FDE68A", icon: "#D97706", feather: "bookmark" },
  Recommendation: { soft: "#F5F3FF", border: "#DDD6FE", icon: "#7C3AED", feather: "star" },
};

/** Item vs service — shared marketplace blue when selected. */
export const listingTypeTheme = {
  item: {
    id: "item",
    label: "Item for Sale",
    shortLabel: "For Sale",
    subtitle: "Furniture, electronics & more",
    soft: "#D1FAF5",
    border: "rgba(20, 184, 166, 0.28)",
    accent: "#0A2A43",
    accentDeep: "#0A2A43",
    feather: "shopping-bag",
    placeholderIcon: "bag-handle-outline",
  },
  service: {
    id: "service",
    label: "Offer Service",
    shortLabel: "Service",
    subtitle: "Tutoring, repairs, cleaning & more",
    soft: "#D1FAF5",
    border: "rgba(20, 184, 166, 0.28)",
    accent: "#0A2A43",
    accentDeep: "#0A2A43",
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
    fontFamily: Fonts.bold,
    fontSize: sf(15),
    lineHeight: sf(20),
    fontWeight: "700",
    color: MarketplaceTheme.text,
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: MarketplaceTheme.accent,
    fontWeight: "600",
  },
  chip: {
    paddingHorizontal: sw(14),
    paddingVertical: sw(8),
    borderRadius: Layout.pillRadius,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    borderColor: MarketplaceTheme.accent,
    backgroundColor: MarketplaceTheme.accentSoft,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: MarketplaceTheme.textMuted,
    fontWeight: "500",
  },
  chipTextActive: {
    fontFamily: Fonts.semiBold,
    color: MarketplaceTheme.accent,
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
