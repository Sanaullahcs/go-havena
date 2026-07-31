import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { marketplaceSharedStyles, MarketplaceTheme } from "../../constants/marketplace-theme";
import { sw } from "../../utils/responsive";

export default function MarketplaceSectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={marketplaceSharedStyles.sectionHeader}>
      <View style={styles.titleRow}>
        <View style={styles.accent} />
        <Text style={marketplaceSharedStyles.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} activeOpacity={0.7}>
          <Text style={marketplaceSharedStyles.sectionLink}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(8),
    flex: 1,
  },
  accent: {
    width: sw(3),
    height: sw(16),
    borderRadius: sw(2),
    backgroundColor: MarketplaceTheme.accent,
  },
});
