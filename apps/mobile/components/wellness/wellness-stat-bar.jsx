import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { WELLNESS_STAT_THEMES, WellnessTheme } from "../../constants/wellness-theme";
import { sf, sw } from "../../utils/responsive";

const ICON_BOX = sw(36);

function StatItem({ themeKey, label, value }) {
  const theme = WELLNESS_STAT_THEMES[themeKey] ?? WELLNESS_STAT_THEMES.courses;

  return (
    <View style={styles.item}>
      <View style={[styles.iconWrap, { backgroundColor: theme.soft }]}>
        <Feather name={theme.icon} size={sf(16)} color={theme.color} />
      </View>
      <Text style={[styles.value, { color: theme.color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Hub summary row — icon, value, label (always visible when stats provided). */
export default function WellnessStatBar({ stats = [] }) {
  return (
    <View style={styles.bar}>
      {stats.map((item) => (
        <StatItem
          key={item.key}
          themeKey={item.key}
          label={item.label}
          value={item.value}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: sw(14),
    paddingBottom: sw(12),
    paddingHorizontal: sw(14),
    backgroundColor: WellnessTheme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  item: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: sw(4),
  },
  iconWrap: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: sw(10),
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: Fonts.bold,
    fontSize: sf(17),
    lineHeight: sf(22),
    fontWeight: "700",
    marginTop: sw(8),
    textAlign: "center",
    includeFontPadding: false,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(9),
    lineHeight: sf(12),
    fontWeight: "500",
    color: WellnessTheme.textMuted,
    marginTop: sw(3),
    textAlign: "center",
    includeFontPadding: false,
  },
});
