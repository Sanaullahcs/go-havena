import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import WellnessProgressBar from "./wellness-progress-bar";
import { sf, sw } from "../../utils/responsive";

function StatChip({ icon, label, color, bg }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Feather name={icon} size={sf(12)} color={color} />
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Course overview — flat white card, soft accent chips. */
export default function WellnessCourseSummary({
  categoryKey,
  description,
  durationMin = 0,
  lessonCount = 0,
  progress = 0,
}) {
  const meta = getWellnessCategoryMeta(categoryKey);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <View style={styles.card}>
      <Text style={styles.description} numberOfLines={3}>
        {description || "Explore lessons at your own pace."}
      </Text>

      <View style={styles.chipRow}>
        {durationMin > 0 ? (
          <StatChip
            icon="clock"
            label={`${durationMin} min`}
            color={meta.color}
            bg={meta.bg}
          />
        ) : null}
        {lessonCount > 0 ? (
          <StatChip
            icon="layers"
            label={`${lessonCount} lessons`}
            color={meta.color}
            bg={meta.bg}
          />
        ) : null}
        <StatChip
          icon="trending-up"
          label={`${pct}% done`}
          color={meta.color}
          bg={meta.bg}
        />
      </View>

      <WellnessProgressBar
        categoryKey={categoryKey}
        progress={pct}
        height={4}
        style={styles.bar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WellnessTheme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    padding: sw(16),
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: sf(13),
    lineHeight: sf(20),
    color: WellnessTheme.textMuted,
    includeFontPadding: false,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: sw(14),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: sw(6),
    paddingHorizontal: sw(10),
    borderRadius: 999,
    marginRight: sw(8),
    marginBottom: sw(4),
  },
  chipText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(10),
    lineHeight: sf(14),
    fontWeight: "600",
    marginLeft: sw(5),
    includeFontPadding: false,
  },
  bar: {
    marginTop: sw(10),
  },
});
