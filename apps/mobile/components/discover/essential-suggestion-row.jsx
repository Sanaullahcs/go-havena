import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { HomeTheme as T } from "../../constants/home-theme";
import { Fonts } from "../../constants/font";
import { listingCategoryLabel } from "./category-picker";
import { statusBadgeStyle, statusLabel, suggestionSubtitle } from "../../utils/discover-suggestion-display";
import { sf, sw } from "../../utils/responsive";

const SECTION_ICONS = {
  health: "pulse-outline",
  burial: "flower-outline",
  parking: "car-outline",
  clubs: "people-outline",
  food: "restaurant-outline",
  restaurants: "restaurant-outline",
  shopping: "bag-handle-outline",
};

export default function EssentialSuggestionRow({ item, t, now, divider, onPress }) {
  const badge = statusBadgeStyle(statusLabel, item.status, t, styles);
  const iconKey = item.essential_section || item.category || "parking";

  const body = (
    <>
      <View style={styles.resourceIcon}>
        <Ionicons
          name={SECTION_ICONS[iconKey] || "location-outline"}
          size={sf(20)}
          color={T.deepTeal}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.resourceName} numberOfLines={1}>
          {item.name || t("topBar.reportUpdate")}
        </Text>
        <Text style={styles.resourceMeta} numberOfLines={1}>
          {suggestionSubtitle(item, t, now)}
        </Text>
      </View>
      <View style={badge.wrap}>
        <Text style={badge.text} numberOfLines={1}>
          {badge.label}
        </Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={sf(18)} color="#C5CDD6" /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.row, divider && styles.rowDivider]}
        android_ripple={{ color: "#F1F5F9" }}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.row, divider && styles.rowDivider]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
    backgroundColor: T.white,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F4" },
  resourceIcon: {
    width: sw(44),
    height: sw(44),
    borderRadius: sw(12),
    backgroundColor: T.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  resourceName: { fontFamily: Fonts.semiBold, fontSize: sf(15), color: "#0B1220" },
  resourceMeta: { marginTop: 3, fontFamily: Fonts.regular, fontSize: sf(12), color: "#9CA3AF" },
  badgePending: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFEDD5",
    maxWidth: sw(110),
  },
  badgePendingText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#C2410C" },
  badgeApproved: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    maxWidth: sw(110),
  },
  badgeApprovedText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#15803D" },
  badgeRejected: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    maxWidth: sw(110),
  },
  badgeRejectedText: { fontFamily: Fonts.semiBold, fontSize: sf(11), color: "#B91C1C" },
});
