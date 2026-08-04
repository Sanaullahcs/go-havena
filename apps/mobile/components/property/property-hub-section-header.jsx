import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { Colors } from "../../constants/tokens";
import { PropertyHubTheme } from "../../constants/property-management-theme";
import { sf, sw } from "../../utils/responsive";

/** Section title row with optional count badge and "See all" action. */
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
            style={({ pressed }) => [styles.actionPress, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <View style={styles.actionRow}>
              <Text style={styles.actionText}>{actionLabel}</Text>
              <View style={styles.iconWrap}>
                <Feather name="chevron-right" size={sf(14)} color={Colors.brandPrimaryDeep} />
              </View>
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
    fontFamily: Fonts.bold,
    fontSize: sf(14),
    lineHeight: sf(19),
    fontWeight: "700",
    color: PropertyHubTheme.text,
    flexShrink: 1,
  },
  countBadge: {
    marginLeft: sw(6),
    minWidth: sw(18),
    height: sw(18),
    paddingHorizontal: sw(5),
    borderRadius: sw(9),
    backgroundColor: "#D1FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: Fonts.bold,
    fontSize: sf(10),
    fontWeight: "700",
    color: Colors.brandPrimaryDeep,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: sf(10),
    lineHeight: sf(14),
    color: PropertyHubTheme.textMuted,
    marginTop: sw(2),
  },
  actionPress: {
    flexGrow: 0,
    flexShrink: 0,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionText: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(15),
    fontWeight: "700",
    color: Colors.brandPrimaryDeep,
    includeFontPadding: false,
  },
  iconWrap: {
    width: sw(14),
    height: sw(14),
    marginLeft: sw(1),
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
});
