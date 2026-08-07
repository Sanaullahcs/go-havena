import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

export default function PropertyHubSectionHeader({
  title,
  subtitle,
  count,
  actionLabel,
  onAction,
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleDot} />
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {count != null && Number(count) > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{count}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <View style={styles.actionRow}>
              <Text style={styles.actionText}>{actionLabel}</Text>
              <Feather name={chevronForward()} size={sf(14)} color={PropertyHubTheme.teal} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: sw(12),
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  titleBlock: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginEnd: sw(10),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleDot: {
    width: sw(4),
    height: sw(4),
    borderRadius: sw(2),
    backgroundColor: PropertyHubTheme.teal,
    marginEnd: sw(6),
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  countBadge: {
    marginStart: sw(6),
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(5),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    color: PropertyHubTheme.deepTeal,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(12),
    lineHeight: sf(16),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(4),
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: sw(2),
  },
  actionText: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    lineHeight: sf(16),
    fontWeight: "500",
    color: PropertyHubTheme.teal,
  },
  pressed: {
    opacity: 0.7,
  },
});
