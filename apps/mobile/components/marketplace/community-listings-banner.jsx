import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { Feather } from "@expo/vector-icons";
import ThemedIconBox from "../ui/themed-icon-box";
import { Fonts } from "../../constants/font";
import { MarketplaceTheme } from "../../constants/marketplace-theme";
import { sf, sw } from "../../utils/responsive";

export default function CommunityListingsBanner({ onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Community Listings"
      style={styles.touch}
    >
      <View
        style={styles.banner}
      >
        <ThemedIconBox
          name="users"
          size="md"
          color="#FFFFFF"
          backgroundColor="rgba(255, 255, 255, 0.18)"
        />

        <View style={styles.textWrap}>
          <Text style={styles.title}>Community Listings</Text>
          <Text style={styles.subtitle}>Buy, sell & trade with neighbors</Text>
        </View>

        <View style={styles.arrowWrap}>
          <Feather name="arrow-right" size={sf(16)} color="#FFFFFF" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    borderRadius: sw(14),
    overflow: "hidden",
    shadowColor: MarketplaceTheme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(12),
    paddingHorizontal: sw(16),
    paddingVertical: sw(14),
    backgroundColor: MarketplaceTheme.gradient,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(18),
    color: "#FFFFFF",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: "rgba(255, 255, 255, 0.9)",
  },
  arrowWrap: {
    width: sw(30),
    height: sw(30),
    borderRadius: sw(15),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
});
