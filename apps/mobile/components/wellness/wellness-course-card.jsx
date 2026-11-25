import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { getWellnessCategoryMeta, WellnessTheme } from "../../constants/wellness-theme";
import WellnessCategoryIcon from "./wellness-category-icon";
import WellnessProgressBar from "./wellness-progress-bar";
import { sf, sw } from "../../utils/responsive";
import { chevronForward } from "../../utils/rtl";

/** Separate course card — white surface, rounded border, chevron aligned right. */
export default function WellnessCourseCard({
  categoryKey,
  title,
  lessonCount = 0,
  durationMin = 0,
  progressPercent = 0,
  onPress,
}) {
  const { t } = useTranslation();
  const meta = getWellnessCategoryMeta(categoryKey);
  const progress = Math.min(100, Math.max(0, progressPercent));
  const done = progress >= 100;

  const metaParts = [];
  if (lessonCount > 0) metaParts.push(t("wellness.lessonCount", { count: lessonCount }));
  if (durationMin > 0) metaParts.push(t("wellness.minDuration", { minutes: durationMin }));

  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        style={styles.row}
      >
        <WellnessCategoryIcon categoryKey={categoryKey} size={sw(40)} />

        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[styles.percent, { color: meta.color }]}>
              {done ? t("common.done") : `${progress}%`}
            </Text>
          </View>

          {metaParts.length ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}

          <WellnessProgressBar
            categoryKey={categoryKey}
            progress={progress}
            height={4}
            style={styles.bar}
          />
        </View>

        <View style={styles.chevronSlot}>
          <Feather name={chevronForward()} size={sf(18)} color="#94A3B8" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WellnessTheme.border,
    marginBottom: sw(12),
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: sw(14),
    paddingVertical: sw(14),
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginStart: sw(12),
    marginEnd: sw(8),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.semiBold,
    fontSize: sf(13),
    lineHeight: sf(18),
    fontWeight: "600",
    color: WellnessTheme.text,
    marginEnd: sw(8),
  },
  percent: {
    fontFamily: Fonts.bold,
    fontSize: sf(11),
    lineHeight: sf(16),
    fontWeight: "700",
    flexShrink: 0,
  },
  meta: {
    fontFamily: Fonts.regular,
    fontSize: sf(11),
    lineHeight: sf(15),
    color: WellnessTheme.caption,
    marginTop: sw(3),
  },
  bar: {
    marginTop: sw(8),
  },
  chevronSlot: {
    width: sw(20),
    height: sw(20),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
