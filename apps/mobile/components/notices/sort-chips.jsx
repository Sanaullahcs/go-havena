import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { sf, sw } from "../../utils/responsive";

const OPTIONS = [
  { id: "relevant", labelKey: "notices.sortSuggested" },
  { id: "newest", labelKey: "notices.sortNewest" },
  { id: "oldest", labelKey: "notices.sortOldest" },
  { id: "schedule", labelKey: "notices.sortByDate" },
];

export default function NoticeSortChips({ value, onChange, contentStyle }) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      style={styles.list}
      contentContainerStyle={[styles.row, contentStyle]}
    >
      {OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {t(option.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    gap: sw(8),
    alignItems: "center",
  },
  chip: {
    paddingVertical: sw(6),
    paddingHorizontal: sw(12),
    borderRadius: sw(999),
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipActive: {
    backgroundColor: "#1B4F8A",
    borderColor: "#1B4F8A",
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: sf(12),
    color: "#364153",
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
