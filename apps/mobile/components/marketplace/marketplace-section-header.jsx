import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { marketplaceSharedStyles, MarketplaceTheme } from "../../constants/marketplace-theme";
import { sf } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

export default function MarketplaceSectionHeader({ title, subtitle, actionLabel, onAction }) {
  return (
    <View style={marketplaceSharedStyles.sectionHeader}>
      <View style={styles.titleBlock}>
        <Text style={marketplaceSharedStyles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
          <View style={styles.actionRow}>
            <Text style={marketplaceSharedStyles.sectionLink}>{actionLabel}</Text>
            <Feather name={chevronForward()} size={sf(14)} color={MarketplaceTheme.teal} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginEnd: 8,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: MarketplaceTheme.textMuted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
