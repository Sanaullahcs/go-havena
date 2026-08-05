import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

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
              <Feather name="chevron-right" size={sf(14)} color={PropertyHubTheme.teal} />
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
    marginBottom: sw(10),
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
    marginRight: sw(10),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: PropertyHubTheme.text,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  countBadge: {
    marginLeft: sw(6),
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(5),
    borderRadius: sw(9),
    backgroundColor: PropertyHubTheme.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    fontWeight: "600",
    color: PropertyHubTheme.teal,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(3),
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
